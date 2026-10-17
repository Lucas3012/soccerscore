import { db, ensureSchema, q, run } from "./db";
import { findLiveMatch, fixtureFromLive, fetchResultsMap, type FeedResult } from "./live/flashscore";
import { MAX_SELECTIONS, MIN_STAKE_CENTS } from "./money";
import { evaluateScoreOnly, evaluateSelection, findSelection } from "./odds/markets";
import { getFixtureById, getMatchStats } from "./sports";
import { dateKeyOf, MATCH_SETTLE_MINUTES } from "./time";
import type { Fixture, MatchStats, StoredSelection } from "./types";

export type ValidatedItem = StoredSelection & { key: string };

/** Fixture reconstructed from a stored bet selection (live matches). */
function fixtureFromStored(item: StoredSelection): Fixture {
  const kickoff = item.kickoff ?? Date.now();
  return {
    id: item.matchId,
    leagueId: `fs:${item.leagueName}`,
    leagueName: item.leagueName,
    country: "",
    flag: "🌍",
    region: "mundo",
    date: dateKeyOf(new Date(kickoff)),
    home: item.home,
    away: item.away,
    kickoff,
    slot: "",
  };
}

/** Revalidates a slip against the deterministic odds engine. */
export async function validateSlip(
  input: unknown,
): Promise<{ ok: true; items: ValidatedItem[] } | { ok: false; error: string }> {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, error: "Cupom vazio." };
  }
  if (input.length > MAX_SELECTIONS) {
    return { ok: false, error: `Máximo de ${MAX_SELECTIONS} seleções por aposta.` };
  }

  const now = Date.now();
  const seenMatches = new Set<string>();
  const items: ValidatedItem[] = [];

  for (const raw of input) {
    if (typeof raw !== "object" || raw === null) {
      return { ok: false, error: "Seleção inválida." };
    }
    const record = raw as Record<string, unknown>;
    const matchId = String(record.matchId ?? "");
    const selectionId = String(record.selectionId ?? "");

    // Matches from the live feed (Flashscore) can be bet while they are live.
    let fixture: Fixture;
    if (matchId.startsWith("fs-")) {
      const live = await findLiveMatch(matchId);
      if (!live) {
        return { ok: false, error: "Esta partida não está mais ao vivo — remova a seleção." };
      }
      fixture = fixtureFromLive(live);
    } else {
      const catalog = getFixtureById(matchId);
      if (!catalog) {
        return { ok: false, error: "Partida não encontrada no catálogo." };
      }
      if (catalog.kickoff <= now) {
        return { ok: false, error: `${catalog.home} x ${catalog.away} já começou — remova a seleção.` };
      }
      fixture = catalog;
    }

    if (seenMatches.has(matchId)) {
      return { ok: false, error: "Apenas uma seleção por partida é permitida." };
    }
    seenMatches.add(matchId);

    const found = findSelection(fixture, selectionId);
    if (!found) {
      return { ok: false, error: "Mercado não encontrado nesta partida." };
    }

    items.push({
      key: `${matchId}::${selectionId}`,
      matchId,
      leagueName: fixture.leagueName,
      home: fixture.home,
      away: fixture.away,
      kickoff: fixture.kickoff,
      marketId: found.market.id,
      marketName: found.market.name,
      selectionId,
      label: found.selection.label,
      odd: found.selection.odd,
    });
  }

  return { ok: true, items };
}

export function combineOdds(items: { odd: number }[]): number {
  return items.reduce((acc, item) => acc * item.odd, 1);
}

export type PlaceBetResult =
  | { ok: true; betId: number; totalOdd: number; potentialCents: number }
  | { ok: false; error: string };

export async function placeBet(
  userId: number,
  items: ValidatedItem[],
  stakeCents: number,
): Promise<PlaceBetResult> {
  if (!Number.isInteger(stakeCents) || stakeCents < MIN_STAKE_CENTS) {
    return { ok: false, error: "Valor mínimo de aposta: R$ 2,00." };
  }

  await ensureSchema();
  const product = combineOdds(items);
  const totalOdd = Math.round(product * 100) / 100;
  const potentialCents = Math.round(stakeCents * product);
  const now = Date.now();

  const tx = await db().transaction("write");
  try {
    const fresh = await tx.execute({
      sql: "SELECT balance_cents FROM users WHERE id = ?",
      args: [userId],
    });
    const balance = Number(fresh.rows[0]?.balance_cents ?? -1);
    if (balance < stakeCents) {
      await tx.rollback();
      return { ok: false, error: "Saldo insuficiente. Faça um depósito primeiro." };
    }
    await tx.execute({
      sql: "UPDATE users SET balance_cents = balance_cents - ? WHERE id = ?",
      args: [stakeCents, userId],
    });
    const insert = await tx.execute({
      sql: `INSERT INTO bets (user_id, stake_cents, total_odd, potential_cents, status, selections, created_at)
            VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
      args: [userId, stakeCents, totalOdd, potentialCents, JSON.stringify(items), now],
    });
    await tx.execute({
      sql: `INSERT INTO transactions (user_id, type, method, amount_cents, status, detail, created_at)
            VALUES (?, 'bet', NULL, ?, 'confirmed', ?, ?)`,
      args: [userId, -stakeCents, `${items.length} seleção(ões)`, now],
    });
    await tx.commit();
    return {
      ok: true,
      betId: Number(insert.lastInsertRowid),
      totalOdd,
      potentialCents,
    };
  } catch (error) {
    try {
      await tx.rollback();
    } catch {
      /* ignore */
    }
    throw error;
  }
}

/** Adds money to the wallet and records the transaction atomically. */
export async function credit(
  userId: number,
  amountCents: number,
  type: "deposit" | "payout" | "refund",
  method: string | null,
  detail: string,
): Promise<void> {
  await ensureSchema();
  const tx = await db().transaction("write");
  try {
    await tx.execute({
      sql: "UPDATE users SET balance_cents = balance_cents + ? WHERE id = ?",
      args: [amountCents, userId],
    });
    await tx.execute({
      sql: `INSERT INTO transactions (user_id, type, method, amount_cents, status, detail, created_at)
            VALUES (?, ?, ?, ?, 'confirmed', ?, ?)`,
      args: [userId, type, method, amountCents, detail, Date.now()],
    });
    await tx.commit();
  } catch (error) {
    try {
      await tx.rollback();
    } catch {
      /* ignore */
    }
    throw error;
  }
}

type BetRow = {
  id: number;
  stake_cents: number;
  selections: string;
};

/**
 * Lazy settlement: pending bets whose matches have all ended are graded with
 * the deterministic simulator and the winnings (if any) are credited. Bets on
 * live (Flashscore) matches use the real final score whenever the market only
 * depends on it.
 */
export async function settleUserBets(userId: number): Promise<void> {
  const rows = await q<BetRow>(
    "SELECT id, stake_cents, selections FROM bets WHERE user_id = ? AND status = 'pending'",
    [userId],
  );
  if (rows.length === 0) return;
  const now = Date.now();

  let liveResults: Map<string, FeedResult> | null = null;

  for (const row of rows) {
    let items: StoredSelection[];
    try {
      items = JSON.parse(row.selections) as StoredSelection[];
    } catch {
      continue;
    }

    if (!liveResults && items.some((item) => item.matchId.startsWith("fs-"))) {
      try {
        liveResults = await fetchResultsMap();
      } catch {
        liveResults = new Map();
      }
    }

    let allFinished = true;
    let anyLost = false;
    let anySettled = false;
    let product = 1;

    for (const item of items) {
      // ── live matches: grade with the real score from the feed ──────────
      if (item.matchId.startsWith("fs-")) {
        const feed = liveResults?.get(item.matchId.slice(3));
        const kickoff = item.kickoff ?? 0;

        if (!feed) {
          // Not in today's/yesterday's feed. Wait a while, then void the leg.
          if (kickoff > 0 && now > kickoff + MATCH_SETTLE_MINUTES * 60_000) continue;
          allFinished = false;
          break;
        }
        if (feed.status !== 3) {
          allFinished = false;
          break;
        }

        const real = evaluateScoreOnly(item.selectionId, feed.homeScore, feed.awayScore);
        const result =
          real ?? evaluateSelection(item.selectionId, getMatchStats(fixtureFromStored(item)));

        if (result === "lose") {
          anyLost = true;
          break;
        }
        if (result === "win") {
          product *= item.odd;
          anySettled = true;
        }
        continue;
      }

      // ── simulated catalogue matches ────────────────────────────────────
      const fixture = getFixtureById(item.matchId);
      if (!fixture) {
        allFinished = false;
        break;
      }
      if (now < fixture.kickoff + MATCH_SETTLE_MINUTES * 60_000) {
        allFinished = false;
        break;
      }
      const stats = getMatchStats(fixture);
      const result = evaluateSelection(item.selectionId, stats);
      if (result === "lose") {
        anyLost = true;
        break;
      }
      if (result === "win") {
        product *= item.odd;
        anySettled = true;
      }
    }

    if (!allFinished) continue;

    if (anyLost) {
      await run("UPDATE bets SET status = 'lost', settled_at = ? WHERE id = ?", [now, row.id]);
      continue;
    }

    if (!anySettled) {
      await credit(userId, row.stake_cents, "refund", null, `Estorno da aposta #${row.id}`);
      await run("UPDATE bets SET status = 'void', settled_at = ? WHERE id = ?", [now, row.id]);
      continue;
    }

    const payoutCents = Math.round(row.stake_cents * product);
    await credit(userId, payoutCents, "payout", null, `Prêmio da aposta #${row.id}`);
    await run("UPDATE bets SET status = 'won', settled_at = ? WHERE id = ?", [now, row.id]);
  }
}
