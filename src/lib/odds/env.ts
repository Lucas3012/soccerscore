import { rngFrom } from "../random";
import type { Fixture } from "../types";

/** Deterministic match environment shared by odds and simulated statistics. */
export type MatchEnv = {
  cornerTotal: number;
  cornerHomeShare: number;
  cardTotal: number;
  cardHomeShare: number;
  redChance: number;
};

export function matchEnv(fixture: Fixture): MatchEnv {
  const rng = rngFrom(fixture.id, "env");
  return {
    cornerTotal: 8.5 + rng() * 3.4,
    cornerHomeShare: 0.46 + rng() * 0.1,
    cardTotal: 3.1 + rng() * 2.4,
    cardHomeShare: 0.45 + rng() * 0.1,
    redChance: 0.05 + rng() * 0.05,
  };
}
