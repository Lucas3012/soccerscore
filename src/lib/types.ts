export type RegionId =
  | "brasil"
  | "internacional"
  | "europa"
  | "americas"
  | "mundo";

export type League = {
  id: string;
  name: string;
  country: string;
  flag: string;
  region: RegionId;
  priority: number;
  /** Max matches generated per day for this competition. */
  daily: number;
  teams: string[];
};

export type Fixture = {
  id: string;
  leagueId: string;
  leagueName: string;
  country: string;
  flag: string;
  region: RegionId;
  date: string;
  home: string;
  away: string;
  kickoff: number;
  slot: string;
};

export type GoalEvent = {
  team: "h" | "a";
  minute: number;
  playerId: string;
  assistId?: string;
};

export type CardEvent = {
  team: "h" | "a";
  minute: number;
  playerId: string;
  red: boolean;
};

export type CornerEvent = {
  team: "h" | "a";
  minute: number;
};

export type MatchStats = {
  goalsHome: number;
  goalsAway: number;
  goals: GoalEvent[];
  cardsHome: number;
  cardsAway: number;
  cards: CardEvent[];
  cornersHome: number;
  cornersAway: number;
  corners: CornerEvent[];
};

export type Player = {
  id: string;
  name: string;
  team: "h" | "a";
};

export type Selection = {
  id: string;
  label: string;
  odd: number;
};

export type MarketGroupId =
  | "popular"
  | "resultado"
  | "gols"
  | "tempos"
  | "escanteios"
  | "cartoes"
  | "jogadores"
  | "combinadas"
  | "extras";

export type Market = {
  id: string;
  name: string;
  group: MarketGroupId;
  selections: Selection[];
};

export type MatchMarkets = {
  markets: Market[];
  total: number;
};

export type SlipItem = {
  key: string;
  matchId: string;
  leagueName: string;
  home: string;
  away: string;
  kickoff: number;
  marketId: string;
  marketName: string;
  selectionId: string;
  label: string;
  odd: number;
};

export type BetStatus = "pending" | "won" | "lost" | "void";

export type StoredSelection = {
  matchId: string;
  leagueName: string;
  home: string;
  away: string;
  marketId: string;
  marketName: string;
  selectionId: string;
  label: string;
  odd: number;
};
