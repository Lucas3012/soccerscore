import { dateKeyOf, formatTimeMs } from "../time";
import type { Fixture, RegionId } from "../types";
import { countryInfo } from "./countries";

/**
 * Live data provider built on Flashscore's public list feeds.
 *
 * Feed format: records separated by "~", fields separated by "¬" and each field
 * is `KEY÷value`. Relevant keys for football matches:
 *   AA = match id        AD = kickoff (epoch s)   AB = status (1 soon, 2 live, 3 ended)
 *   AE/AF = home/away    AG/AH = current score    ZA = league name, ZY = country
 */

const HEADERS: Record<string, string> = {
  "x-fsign": "SW9D1eZo",
  Referer: "https://www.flashscore.com.br/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "*/*",
};

/** Mirrors of the same feed; the first one that answers wins. */
const HOSTS = ["https://www.flashscore.com.br", "https://global.flashscore.ninja/401"];

const LIVE_FEED = "f_1_0_3_pt_1"; // matches of today (live ones are AB=2)
const TODAY_FEED = "f_1_0_2_pt_1";
const YESTERDAY_FEED = "f_1_-1_2_pt_1";

const FEED_TIMEOUT_MS = 9_000;
const LIVE_TTL_MS = 45_000;
const RESULTS_TTL_MS = 60_000;
const RECENT_KEEP_MS = 6 * 60 * 60 * 1000;

type RawRecord = Record<string, string>;
type LeagueInfo = { name: string; country: string; path: string };

export type LivePeriod = "1T" | "INT" | "2T";

export type LiveMatch = {
  /** Flashscore event id (AA). */
  id: string;
  /** Id used by the betting engine, e.g. `fs-AbCd1234`. */
  matchId: string;
  leagueName: string;
  leaguePath: string;
  country: string;
  flag: string;
  region: RegionId;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  kickoff: number;
  period: LivePeriod;
  /** Human label for the current period ("1º tempo", "Intervalo", "2º tempo"). */
  clockLabel: string;
};

export type LiveSnapshot = {
  ok: boolean;
  updatedAt: number;
  matches: LiveMatch[];
  error: string | null;
};

export type FeedResult = { status: number; homeScore: number; awayScore: number };

// ─────────────────────────────── feed plumbing ─────────────────────────────

function parseFeed(text: string): RawRecord[] {
  const out: RawRecord[] = [];
  for (const block of text.split("~")) {
    if (!block) continue;
    const record: RawRecord = {};
    for (const pair of block.split("\u00ac")) {
      const idx = pair.indexOf("\u00f7");
      if (idx === -1) continue;
      record[pair.slice(0, idx)] = pair.slice(idx + 1);
    }
    if (Object.keys(record).length > 0) out.push(record);
  }
  return out;
}

async function fetchFeed(feed: string): Promise<RawRecord[]> {
  let lastError: unknown = null;

  for (const host of HOSTS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(`${host}/x/feed/${feed}`, {
          headers: HEADERS,
          signal: controller.signal,
          cache: "no-store",
        });
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      if (!text.includes("\u00ac")) throw new Error("Feed vazio");
      return parseFeed(text);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Falha ao consultar o Flashscore.");
}

/** Estimated match period from wall time (45' + break + 45'). */
function periodOf(kickoff: number, now: number): LivePeriod {
  const elapsed = Math.floor((now - kickoff) / 60_000);
  if (elapsed <= 45) return "1T";
  if (elapsed <= 62) return "INT";
  return "2T";
}

const PERIOD_LABEL: Record<LivePeriod, string> = {
  "1T": "1º tempo",
  INT: "Intervalo",
  "2T": "2º tempo",
};

function toLiveMatch(record: RawRecord, league: LeagueInfo | null, now: number): LiveMatch | null {
  const id = record.AA;
  const home = record.AE;
  const away = record.AF;
  if (!id || !home || !away) return null;

  const kickoff = Number(record.AD) * 1000;
  const period = periodOf(Number.isFinite(kickoff) ? kickoff : now, now);
  const country = league?.country ?? "Mundo";
  const info = countryInfo(country);

  return {
    id,
    matchId: `fs-${id}`,
    leagueName: league?.name || country,
    leaguePath: league?.path ?? "",
    country,
    flag: info.flag,
    region: info.region,
    home,
    away,
    homeScore: Number(record.AG ?? 0),
    awayScore: Number(record.AH ?? 0),
    kickoff,
    period,
    clockLabel: PERIOD_LABEL[period],
  };
}

async function collectLive(now: number): Promise<LiveMatch[]> {
  const records = await fetchFeed(LIVE_FEED);
  const out: LiveMatch[] = [];
  let league: LeagueInfo | null = null;

  for (const record of records) {
    if (record.ZA && !record.AA) {
      league = { name: record.ZA, country: record.ZY ?? "", path: record.ZL ?? "" };
      continue;
    }
    if (!record.AA || record.AB !== "2") continue;
    const match = toLiveMatch(record, league, now);
    if (match) out.push(match);
  }

  out.sort((a, b) => a.kickoff - b.kickoff);
  return out;
}

// ──────────────────────────────── live cache ───────────────────────────────

let snapshot: LiveSnapshot | null = null;
const recent = new Map<string, { at: number; match: LiveMatch }>();

function remember(matches: LiveMatch[], now: number): void {
  for (const match of matches) recent.set(match.id, { at: now, match });
  for (const [id, entry] of recent) {
    if (now - entry.at > RECENT_KEEP_MS) recent.delete(id);
  }
}

/** Live board data, cached for {@link LIVE_TTL_MS} seconds. */
export async function getLiveSnapshot(force = false): Promise<LiveSnapshot> {
  const now = Date.now();
  if (!force && snapshot && now - snapshot.updatedAt < LIVE_TTL_MS) return snapshot;

  try {
    const matches = await collectLive(now);
    remember(matches, now);
    snapshot = { ok: true, updatedAt: now, matches, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    const stale = snapshot && now - snapshot.updatedAt < 10 * 60_000 ? snapshot.matches : [];
    snapshot = { ok: false, updatedAt: now, matches: stale, error: message };
  }

  return snapshot;
}

/** Looks a live match up by `fs-<id>` (or the raw Flashscore id). */
export async function findLiveMatch(matchId: string): Promise<LiveMatch | null> {
  const raw = matchId.startsWith("fs-") ? matchId.slice(3) : matchId;

  const inSnapshot = snapshot?.matches.find((m) => m.id === raw);
  if (inSnapshot) return inSnapshot;

  const fromRecent = recent.get(raw);
  if (fromRecent && Date.now() - fromRecent.at < RECENT_KEEP_MS) return fromRecent.match;

  const fresh = await getLiveSnapshot(true);
  return fresh.matches.find((m) => m.id === raw) ?? null;
}

/** Builds a deterministic engine fixture for a live match (1500 markets). */
export function fixtureFromLive(match: LiveMatch): Fixture {
  return {
    id: match.matchId,
    leagueId: match.leaguePath || `fs:${match.leagueName}`,
    leagueName: match.leagueName,
    country: match.country,
    flag: match.flag,
    region: match.region,
    date: dateKeyOf(new Date(match.kickoff)),
    home: match.home,
    away: match.away,
    kickoff: match.kickoff,
    slot: formatTimeMs(match.kickoff),
  };
}

// ───────────────────────────── result lookup ──────────────────────────────

let resultsCache: { at: number; map: Map<string, FeedResult> } | null = null;

/**
 * Final scores of today's (and yesterday's) matches, keyed by event id. Used to
 * settle bets placed on live matches.
 */
export async function fetchResultsMap(force = false): Promise<Map<string, FeedResult>> {
  const now = Date.now();
  if (!force && resultsCache && now - resultsCache.at < RESULTS_TTL_MS) return resultsCache.map;

  const map = new Map<string, FeedResult>();
  let ok = false;

  for (const feed of [TODAY_FEED, YESTERDAY_FEED]) {
    try {
      const records = await fetchFeed(feed);
      for (const record of records) {
        if (!record.AA) continue;
        map.set(record.AA, {
          status: Number(record.AB ?? 0),
          homeScore: Number(record.AG ?? 0),
          awayScore: Number(record.AH ?? 0),
        });
      }
      ok = true;
    } catch {
      /* try the next feed */
    }
  }

  if (ok) resultsCache = { at: now, map };
  return map;
}
