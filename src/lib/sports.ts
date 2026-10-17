import { LEAGUES, LEAGUE_BY_ID } from "./data/leagues";
import {
  assistWeight,
  cardWeight,
  goalWeight,
  playersForTeam,
  weightedPick,
} from "./data/players";
import { matchEnv } from "./odds/env";
import { expectedGoals } from "./odds/model";
import { hashString, mulberry32, poissonSample, randInt, shuffle } from "./random";
import { KICKOFF_SLOTS, kickoffMs } from "./time";
import type { CardEvent, CornerEvent, Fixture, GoalEvent, MatchStats, RegionId } from "./types";

/**
 * Deterministic fixtures for one league on one Brasília date. Team pairing,
 * kickoff slots and match ids are pure functions of (leagueId, date).
 */
export function getFixtures(leagueId: string, date: string): Fixture[] {
  const league = LEAGUE_BY_ID.get(leagueId);
  if (!league) return [];
  const rng = mulberry32(hashString(`${league.id}|${date}`));
  const teamOrder = shuffle(
    rng,
    league.teams.map((_, index) => index),
  );
  const pairs = Math.min(league.daily, Math.floor(teamOrder.length / 2));
  const slots = shuffle(rng, [...KICKOFF_SLOTS]).slice(0, pairs).sort();

  const fixtures: Fixture[] = [];
  for (let i = 0; i < pairs; i++) {
    const homeIndex = teamOrder[i * 2];
    const awayIndex = teamOrder[i * 2 + 1];
    const slot = slots[i];
    fixtures.push({
      id: `${league.id}|${date}|${homeIndex}-${awayIndex}`,
      leagueId: league.id,
      leagueName: league.name,
      country: league.country,
      flag: league.flag,
      region: league.region,
      date,
      home: league.teams[homeIndex],
      away: league.teams[awayIndex],
      kickoff: kickoffMs(date, slot),
      slot,
    });
  }
  return fixtures.sort((a, b) => a.kickoff - b.kickoff);
}

export function getFixtureById(id: string): Fixture | null {
  const [leagueId, date] = id.split("|");
  if (!leagueId || !date) return null;
  return getFixtures(leagueId, date).find((f) => f.id === id) ?? null;
}

export function fixturesForDate(date: string, region: RegionId | "todos" = "todos"): Fixture[] {
  const leagues =
    region === "todos" ? LEAGUES : LEAGUES.filter((l) => l.region === region);
  const out: Fixture[] = [];
  for (const league of leagues) out.push(...getFixtures(league.id, date));
  return out;
}

export type LeagueBlock = {
  leagueId: string;
  leagueName: string;
  country: string;
  flag: string;
  region: RegionId;
  matches: Fixture[];
};

const REGION_ORDER: Record<RegionId, number> = {
  brasil: 0,
  internacional: 1,
  europa: 2,
  americas: 3,
  mundo: 4,
};

/** Fixtures grouped by league, Brazil first, then by league priority. */
export function leagueBlocksForDate(date: string, region: RegionId | "todos" = "todos"): LeagueBlock[] {
  const leagues =
    (region === "todos" ? LEAGUES : LEAGUES.filter((l) => l.region === region))
      .slice()
      .sort((a, b) => {
        const r = REGION_ORDER[a.region] - REGION_ORDER[b.region];
        return r !== 0 ? r : a.priority - b.priority;
      });

  const blocks: LeagueBlock[] = [];
  for (const league of leagues) {
    const matches = getFixtures(league.id, date);
    if (matches.length === 0) continue;
    blocks.push({
      leagueId: league.id,
      leagueName: league.name,
      country: league.country,
      flag: league.flag,
      region: league.region,
      matches,
    });
  }
  return blocks;
}

// ───────────────────────────── simulated stats ────────────────────────────

/**
 * Deterministic simulation of a match. The full timeline is always generated
 * from the same seed; `cutoffMinute` only filters events for live display, so
 * finished scores never change between requests.
 */
export function getMatchStats(fixture: Fixture, cutoffMinute = 95): MatchStats {
  const rng = mulberry32(hashString(`${fixture.id}|stats`));
  const { lh, la } = expectedGoals(fixture.home, fixture.away);
  const env = matchEnv(fixture);
  const homePlayers = playersForTeam(fixture.home, "h");
  const awayPlayers = playersForTeam(fixture.away, "a");

  const goalsHomeCount = poissonSample(rng, lh);
  const goalsAwayCount = poissonSample(rng, la);

  const goals: GoalEvent[] = [];
  const sides: { team: "h" | "a"; players: typeof homePlayers; count: number }[] = [
    { team: "h", players: homePlayers, count: goalsHomeCount },
    { team: "a", players: awayPlayers, count: goalsAwayCount },
  ];
  for (const side of sides) {
    for (let i = 0; i < side.count; i++) {
      const minute = randInt(rng, 1, 94);
      const scorer = weightedPick(rng, side.players, (_, index) => goalWeight(index));
      let assistId: string | undefined;
      if (rng() < 0.68) {
        for (let attempt = 0; attempt < 4; attempt++) {
          const candidate = weightedPick(rng, side.players, (_, index) => assistWeight(index));
          if (candidate.id !== scorer.id) {
            assistId = candidate.id;
            break;
          }
        }
      }
      goals.push({ team: side.team, minute, playerId: scorer.id, assistId });
    }
  }

  const cardsHomeCount = poissonSample(rng, env.cardTotal * env.cardHomeShare);
  const cardsAwayCount = poissonSample(rng, env.cardTotal * (1 - env.cardHomeShare));
  const cards: CardEvent[] = [];
  const cardSides: { team: "h" | "a"; players: typeof homePlayers; count: number }[] = [
    { team: "h", players: homePlayers, count: cardsHomeCount },
    { team: "a", players: awayPlayers, count: cardsAwayCount },
  ];
  for (const side of cardSides) {
    for (let i = 0; i < side.count; i++) {
      const minute = randInt(rng, 1, 90);
      const player = weightedPick(rng, side.players, (_, index) => cardWeight(index));
      const red = rng() < env.redChance / 2;
      cards.push({ team: side.team, minute, playerId: player.id, red });
    }
  }

  const cornersHomeCount = poissonSample(rng, env.cornerTotal * env.cornerHomeShare, 30);
  const cornersAwayCount = poissonSample(rng, env.cornerTotal * (1 - env.cornerHomeShare), 30);
  const corners: CornerEvent[] = [];
  for (let i = 0; i < cornersHomeCount; i++) corners.push({ team: "h", minute: randInt(rng, 1, 90) });
  for (let i = 0; i < cornersAwayCount; i++) corners.push({ team: "a", minute: randInt(rng, 1, 90) });

  const byMinute = <T extends { minute: number }>(a: T, b: T) => a.minute - b.minute;
  const filteredGoals = goals.filter((g) => g.minute <= cutoffMinute).sort(byMinute);
  const filteredCards = cards.filter((c) => c.minute <= cutoffMinute).sort(byMinute);
  const filteredCorners = corners.filter((c) => c.minute <= cutoffMinute).sort(byMinute);

  return {
    goalsHome: filteredGoals.filter((g) => g.team === "h").length,
    goalsAway: filteredGoals.filter((g) => g.team === "a").length,
    goals: filteredGoals,
    cardsHome: filteredCards.filter((c) => c.team === "h").length,
    cardsAway: filteredCards.filter((c) => c.team === "a").length,
    cards: filteredCards,
    cornersHome: filteredCorners.filter((c) => c.team === "h").length,
    cornersAway: filteredCorners.filter((c) => c.team === "a").length,
    corners: filteredCorners,
  };
}
