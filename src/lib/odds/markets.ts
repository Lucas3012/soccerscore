import {
  assistWeight,
  cardWeight,
  goalWeight,
  normalizeWeights,
  playersForFixture,
} from "../data/players";
import type {
  Fixture,
  Market,
  MarketGroupId,
  MatchStats,
  Player,
  Selection,
} from "../types";
import {
  buildHalfModel,
  expectedGoals,
  jointPmf,
  oddsFromProb,
  poissonPmf,
} from "./model";
import { matchEnv, type MatchEnv } from "./env";

export const MARKETS_PER_MATCH = 1500;

export const GROUPS: { id: MarketGroupId; label: string }[] = [
  { id: "popular", label: "Populares" },
  { id: "resultado", label: "Resultado" },
  { id: "gols", label: "Gols" },
  { id: "tempos", label: "Tempos" },
  { id: "escanteios", label: "Escanteios" },
  { id: "cartoes", label: "Cartões" },
  { id: "jogadores", label: "Jogadores" },
  { id: "combinadas", label: "Combinadas" },
  { id: "extras", label: "Extras" },
];

const GOAL_BANDS = ["1-15", "16-30", "31-45", "46-60", "61-75", "76-90"] as const;

// ─────────────────────────── formatting helpers ───────────────────────────

function num(value: number): string {
  return String(value).replace(".", ",");
}

function signedNum(value: number): string {
  return `${value > 0 ? "+" : ""}${num(value)}`;
}

function sel(id: string, label: string, prob: number, margin = 0.06): Selection {
  return { id, label, odd: oddsFromProb(Math.max(prob, 0), margin) };
}

function market(id: string, name: string, group: MarketGroupId, selections: Selection[]): Market {
  return { id, name, group, selections };
}

function rangeCount(start: number, end: number): number[] {
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

// ───────────────────────── probability primitives ────────────────────────

type Joint = number[][];

function pResult(joint: Joint, kind: "1" | "X" | "2"): number {
  let p = 0;
  for (let i = 0; i < joint.length; i++) {
    for (let j = 0; j < joint[i].length; j++) {
      if (kind === "1" && i > j) p += joint[i][j];
      else if (kind === "X" && i === j) p += joint[i][j];
      else if (kind === "2" && i < j) p += joint[i][j];
    }
  }
  return p;
}

function pDiffEq(joint: Joint, d: number): number {
  let p = 0;
  for (let i = 0; i < joint.length; i++) {
    const j = i - d;
    if (j >= 0 && j < joint[i].length) p += joint[i][j];
  }
  return p;
}

function pDiffGt(joint: Joint, t: number): number {
  let p = 0;
  for (let i = 0; i < joint.length; i++) {
    for (let j = 0; j < joint[i].length; j++) {
      if (i - j > t) p += joint[i][j];
    }
  }
  return p;
}

function pTotalOver(joint: Joint, line: number): number {
  let p = 0;
  for (let i = 0; i < joint.length; i++) {
    for (let j = 0; j < joint[i].length; j++) {
      if (i + j > line) p += joint[i][j];
    }
  }
  return p;
}

function pTotalEq(joint: Joint, n: number): number {
  let p = 0;
  for (let i = 0; i < joint.length; i++) {
    const j = n - i;
    if (j >= 0 && j < joint[i].length) p += joint[i][j];
  }
  return p;
}

function pPmfOver(pmf: number[], line: number): number {
  let p = 0;
  for (let k = 0; k < pmf.length; k++) if (k > line) p += pmf[k];
  return p;
}

function pPmfEq(pmf: number[], n: number): number {
  return n >= 0 && n < pmf.length ? pmf[n] : 0;
}

// ─────────────────────────────── context ──────────────────────────────────

type Ctx = {
  fixture: Fixture;
  lh: number;
  la: number;
  joint: Joint;
  homePmf: number[];
  awayPmf: number[];
  half: ReturnType<typeof buildHalfModel>;
  env: MatchEnv;
  players: Player[];
  goalShares: number[];
  assistShares: number[];
  cardShares: number[];
};

function buildContext(fixture: Fixture): Ctx {
  const { lh, la } = expectedGoals(fixture.home, fixture.away);
  const players = playersForFixture(fixture.home, fixture.away);
  const indices = rangeCount(0, 17);
  return {
    fixture,
    lh,
    la,
    joint: jointPmf(lh, la),
    homePmf: poissonPmf(lh, 12),
    awayPmf: poissonPmf(la, 12),
    half: buildHalfModel(lh, la),
    env: matchEnv(fixture),
    players,
    goalShares: normalizeWeights(indices.map((i) => goalWeight(i))),
    assistShares: normalizeWeights(indices.map((i) => assistWeight(i))),
    cardShares: normalizeWeights(indices.map((i) => cardWeight(i))),
  };
}

function lambdaForPlayer(ctx: Ctx, playerIndex: number, side: "h" | "a", kind: "goal" | "assist" | "card"): number {
  const teamLambda = side === "h" ? ctx.lh : ctx.la;
  if (kind === "goal") return teamLambda * ctx.goalShares[playerIndex];
  if (kind === "assist") return teamLambda * ctx.assistShares[playerIndex] * 0.62;
  const share = side === "h" ? ctx.env.cardHomeShare : 1 - ctx.env.cardHomeShare;
  return ctx.env.cardTotal * share * ctx.cardShares[playerIndex];
}

// ─────────────────────────── base market builders ─────────────────────────

function popularMarkets(ctx: Ctx): Market[] {
  const { joint, fixture } = ctx;
  const out: Market[] = [];

  out.push(
    market("rf", "Resultado Final", "popular", [
      sel("r:1", fixture.home, pResult(joint, "1")),
      sel("r:X", "Empate", pResult(joint, "X")),
      sel("r:2", fixture.away, pResult(joint, "2")),
    ]),
  );

  const p1 = pResult(joint, "1");
  const px = pResult(joint, "X");
  const p2 = pResult(joint, "2");
  out.push(
    market("dc", "Dupla Chance", "popular", [
      sel("dc:1X", `${fixture.home} ou Empate`, p1 + px, 0.05),
      sel("dc:12", `${fixture.home} ou ${fixture.away}`, p1 + p2, 0.05),
      sel("dc:X2", `Empate ou ${fixture.away}`, px + p2, 0.05),
    ]),
  );

  const totalSel: Selection[] = [];
  for (const line of [0.5, 1.5, 2.5, 3.5, 4.5, 5.5]) {
    const over = pTotalOver(joint, line);
    totalSel.push(sel(`ou:over:${line}`, `Mais de ${num(line)} gols`, over));
    totalSel.push(sel(`ou:under:${line}`, `Menos de ${num(line)} gols`, 1 - over));
  }
  out.push(market("ou", "Total de Gols", "popular", totalSel));

  const bttsY = (1 - ctx.homePmf[0]) * (1 - ctx.awayPmf[0]);
  out.push(
    market("btts", "Ambas Marcam", "popular", [
      sel("btts:y", "Sim", bttsY, 0.07),
      sel("btts:n", "Não", 1 - bttsY, 0.07),
    ]),
  );

  const h1 = ctx.half;
  const total1Sel: Selection[] = [];
  for (const line of [0.5, 1.5, 2.5]) {
    let over = 0;
    for (let i = 0; i < h1.p1.length; i++) {
      for (let j = 0; j < h1.p1[i].length; j++) if (i + j > line) over += h1.p1[i][j];
    }
    total1Sel.push(sel(`ou1:over:${line}`, `Mais de ${num(line)}`, over));
    total1Sel.push(sel(`ou1:under:${line}`, `Menos de ${num(line)}`, 1 - over));
  }
  out.push(market("ou1", "Total de Gols — 1º Tempo", "popular", total1Sel));

  return out;
}

function resultadoMarkets(ctx: Ctx): Market[] {
  const { joint, fixture } = ctx;
  const out: Market[] = [];

  const quarterLines: number[] = [];
  for (let l = -4; l <= 4; l += 0.25) quarterLines.push(Number(l.toFixed(2)));
  for (const line of quarterLines) {
    const coverHome = (pDiffGt(joint, line - 0.25) + pDiffGt(joint, line + 0.25)) / 2;
    const coverAway = 1 - coverHome;
    out.push(
      market(`ah:${line}`, `Handicap Asiático (${signedNum(line)})`, "resultado", [
        sel(`ah:1:${line}`, `${fixture.home} ${signedNum(line)}`, coverHome),
        sel(`ah:2:${line}`, `${fixture.away} ${signedNum(-line)}`, coverAway),
      ]),
    );
  }

  for (const line of rangeCount(-3, 3)) {
    const win = pDiffGt(joint, line);
    const draw = pDiffEq(joint, line);
    const lose = Math.max(0, 1 - win - draw);
    out.push(
      market(`eh:${line}`, `Handicap Europeu (${signedNum(line)})`, "resultado", [
        sel(`eh:1:${line}`, fixture.home, win),
        sel(`eh:X:${line}`, "Empate", draw),
        sel(`eh:2:${line}`, fixture.away, lose),
      ]),
    );
  }

  const csSel: Selection[] = [];
  let covered = 0;
  for (const i of rangeCount(0, 6)) {
    for (const j of rangeCount(0, 6)) {
      const p = joint[i][j];
      covered += p;
      csSel.push(sel(`cs:${i}-${j}`, `${i}-${j}`, p, 0.1));
    }
  }
  csSel.push(sel("cs:other", "Qualquer outro placar", 1 - covered, 0.1));
  out.push(market("cs", "Placar Exato", "resultado", csSel));

  const marginSel: Selection[] = [
    sel("margin:h:1", `${fixture.home} por 1 gol`, pDiffEq(joint, 1), 0.08),
    sel("margin:h:2", `${fixture.home} por 2 gols`, pDiffEq(joint, 2), 0.08),
    sel("margin:h:3p", `${fixture.home} por 3+ gols`, pDiffGt(joint, 2), 0.08),
    sel("margin:a:1", `${fixture.away} por 1 gol`, pDiffEq(joint, -1), 0.08),
    sel("margin:a:2", `${fixture.away} por 2 gols`, pDiffEq(joint, -2), 0.08),
    sel("margin:a:3p", `${fixture.away} por 3+ gols`, pDiffGt(joint, -3), 0.08),
  ];
  out.push(market("margin", "Margem de Vitória", "resultado", marginSel));

  let wtnH = 0;
  let wtnA = 0;
  let cleanH = 0;
  let cleanA = 0;
  for (let i = 0; i < joint.length; i++) {
    for (let j = 0; j < joint[i].length; j++) {
      if (j === 0) cleanH += joint[i][j];
      if (i === 0) cleanA += joint[i][j];
      if (i > j && j === 0) wtnH += joint[i][j];
      if (j > i && i === 0) wtnA += joint[i][j];
    }
  }
  out.push(
    market("wtn", "Vitória sem Sofrer Gols", "resultado", [
      sel("wtn:h", fixture.home, wtnH, 0.08),
      sel("wtn:a", fixture.away, wtnA, 0.08),
    ]),
  );
  out.push(
    market("clean", "Jogo sem Sofrer Gols (Clean Sheet)", "resultado", [
      sel("clean:h", fixture.home, cleanH, 0.08),
      sel("clean:a", fixture.away, cleanA, 0.08),
    ]),
  );

  const pNoGoal = Math.exp(-(ctx.lh + ctx.la));
  const pHomeFirst = (1 - pNoGoal) * (ctx.lh / (ctx.lh + ctx.la));
  const pAwayFirst = (1 - pNoGoal) * (ctx.la / (ctx.lh + ctx.la));
  const firstSel = (prefix: string, name: string): Market =>
    market(prefix, name, "resultado", [
      sel(`${prefix}:h`, fixture.home, pHomeFirst),
      sel(`${prefix}:none`, "Sem gols", pNoGoal),
      sel(`${prefix}:a`, fixture.away, pAwayFirst),
    ]);
  out.push(firstSel("first", "Quem Marca o 1º Gol"));
  out.push(firstSel("last", "Quem Marca o Último Gol"));

  const comebackH = pResult(joint, "1") * (1 - Math.exp(-ctx.la)) * 0.55;
  const comebackA = pResult(joint, "2") * (1 - Math.exp(-ctx.lh)) * 0.55;
  out.push(
    market("comeback", "Vitória de Virada", "resultado", [
      sel("comeback:h", fixture.home, comebackH, 0.08),
      sel("comeback:a", fixture.away, comebackA, 0.08),
    ]),
  );

  const exactSel: Selection[] = [];
  for (const k of rangeCount(0, 6)) exactSel.push(sel(`exactgoals:${k}`, `${k} gol${k === 1 ? "" : "s"}`, pTotalEq(joint, k), 0.08));
  let seven = 0;
  for (const k of rangeCount(7, 15)) seven += pTotalEq(joint, k);
  exactSel.push(sel("exactgoals:7p", "7 ou mais gols", seven, 0.08));
  out.push(market("exactgoals", "Total Exato de Gols", "resultado", exactSel));

  return out;
}

function goalsMarkets(ctx: Ctx): Market[] {
  const { joint, homePmf, awayPmf, half } = ctx;
  const out: Market[] = [];

  const teamTotal = (prefix: string, name: string, pmf: number[]): Market => {
    const selections: Selection[] = [];
    for (const line of [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5]) {
      const over = pPmfOver(pmf, line);
      selections.push(sel(`${prefix}:over:${line}`, `Mais de ${num(line)}`, over));
      selections.push(sel(`${prefix}:under:${line}`, `Menos de ${num(line)}`, 1 - over));
    }
    return market(prefix, name, "gols", selections);
  };
  out.push(teamTotal("ouh", `Gols do ${ctx.fixture.home}`, homePmf));
  out.push(teamTotal("oua", `Gols do ${ctx.fixture.away}`, awayPmf));

  const total2Sel: Selection[] = [];
  for (const line of [0.5, 1.5, 2.5, 3.5, 4.5]) {
    let over = 0;
    for (let i = 0; i < half.p2.length; i++) {
      for (let j = 0; j < half.p2[i].length; j++) if (i + j > line) over += half.p2[i][j];
    }
    total2Sel.push(sel(`ou2:over:${line}`, `Mais de ${num(line)}`, over));
    total2Sel.push(sel(`ou2:under:${line}`, `Menos de ${num(line)}`, 1 - over));
  }
  out.push(market("ou2", "Total de Gols — 2º Tempo", "gols", total2Sel));

  const p1 = half.p1;
  let b1y = 0;
  let b2y = 0;
  {
    let pNoH1 = 0;
    let pNoA1 = 0;
    for (let i = 0; i < p1.length; i++) {
      pNoH1 += p1[0][i];
      pNoA1 += p1[i][0];
    }
    b1y = (1 - pNoH1) * (1 - pNoA1);
    let pNoH2 = 0;
    let pNoA2 = 0;
    for (let i = 0; i < half.p2.length; i++) {
      pNoH2 += half.p2[0][i];
      pNoA2 += half.p2[i][0];
    }
    b2y = (1 - pNoH2) * (1 - pNoA2);
  }
  out.push(
    market("btts1", "Ambas Marcam — 1º Tempo", "gols", [
      sel("btts1:y", "Sim", b1y, 0.08),
      sel("btts1:n", "Não", 1 - b1y, 0.08),
    ]),
  );
  out.push(
    market("btts2", "Ambas Marcam — 2º Tempo", "gols", [
      sel("btts2:y", "Sim", b2y, 0.08),
      sel("btts2:n", "Não", 1 - b2y, 0.08),
    ]),
  );

  const pH = ctx.lh * 0.46;
  const pH2 = ctx.lh * 0.54;
  const pA = ctx.la * 0.46;
  const pA2 = ctx.la * 0.54;
  out.push(
    market("bothhalves", "Marca em Ambos os Tempos", "gols", [
      sel("bothhalves:h", ctx.fixture.home, (1 - Math.exp(-pH)) * (1 - Math.exp(-pH2)), 0.08),
      sel("bothhalves:a", ctx.fixture.away, (1 - Math.exp(-pA)) * (1 - Math.exp(-pA2)), 0.08),
    ]),
  );

  const nogoalSel: Selection[] = [];
  const totalLambda = ctx.lh + ctx.la;
  for (const t of [15, 30, 45, 60, 75]) {
    const noGoal = Math.exp(-totalLambda * (t / 90));
    nogoalSel.push(sel(`nogoal:${t}:y`, `Sem gols até ${t} min — Sim`, noGoal, 0.07));
    nogoalSel.push(sel(`nogoal:${t}:n`, `Sem gols até ${t} min — Não`, 1 - noGoal, 0.07));
  }
  out.push(market("nogoal", "Sem Gols Até…", "gols", nogoalSel));

  const rangeSel: Selection[] = [
    sel("range:0-1", "0 a 1 gol", pTotalEq(joint, 0) + pTotalEq(joint, 1), 0.08),
    sel("range:2-3", "2 a 3 gols", pTotalEq(joint, 2) + pTotalEq(joint, 3), 0.08),
    sel("range:4-6", "4 a 6 gols", pTotalEq(joint, 4) + pTotalEq(joint, 5) + pTotalEq(joint, 6), 0.08),
  ];
  let seven = 0;
  for (const k of rangeCount(7, 15)) seven += pTotalEq(joint, k);
  rangeSel.push(sel("range:7p", "7 ou mais gols", seven, 0.08));
  out.push(market("ranges", "Faixa de Gols", "gols", rangeSel));

  return out;
}

function temposMarkets(ctx: Ctx): Market[] {
  const { half } = ctx;
  const out: Market[] = [];
  const codes = ["1", "X", "2"];

  const htftSel: Selection[] = [];
  for (let a = 0; a < 3; a++) {
    for (let b = 0; b < 3; b++) {
      htftSel.push(sel(`htft:${codes[a]}/${codes[b]}`, `${codes[a]}/${codes[b]}`, half.htft[a][b], 0.08));
    }
  }
  out.push(market("htft", "Intervalo / Final (1=Casa, X=Empate, 2=Fora)", "tempos", htftSel));

  out.push(
    market("htr", "Resultado do 1º Tempo", "tempos", [
      sel("htr:1", ctx.fixture.home, half.halfResult[0]),
      sel("htr:X", "Empate", half.halfResult[1]),
      sel("htr:2", ctx.fixture.away, half.halfResult[2]),
    ]),
  );
  out.push(
    market("shr", "Resultado do 2º Tempo", "tempos", [
      sel("shr:1", ctx.fixture.home, half.secondResult[0]),
      sel("shr:X", "Empate", half.secondResult[1]),
      sel("shr:2", ctx.fixture.away, half.secondResult[2]),
    ]),
  );

  const cs1: Selection[] = [];
  for (const i of rangeCount(0, 3)) {
    for (const j of rangeCount(0, 3)) cs1.push(sel(`cs1:${i}-${j}`, `${i}-${j}`, half.p1[i][j], 0.1));
  }
  out.push(market("cs1", "Placar Exato — 1º Tempo", "tempos", cs1));

  const cs2: Selection[] = [];
  for (const i of rangeCount(0, 3)) {
    for (const j of rangeCount(0, 3)) cs2.push(sel(`cs2:${i}-${j}`, `${i}-${j}`, half.p2[i][j], 0.1));
  }
  out.push(market("cs2", "Placar Exato — 2º Tempo", "tempos", cs2));

  return out;
}

function cornersMarkets(ctx: Ctx): Market[] {
  const { env } = ctx;
  const out: Market[] = [];
  const lh = env.cornerTotal * env.cornerHomeShare;
  const la = env.cornerTotal * (1 - env.cornerHomeShare);
  const totalPmf = poissonPmf(env.cornerTotal, 32);
  const homePmf = poissonPmf(lh, 26);
  const awayPmf = poissonPmf(la, 26);
  const pmf1 = poissonPmf(env.cornerTotal * 0.45, 20);

  const totalSel: Selection[] = [];
  for (const line of [6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13.5, 14.5]) {
    const over = pPmfOver(totalPmf, line);
    totalSel.push(sel(`corners:over:${line}`, `Mais de ${num(line)}`, over, 0.07));
    totalSel.push(sel(`corners:under:${line}`, `Menos de ${num(line)}`, 1 - over, 0.07));
  }
  out.push(market("corners", "Total de Escanteios", "escanteios", totalSel));

  const firstHalfSel: Selection[] = [];
  for (const line of [3.5, 4.5, 5.5, 6.5]) {
    const over = pPmfOver(pmf1, line);
    firstHalfSel.push(sel(`corners1:over:${line}`, `Mais de ${num(line)}`, over, 0.07));
    firstHalfSel.push(sel(`corners1:under:${line}`, `Menos de ${num(line)}`, 1 - over, 0.07));
  }
  out.push(market("corners1", "Escanteios — 1º Tempo", "escanteios", firstHalfSel));

  const byTeam = (prefix: string, name: string, pmf: number[]): Market => {
    const selections: Selection[] = [];
    for (const line of [3.5, 4.5, 5.5, 6.5, 7.5, 8.5]) {
      const over = pPmfOver(pmf, line);
      selections.push(sel(`${prefix}:over:${line}`, `Mais de ${num(line)}`, over, 0.07));
      selections.push(sel(`${prefix}:under:${line}`, `Menos de ${num(line)}`, 1 - over, 0.07));
    }
    return market(prefix, name, "escanteios", selections);
  };
  out.push(byTeam("cornersh", `Escanteios — ${ctx.fixture.home}`, homePmf));
  out.push(byTeam("cornersa", `Escanteios — ${ctx.fixture.away}`, awayPmf));

  const exactSel: Selection[] = [];
  for (const k of rangeCount(0, 14)) exactSel.push(sel(`corner-exact:${k}`, `${k}`, pPmfEq(totalPmf, k), 0.09));
  out.push(market("corner-exact", "Total Exato de Escanteios", "escanteios", exactSel));

  const raceSel: Selection[] = [];
  for (const n of [5, 7, 9]) {
    const pHome = Math.pow(lh, n) / (Math.pow(lh, n) + Math.pow(la, n));
    raceSel.push(sel(`corner-race:${n}:h`, `${ctx.fixture.home} chega a ${n} primeiro`, pHome, 0.07));
    raceSel.push(sel(`corner-race:${n}:a`, `${ctx.fixture.away} chega a ${n} primeiro`, 1 - pHome, 0.07));
  }
  out.push(market("corner-race", "Corrida de Escanteios", "escanteios", raceSel));

  return out;
}

function cardsMarkets(ctx: Ctx): Market[] {
  const { env } = ctx;
  const out: Market[] = [];
  const lh = env.cardTotal * env.cardHomeShare;
  const la = env.cardTotal * (1 - env.cardHomeShare);
  const totalPmf = poissonPmf(env.cardTotal, 22);
  const homePmf = poissonPmf(lh, 16);
  const awayPmf = poissonPmf(la, 16);
  const pmf1 = poissonPmf(env.cardTotal * 0.42, 12);

  const totalSel: Selection[] = [];
  for (const line of [1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5]) {
    const over = pPmfOver(totalPmf, line);
    totalSel.push(sel(`cards:over:${line}`, `Mais de ${num(line)}`, over, 0.07));
    totalSel.push(sel(`cards:under:${line}`, `Menos de ${num(line)}`, 1 - over, 0.07));
  }
  out.push(market("cards", "Total de Cartões", "cartoes", totalSel));

  const firstHalfSel: Selection[] = [];
  for (const line of [0.5, 1.5, 2.5]) {
    const over = pPmfOver(pmf1, line);
    firstHalfSel.push(sel(`cards1:over:${line}`, `Mais de ${num(line)}`, over, 0.07));
    firstHalfSel.push(sel(`cards1:under:${line}`, `Menos de ${num(line)}`, 1 - over, 0.07));
  }
  out.push(market("cards1", "Cartões — 1º Tempo", "cartoes", firstHalfSel));

  const byTeam = (prefix: string, name: string, pmf: number[]): Market => {
    const selections: Selection[] = [];
    for (const line of [0.5, 1.5, 2.5]) {
      const over = pPmfOver(pmf, line);
      selections.push(sel(`${prefix}:over:${line}`, `Mais de ${num(line)}`, over, 0.07));
      selections.push(sel(`${prefix}:under:${line}`, `Menos de ${num(line)}`, 1 - over, 0.07));
    }
    return market(prefix, name, "cartoes", selections);
  };
  out.push(byTeam("cardsh", `Cartões — ${ctx.fixture.home}`, homePmf));
  out.push(byTeam("cardsa", `Cartões — ${ctx.fixture.away}`, awayPmf));

  const exactSel: Selection[] = [];
  for (const k of rangeCount(0, 9)) exactSel.push(sel(`card-exact:${k}`, `${k}`, pPmfEq(totalPmf, k), 0.09));
  out.push(market("card-exact", "Total Exato de Cartões", "cartoes", exactSel));

  const raceSel: Selection[] = [];
  for (const n of [1, 2]) {
    const pHome = Math.pow(lh, n) / (Math.pow(lh, n) + Math.pow(la, n));
    raceSel.push(sel(`card-race:${n}:h`, `${ctx.fixture.home} recebe o ${n}º cartão primeiro`, pHome, 0.07));
    raceSel.push(sel(`card-race:${n}:a`, `${ctx.fixture.away} recebe o ${n}º cartão primeiro`, 1 - pHome, 0.07));
  }
  out.push(market("card-race", "Corrida de Cartões", "cartoes", raceSel));

  return out;
}

function playerMarkets(ctx: Ctx): Market[] {
  const out: Market[] = [];
  const fixtures = [ctx.fixture.home, ctx.fixture.away];

  const mkPlayerMarket = (
    id: string,
    name: string,
    prob: (player: Player, index: number) => number,
    margin = 0.08,
  ): Market => {
    const selections = ctx.players.map((player, index) => {
      const p = prob(player, index % 18);
      const prefix = player.team === "h" ? fixtures[0] : fixtures[1];
      return sel(`p-${id}:${player.id}`, `${prefix} — ${player.name}`, p, margin);
    });
    return market(`p-${id}`, name, "jogadores", selections);
  };

  out.push(
    mkPlayerMarket("any", "Jogador Marca a Qualquer Momento", (p, i) => 1 - Math.exp(-lambdaForPlayer(ctx, i, p.team, "goal"))),
  );
  out.push(
    mkPlayerMarket("first", "Primeiro Marcador", (p, i) => {
      const l = lambdaForPlayer(ctx, i, p.team, "goal");
      const total = ctx.lh + ctx.la;
      return (l / total) * (1 - Math.exp(-total));
    }),
  );
  out.push(
    mkPlayerMarket("last", "Último Marcador", (p, i) => {
      const l = lambdaForPlayer(ctx, i, p.team, "goal");
      const total = ctx.lh + ctx.la;
      return (l / total) * (1 - Math.exp(-total));
    }),
  );
  out.push(
    mkPlayerMarket("2plus", "Jogador Marca 2 ou Mais Gols", (p, i) => {
      const l = lambdaForPlayer(ctx, i, p.team, "goal");
      return 1 - Math.exp(-l) - l * Math.exp(-l);
    }),
  );
  out.push(
    mkPlayerMarket("assist", "Jogador Dá Assistência", (p, i) => 1 - Math.exp(-lambdaForPlayer(ctx, i, p.team, "assist"))),
  );
  out.push(
    mkPlayerMarket("card", "Jogador Recebe Cartão", (p, i) => 1 - Math.exp(-lambdaForPlayer(ctx, i, p.team, "card"))),
  );
  out.push(
    mkPlayerMarket("goa", "Jogador Marca ou Dá Assistência", (p, i) => {
      const lg = lambdaForPlayer(ctx, i, p.team, "goal");
      const la = lambdaForPlayer(ctx, i, p.team, "assist");
      return 1 - Math.exp(-(lg + la));
    }),
  );

  return out;
}

function comboProb(...probs: number[]): number {
  return probs.reduce((acc, p) => acc * p, 1);
}

function combinadasMarkets(ctx: Ctx): Market[] {
  const { joint, fixture, env } = ctx;
  const out: Market[] = [];
  const p1 = pResult(joint, "1");
  const px = pResult(joint, "X");
  const p2 = pResult(joint, "2");
  const bttsY = (1 - ctx.homePmf[0]) * (1 - ctx.awayPmf[0]);

  const lines = [2.5, 3.5];
  const rtSel: Selection[] = [];
  for (const line of lines) {
    const over = pTotalOver(joint, line);
    const under = 1 - over;
    for (const [code, p] of [["1", p1], ["X", px], ["2", p2]] as const) {
      rtSel.push(
        sel(`combo:r:${code}|ou:over:${line}`, `${code === "1" ? fixture.home : code === "X" ? "Empate" : fixture.away} & Mais de ${num(line)}`, comboProb(p, over), 0.09),
      );
      rtSel.push(
        sel(`combo:r:${code}|ou:under:${line}`, `${code === "1" ? fixture.home : code === "X" ? "Empate" : fixture.away} & Menos de ${num(line)}`, comboProb(p, under), 0.09),
      );
    }
  }
  out.push(market("combo-rt", "Resultado + Total de Gols", "combinadas", rtSel));

  const dctSel: Selection[] = [];
  for (const [code, p] of [["1X", p1 + px], ["12", p1 + p2], ["X2", px + p2]] as const) {
    const over = pTotalOver(joint, 2.5);
    const under = 1 - over;
    dctSel.push(sel(`combo:dc:${code}|ou:over:2.5`, `Dupla Chance ${code} & Mais de 2,5`, comboProb(p, over), 0.09));
    dctSel.push(sel(`combo:dc:${code}|ou:under:2.5`, `Dupla Chance ${code} & Menos de 2,5`, comboProb(p, under), 0.09));
  }
  out.push(market("combo-dct", "Dupla Chance + Total de Gols", "combinadas", dctSel));

  const rbSel: Selection[] = [];
  for (const [code, p] of [["1", p1], ["X", px], ["2", p2]] as const) {
    rbSel.push(sel(`combo:r:${code}|btts:y`, `${code} & Ambas Marcam — Sim`, comboProb(p, bttsY), 0.09));
    rbSel.push(sel(`combo:r:${code}|btts:n`, `${code} & Ambas Marcam — Não`, comboProb(p, 1 - bttsY), 0.09));
  }
  out.push(market("combo-rb", "Resultado + Ambas Marcam", "combinadas", rbSel));

  const btSel: Selection[] = [];
  {
    const over = pTotalOver(joint, 2.5);
    btSel.push(sel("combo:btts:y|ou:over:2.5", "Ambas Marcam & Mais de 2,5", comboProb(bttsY, over), 0.09));
    btSel.push(sel("combo:btts:y|ou:under:2.5", "Ambas Marcam & Menos de 2,5", comboProb(bttsY, 1 - over), 0.09));
    btSel.push(sel("combo:btts:n|ou:over:2.5", "Não Ambas & Mais de 2,5", comboProb(1 - bttsY, over), 0.09));
    btSel.push(sel("combo:btts:n|ou:under:2.5", "Não Ambas & Menos de 2,5", comboProb(1 - bttsY, 1 - over), 0.09));
  }
  out.push(market("combo-bt", "Ambas Marcam + Total de Gols", "combinadas", btSel));

  const totalCornersPmf = poissonPmf(env.cornerTotal, 32);
  const rcSel: Selection[] = [];
  for (const line of [8.5, 9.5]) {
    const over = pPmfOver(totalCornersPmf, line);
    const under = 1 - over;
    for (const [code, p] of [["1", p1], ["X", px], ["2", p2]] as const) {
      rcSel.push(sel(`combo:r:${code}|corners:over:${line}`, `${code} & Mais de ${num(line)} escanteios`, comboProb(p, over), 0.09));
      rcSel.push(sel(`combo:r:${code}|corners:under:${line}`, `${code} & Menos de ${num(line)} escanteios`, comboProb(p, under), 0.09));
    }
  }
  out.push(market("combo-rc", "Resultado + Total de Escanteios", "combinadas", rcSel));

  const totalCardsPmf = poissonPmf(env.cardTotal, 22);
  const rkSel: Selection[] = [];
  for (const line of [3.5, 4.5]) {
    const over = pPmfOver(totalCardsPmf, line);
    const under = 1 - over;
    for (const [code, p] of [["1", p1], ["X", px], ["2", p2]] as const) {
      rkSel.push(sel(`combo:r:${code}|cards:over:${line}`, `${code} & Mais de ${num(line)} cartões`, comboProb(p, over), 0.09));
      rkSel.push(sel(`combo:r:${code}|cards:under:${line}`, `${code} & Menos de ${num(line)} cartões`, comboProb(p, under), 0.09));
    }
  }
  out.push(market("combo-rk", "Resultado + Total de Cartões", "combinadas", rkSel));

  return out;
}

function extrasMarkets(ctx: Ctx): Market[] {
  const out: Market[] = [];
  const totalLambda = ctx.lh + ctx.la;

  const bandSel: Selection[] = [];
  for (const band of GOAL_BANDS) {
    const p = 1 - Math.exp(-totalLambda * (15 / 90));
    bandSel.push(sel(`band:${band}:y`, `Gol de ${band} min`, p, 0.08));
    bandSel.push(sel(`band:${band}:n`, `Sem gol de ${band} min`, 1 - p, 0.08));
  }
  out.push(market("band", "Faixa de Gols (Por Período)", "extras", bandSel));

  const bandhSel: Selection[] = [];
  for (const band of GOAL_BANDS) {
    const pH = 1 - Math.exp(-ctx.lh * (15 / 90));
    const pA = 1 - Math.exp(-ctx.la * (15 / 90));
    bandhSel.push(sel(`bandh:${band}:y`, `${ctx.fixture.home} marca de ${band} min`, pH, 0.08));
    bandhSel.push(sel(`banda:${band}:y`, `${ctx.fixture.away} marca de ${band} min`, pA, 0.08));
  }
  out.push(market("bandh", "Time Marca na Faixa", "extras", bandhSel));

  const bhtt = ctx.half.bothHalvesGoal;
  out.push(
    market("bhtt", "Gols em Ambos os Tempos", "extras", [
      sel("bhtt:y", "Sim", bhtt, 0.07),
      sel("bhtt:n", "Não", 1 - bhtt, 0.07),
    ]),
  );

  return out;
}

// ───────────────────────────── padding markets ────────────────────────────

function padMarkets(ctx: Ctx): Market[] {
  const out: Market[] = [];
  const { joint, fixture, env, half } = ctx;
  const p1 = pResult(joint, "1");
  const px = pResult(joint, "X");
  const p2 = pResult(joint, "2");
  const totalPmf = poissonPmf(ctx.lh + ctx.la, 40);
  const totalCornersPmf = poissonPmf(env.cornerTotal, 40);
  const totalCardsPmf = poissonPmf(env.cardTotal, 30);
  const q = ctx.players;
  const teams = [fixture.home, fixture.away];

  // Extended total goals lines
  {
    const s: Selection[] = [];
    for (const line of [6.5, 7.5, 8.5, 9.5, 10.5]) {
      const over = pPmfOver(totalPmf, line);
      s.push(sel(`ou:over:${line}`, `Mais de ${num(line)} gols`, over));
      s.push(sel(`ou:under:${line}`, `Menos de ${num(line)} gols`, 1 - over));
    }
    out.push(market("ou-altas", "Total de Gols — Linhas Altas", "gols", s));
  }

  // Extended exact total goals
  {
    const s: Selection[] = [];
    for (const k of [11, 12, 13]) s.push(sel(`exactgoals:${k}`, `${k} gols`, pPmfEq(totalPmf, k), 0.08));
    let more = 0;
    for (let k = 14; k < totalPmf.length; k++) more += totalPmf[k];
    s.push(sel("exactgoals:14p", "14 ou mais gols", more, 0.08));
    out.push(market("exactgoals-altas", "Total Exato de Gols — Linhas Altas", "resultado", s));
  }

  // Extended corners
  {
    const s: Selection[] = [];
    for (const line of [15.5, 16.5, 17.5, 18.5, 19.5, 20.5, 21.5, 22.5, 23.5, 24.5]) {
      const over = pPmfOver(totalCornersPmf, line);
      s.push(sel(`corners:over:${line}`, `Mais de ${num(line)}`, over, 0.07));
      s.push(sel(`corners:under:${line}`, `Menos de ${num(line)}`, 1 - over, 0.07));
    }
    out.push(market("corners-altas", "Escanteios — Linhas Altas", "escanteios", s));
  }
  {
    const pmf1 = poissonPmf(env.cornerTotal * 0.45, 24);
    const s: Selection[] = [];
    for (const line of [7.5, 8.5, 9.5, 10.5, 11.5, 12.5]) {
      const over = pPmfOver(pmf1, line);
      s.push(sel(`corners1:over:${line}`, `Mais de ${num(line)}`, over, 0.07));
      s.push(sel(`corners1:under:${line}`, `Menos de ${num(line)}`, 1 - over, 0.07));
    }
    out.push(market("corners1-altas", "Escanteios 1º Tempo — Linhas Altas", "escanteios", s));
  }
  {
    const lh = env.cornerTotal * env.cornerHomeShare;
    const la = env.cornerTotal * (1 - env.cornerHomeShare);
    const s: Selection[] = [];
    for (const line of [9.5, 10.5, 11.5, 12.5, 13.5, 14.5, 15.5, 16.5]) {
      const overH = pPmfOver(poissonPmf(lh, 40), line);
      const overA = pPmfOver(poissonPmf(la, 40), line);
      s.push(sel(`cornersh:over:${line}`, `${fixture.home} — Mais de ${num(line)}`, overH, 0.07));
      s.push(sel(`cornersh:under:${line}`, `${fixture.home} — Menos de ${num(line)}`, 1 - overH, 0.07));
      s.push(sel(`cornersa:over:${line}`, `${fixture.away} — Mais de ${num(line)}`, overA, 0.07));
      s.push(sel(`cornersa:under:${line}`, `${fixture.away} — Menos de ${num(line)}`, 1 - overA, 0.07));
    }
    out.push(market("corners-times-altas", "Escanteios por Time — Linhas Altas", "escanteios", s));
  }
  {
    const s: Selection[] = [];
    for (const k of rangeCount(15, 24)) s.push(sel(`corner-exact:${k}`, `${k}`, pPmfEq(totalCornersPmf, k), 0.09));
    out.push(market("corner-exact-altas", "Total Exato de Escanteios — Linhas Altas", "escanteios", s));
  }
  {
    const lh = env.cornerTotal * env.cornerHomeShare;
    const la = env.cornerTotal * (1 - env.cornerHomeShare);
    const s: Selection[] = [];
    for (const team of [0, 1] as const) {
      const pmf = poissonPmf(team === 0 ? lh : la, 40);
      const prefix = team === 0 ? "corner-exacth" : "corner-exacta";
      const name = teams[team];
      for (const k of rangeCount(0, 12)) s.push(sel(`${prefix}:${k}`, `${name} — ${k}`, pPmfEq(pmf, k), 0.09));
    }
    out.push(market("corner-exact-times", "Total Exato de Escanteios por Time", "escanteios", s));
  }

  // Extended cards
  {
    const s: Selection[] = [];
    for (const line of [8.5, 9.5, 10.5, 11.5, 12.5, 13.5, 14.5]) {
      const over = pPmfOver(totalCardsPmf, line);
      s.push(sel(`cards:over:${line}`, `Mais de ${num(line)}`, over, 0.07));
      s.push(sel(`cards:under:${line}`, `Menos de ${num(line)}`, 1 - over, 0.07));
    }
    out.push(market("cards-altas", "Cartões — Linhas Altas", "cartoes", s));
  }
  {
    const lh = env.cardTotal * env.cardHomeShare;
    const la = env.cardTotal * (1 - env.cardHomeShare);
    const s: Selection[] = [];
    for (const line of [3.5, 4.5, 5.5, 6.5]) {
      const overH = pPmfOver(poissonPmf(lh, 26), line);
      const overA = pPmfOver(poissonPmf(la, 26), line);
      s.push(sel(`cardsh:over:${line}`, `${fixture.home} — Mais de ${num(line)}`, overH, 0.07));
      s.push(sel(`cardsh:under:${line}`, `${fixture.home} — Menos de ${num(line)}`, 1 - overH, 0.07));
      s.push(sel(`cardsa:over:${line}`, `${fixture.away} — Mais de ${num(line)}`, overA, 0.07));
      s.push(sel(`cardsa:under:${line}`, `${fixture.away} — Menos de ${num(line)}`, 1 - overA, 0.07));
    }
    out.push(market("cards-times-altas", "Cartões por Time — Linhas Altas", "cartoes", s));
  }
  {
    const pmf1 = poissonPmf(env.cardTotal * 0.42, 20);
    const s: Selection[] = [];
    for (const line of [3.5, 4.5, 5.5]) {
      const over = pPmfOver(pmf1, line);
      s.push(sel(`cards1:over:${line}`, `Mais de ${num(line)}`, over, 0.07));
      s.push(sel(`cards1:under:${line}`, `Menos de ${num(line)}`, 1 - over, 0.07));
    }
    out.push(market("cards1-altas", "Cartões 1º Tempo — Linhas Altas", "cartoes", s));
  }
  {
    const s: Selection[] = [];
    for (const k of rangeCount(10, 18)) s.push(sel(`card-exact:${k}`, `${k}`, pPmfEq(totalCardsPmf, k), 0.09));
    out.push(market("card-exact-altas", "Total Exato de Cartões — Linhas Altas", "cartoes", s));
  }
  {
    const lh = env.cardTotal * env.cardHomeShare;
    const la = env.cardTotal * (1 - env.cardHomeShare);
    const s: Selection[] = [];
    for (const team of [0, 1] as const) {
      const pmf = poissonPmf(team === 0 ? lh : la, 26);
      const prefix = team === 0 ? "card-exacth" : "card-exacta";
      const name = teams[team];
      for (const k of rangeCount(0, 10)) s.push(sel(`${prefix}:${k}`, `${name} — ${k}`, pPmfEq(pmf, k), 0.09));
    }
    out.push(market("card-exact-times", "Total Exato de Cartões por Time", "cartoes", s));
  }
  {
    const pmf1 = poissonPmf(env.cardTotal * 0.42, 14);
    const s: Selection[] = [];
    for (const k of rangeCount(0, 5)) s.push(sel(`card-exact1:${k}`, `${k}`, pPmfEq(pmf1, k), 0.09));
    out.push(market("card-exact1", "Total Exato de Cartões — 1º Tempo", "cartoes", s));
  }

  // Half-time asian handicaps
  const halfAh = (phase: 1 | 2): Market[] => {
    const pmf = phase === 1 ? half.p1 : half.p2;
    const result: Market[] = [];
    const lines: number[] = [];
    for (let l = -2; l <= 2; l += 0.25) lines.push(Number(l.toFixed(2)));
    for (const line of lines) {
      const sub = (t: number, sign: 1 | -1): number => {
        let p = 0;
        for (let i = 0; i < pmf.length; i++) {
          for (let j = 0; j < pmf[i].length; j++) {
            if (sign * (i - j) > t) p += pmf[i][j];
          }
        }
        return p;
      };
      const coverHome = (sub(line - 0.25, 1) + sub(line + 0.25, 1)) / 2;
      const coverAway = (sub(-line - 0.25, -1) + sub(-line + 0.25, -1)) / 2;
      result.push(
        market(`ah${phase}t:${line}`, `${phase === 1 ? "1º Tempo" : "2º Tempo"} — Handicap Asiático (${signedNum(line)})`, "tempos", [
          sel(`ah1t:1:${phase}:${line}`, `${fixture.home} ${signedNum(line)}`, coverHome),
          sel(`ah1t:2:${phase}:${line}`, `${fixture.away} ${signedNum(-line)}`, coverAway),
        ]),
      );
    }
    return result;
  };
  out.push(...halfAh(1));
  out.push(...halfAh(2));

  // Player extended markets
  {
    const mk = (suffix: string, name: string, prob: (index: number, side: "h" | "a") => number, margin = 0.08): Market => {
      const selections = q.map((player, index) => {
        const team = player.team;
        const name2 = team === "h" ? fixture.home : fixture.away;
        return sel(`p-${suffix}:${player.id}`, `${name2} — ${player.name}`, prob(index % 18, team), margin);
      });
      return market(`p-${suffix}`, name, "jogadores", selections);
    };
    out.push(
      mk("1h", "Jogador Marca no 1º Tempo", (i, side) => {
        const l = lambdaForPlayer(ctx, i, side, "goal") * 0.46;
        return 1 - Math.exp(-l);
      }),
    );
    out.push(
      mk("2h", "Jogador Marca no 2º Tempo", (i, side) => {
        const l = lambdaForPlayer(ctx, i, side, "goal") * 0.54;
        return 1 - Math.exp(-l);
      }),
    );
    out.push(
      mk("3plus", "Jogador Marca 3 ou Mais Gols", (i, side) => {
        const l = lambdaForPlayer(ctx, i, side, "goal");
        return 1 - Math.exp(-l) * (1 + l + (l * l) / 2);
      }),
    );
    out.push(
      mk("bothhalves", "Jogador Marca em Ambos os Tempos", (i, side) => {
        const l = lambdaForPlayer(ctx, i, side, "goal");
        return (1 - Math.exp(-l * 0.46)) * (1 - Math.exp(-l * 0.54));
      }),
    );
    out.push(
      mk("card1", "Jogador Recebe Cartão no 1º Tempo", (i, side) => {
        const l = lambdaForPlayer(ctx, i, side, "card") * 0.42;
        return 1 - Math.exp(-l);
      }),
    );
  }

  // Player x result combos
  {
    const s: Selection[] = [];
    for (const player of q) {
      const name = player.team === "h" ? fixture.home : fixture.away;
      const i = Number(player.id.split("-")[1]) - 1;
      const l = lambdaForPlayer(ctx, i, player.team, "goal");
      const pAny = 1 - Math.exp(-l);
      const win = player.team === "h" ? p1 : p2;
      s.push(sel(`combo:p-any:${player.id}|r:${player.team === "h" ? "1" : "2"}`, `${name} — ${player.name} marca & vitória`, comboProb(pAny, win), 0.1));
    }
    out.push(market("combo-pr", "Jogador Marca + Vitória do Time", "combinadas", s));
  }
  {
    const s: Selection[] = [];
    const over = pTotalOver(joint, 2.5);
    for (const player of q) {
      const name = player.team === "h" ? fixture.home : fixture.away;
      const i = Number(player.id.split("-")[1]) - 1;
      const l = lambdaForPlayer(ctx, i, player.team, "goal");
      const pAny = 1 - Math.exp(-l);
      s.push(sel(`combo:p-any:${player.id}|ou:over:2.5`, `${name} — ${player.name} marca & Mais de 2,5`, comboProb(pAny, over), 0.1));
    }
    out.push(market("combo-po", "Jogador Marca + Total de Gols", "combinadas", s));
  }

  // Combos with many goal lines (large pool used for exact filling)
  {
    const s: Selection[] = [];
    for (let line = 4.5; line <= 24.5; line += 1) {
      const over = pPmfOver(totalPmf, line);
      for (const [code, p] of [["1", p1], ["X", px], ["2", p2]] as const) {
        s.push(sel(`combo:r:${code}|ou:over:${line}`, `${code} & Mais de ${num(line)}`, comboProb(p, over), 0.1));
        s.push(sel(`combo:r:${code}|ou:under:${line}`, `${code} & Menos de ${num(line)}`, comboProb(p, 1 - over), 0.1));
      }
    }
    out.push(market("combo-rt-ext", "Resultado + Total de Gols (Linhas Estendidas)", "combinadas", s));
  }

  // Extra result x corners combos
  {
    const s: Selection[] = [];
    for (const team of [0, 1] as const) {
      const pWin = team === 0 ? p1 : p2;
      const name = teams[team];
      s.push(sel(`combo:r:${team === 0 ? "1" : "2"}|corners:over:10.5`, `${name} vence & Mais de 10,5 escanteios`, comboProb(pWin, pPmfOver(totalCornersPmf, 10.5)), 0.1));
      s.push(sel(`combo:r:${team === 0 ? "1" : "2"}|corners:over:11.5`, `${name} vence & Mais de 11,5 escanteios`, comboProb(pWin, pPmfOver(totalCornersPmf, 11.5)), 0.1));
    }
    out.push(market("combo-rc-ext", "Resultado + Escanteios (Linhas Altas)", "combinadas", s));
  }

  // Exact goals by half
  {
    const s: Selection[] = [];
    for (const k of rangeCount(0, 4)) {
      const pTotal = pPmfEq(poissonPmf(ctx.lh * 0.46 + ctx.la * 0.46, 20), k);
      s.push(sel(`exactgoals1:${k}`, `1º tempo — ${k} gol${k === 1 ? "" : "s"}`, pTotal, 0.09));
    }
    for (const k of rangeCount(0, 4)) {
      const pTotal = pPmfEq(poissonPmf(ctx.lh * 0.54 + ctx.la * 0.54, 20), k);
      s.push(sel(`exactgoals2:${k}`, `2º tempo — ${k} gol${k === 1 ? "" : "s"}`, pTotal, 0.09));
    }
    for (const k of [5, 6]) {
      const pdf1 = poissonPmf(ctx.lh * 0.46 + ctx.la * 0.46, 20);
      const pdf2 = poissonPmf(ctx.lh * 0.54 + ctx.la * 0.54, 20);
      s.push(sel(`exactgoals1:${k}p`, `1º tempo — ${k}+ gols`, 1 - pdf1.slice(0, k).reduce((a, v) => a + v, 0), 0.09));
      s.push(sel(`exactgoals2:${k}p`, `2º tempo — ${k}+ gols`, 1 - pdf2.slice(0, k).reduce((a, v) => a + v, 0), 0.09));
    }
    out.push(market("exactgoals-halves", "Total Exato de Gols por Tempo", "tempos", s));
  }

  // Goal within threshold (yes/no)
  {
    const s: Selection[] = [];
    for (const t of [5, 10, 20, 25, 35, 40, 50, 55, 65, 70, 80, 85]) {
      const yes = 1 - Math.exp(-(ctx.lh + ctx.la) * (t / 90));
      s.push(sel(`goal-until:${t}:y`, `Gol até os ${t} min — Sim`, yes, 0.07));
      s.push(sel(`goal-until:${t}:n`, `Gol até os ${t} min — Não`, 1 - yes, 0.07));
    }
    out.push(market("goal-until", "Haverá Gol Até…", "gols", s));
  }

  // Extended team totals
  {
    const s: Selection[] = [];
    for (const line of [7.5, 8.5, 9.5, 10.5]) {
      const overH = pPmfOver(ctx.homePmf, line);
      const overA = pPmfOver(ctx.awayPmf, line);
      s.push(sel(`ouh:over:${line}`, `${fixture.home} — Mais de ${num(line)}`, overH, 0.08));
      s.push(sel(`ouh:under:${line}`, `${fixture.home} — Menos de ${num(line)}`, 1 - overH, 0.08));
      s.push(sel(`oua:over:${line}`, `${fixture.away} — Mais de ${num(line)}`, overA, 0.08));
      s.push(sel(`oua:under:${line}`, `${fixture.away} — Menos de ${num(line)}`, 1 - overA, 0.08));
    }
    out.push(market("times-altas", "Gols por Time — Linhas Altas", "gols", s));
  }

  // Half team totals
  {
    const s: Selection[] = [];
    for (const phase of [1, 2] as const) {
      const lh = ctx.lh * (phase === 1 ? 0.46 : 0.54);
      const la = ctx.la * (phase === 1 ? 0.46 : 0.54);
      const pmfH = poissonPmf(lh, 16);
      const pmfA = poissonPmf(la, 16);
      for (const line of [0.5, 1.5, 2.5, 3.5]) {
        const overH = pPmfOver(pmfH, line);
        const overA = pPmfOver(pmfA, line);
        s.push(sel(`ouh${phase}:over:${line}`, `${phase}ºT — ${fixture.home} mais de ${num(line)}`, overH, 0.08));
        s.push(sel(`ouh${phase}:under:${line}`, `${phase}ºT — ${fixture.home} menos de ${num(line)}`, 1 - overH, 0.08));
        s.push(sel(`oua${phase}:over:${line}`, `${phase}ºT — ${fixture.away} mais de ${num(line)}`, overA, 0.08));
        s.push(sel(`oua${phase}:under:${line}`, `${phase}ºT — ${fixture.away} menos de ${num(line)}`, 1 - overA, 0.08));
      }
    }
    out.push(market("times-tempos", "Gols por Time e Tempo", "gols", s));
  }

  // Corners and cards by team, 1st half
  {
    const s: Selection[] = [];
    const lh = env.cornerTotal * env.cornerHomeShare * 0.45;
    const la = env.cornerTotal * (1 - env.cornerHomeShare) * 0.45;
    const pmfH = poissonPmf(lh, 16);
    const pmfA = poissonPmf(la, 16);
    for (const line of [1.5, 2.5, 3.5, 4.5]) {
      const overH = pPmfOver(pmfH, line);
      const overA = pPmfOver(pmfA, line);
      s.push(sel(`cornersh1:over:${line}`, `1ºT — ${fixture.home} mais de ${num(line)}`, overH, 0.07));
      s.push(sel(`cornersh1:under:${line}`, `1ºT — ${fixture.home} menos de ${num(line)}`, 1 - overH, 0.07));
      s.push(sel(`cornersa1:over:${line}`, `1ºT — ${fixture.away} mais de ${num(line)}`, overA, 0.07));
      s.push(sel(`cornersa1:under:${line}`, `1ºT — ${fixture.away} menos de ${num(line)}`, 1 - overA, 0.07));
    }
    out.push(market("corners-tempos", "Escanteios por Time — 1º Tempo", "escanteios", s));
  }
  {
    const s: Selection[] = [];
    const lh = env.cardTotal * env.cardHomeShare * 0.42;
    const la = env.cardTotal * (1 - env.cardHomeShare) * 0.42;
    const pmfH = poissonPmf(lh, 12);
    const pmfA = poissonPmf(la, 12);
    for (const line of [0.5, 1.5, 2.5]) {
      const overH = pPmfOver(pmfH, line);
      const overA = pPmfOver(pmfA, line);
      s.push(sel(`cardsh1:over:${line}`, `1ºT — ${fixture.home} mais de ${num(line)}`, overH, 0.07));
      s.push(sel(`cardsh1:under:${line}`, `1ºT — ${fixture.home} menos de ${num(line)}`, 1 - overH, 0.07));
      s.push(sel(`cardsa1:over:${line}`, `1ºT — ${fixture.away} mais de ${num(line)}`, overA, 0.07));
      s.push(sel(`cardsa1:under:${line}`, `1ºT — ${fixture.away} menos de ${num(line)}`, 1 - overA, 0.07));
    }
    out.push(market("cards-tempos", "Cartões por Time — 1º Tempo", "cartoes", s));
  }

  // Corner races extended
  {
    const lh = env.cornerTotal * env.cornerHomeShare;
    const la = env.cornerTotal * (1 - env.cornerHomeShare);
    const s: Selection[] = [];
    for (const n of [11, 13]) {
      const pHome = Math.pow(lh, n) / (Math.pow(lh, n) + Math.pow(la, n));
      s.push(sel(`corner-race:${n}:h`, `${fixture.home} chega a ${n} primeiro`, pHome, 0.07));
      s.push(sel(`corner-race:${n}:a`, `${fixture.away} chega a ${n} primeiro`, 1 - pHome, 0.07));
    }
    out.push(market("corner-race-altas", "Corrida de Escanteios — Linhas Altas", "escanteios", s));
  }

  // Win both halves + goals per half comparisons
  {
    const s: Selection[] = [
      sel("winboth:h", `${fixture.home} vence os dois tempos`, half.winBothHalves[0], 0.09),
      sel("winboth:a", `${fixture.away} vence os dois tempos`, half.winBothHalves[1], 0.09),
    ];
    out.push(market("winboth", "Vitória nos Dois Tempos", "tempos", s));
  }
  {
    const s: Selection[] = [
      sel("moregoals:1t", "Mais gols no 1º tempo", half.moreGoals[0], 0.07),
      sel("moregoals:eq", "Igual número de gols", half.moreGoals[2], 0.07),
      sel("moregoals:2t", "Mais gols no 2º tempo", half.moreGoals[1], 0.07),
    ];
    out.push(market("moregoals", "Tempo com Mais Gols", "tempos", s));
  }

  // Dupla chance por tempo
  {
    const s: Selection[] = [];
    const r1 = half.halfResult;
    const r2 = half.secondResult;
    s.push(sel("dc1t:1X", "1ºT — Dupla Chance 1X", r1[0] + r1[1], 0.07));
    s.push(sel("dc1t:12", "1ºT — Dupla Chance 12", r1[0] + r1[2], 0.07));
    s.push(sel("dc1t:X2", "1ºT — Dupla Chance X2", r1[1] + r1[2], 0.07));
    s.push(sel("dc2t:1X", "2ºT — Dupla Chance 1X", r2[0] + r2[1], 0.07));
    s.push(sel("dc2t:12", "2ºT — Dupla Chance 12", r2[0] + r2[2], 0.07));
    s.push(sel("dc2t:X2", "2ºT — Dupla Chance X2", r2[1] + r2[2], 0.07));
    out.push(market("dc-tempos", "Dupla Chance por Tempo", "tempos", s));
  }

  // HT BTTS x HT result
  {
    const s: Selection[] = [];
    let b1y = 0;
    {
      let pNoH1 = 0;
      let pNoA1 = 0;
      for (let i = 0; i < half.p1.length; i++) {
        pNoH1 += half.p1[0][i];
        pNoA1 += half.p1[i][0];
      }
      b1y = (1 - pNoH1) * (1 - pNoA1);
    }
    for (const [code, p] of [["1", half.halfResult[0]], ["X", half.halfResult[1]], ["2", half.halfResult[2]]] as const) {
      s.push(sel(`combo1t:r:${code}|btts1:y`, `1ºT — ${code} & Ambas Marcam`, comboProb(p, b1y), 0.1));
      s.push(sel(`combo1t:r:${code}|btts1:n`, `1ºT — ${code} & Não Ambas Marcam`, comboProb(p, 1 - b1y), 0.1));
    }
    out.push(market("combo-1t-btts", "1º Tempo — Resultado + Ambas Marcam", "combinadas", s));
  }

  return out;
}

// ──────────────────────────── assembling 1500 ─────────────────────────────

function countSelections(markets: Market[]): number {
  return markets.reduce((acc, m) => acc + m.selections.length, 0);
}

function emergencyMarket(ctx: Ctx, index: number, outcome: string, line: number): Market {
  const { joint, fixture } = ctx;
  const resultMap: Record<string, number> = {
    "1": pResult(joint, "1"),
    X: pResult(joint, "X"),
    "2": pResult(joint, "2"),
  };
  const p = resultMap[outcome];
  const over = pPmfOver(poissonPmf(ctx.lh + ctx.la, 60), line);
  const label = outcome === "1" ? fixture.home : outcome === "X" ? "Empate" : fixture.away;
  return market(`extra-combo-${index}`, `Resultado + Total (${num(line)})`, "combinadas", [
    sel(`combo:r:${outcome}|ou:over:${line}`, `${label} & Mais de ${num(line)} gols`, comboProb(p, over), 0.1),
    sel(`combo:r:${outcome}|ou:under:${line}`, `${label} & Menos de ${num(line)} gols`, comboProb(p, 1 - over), 0.1),
  ]);
}

export function buildMarkets(fixture: Fixture): Market[] {
  const ctx = buildContext(fixture);
  const out: Market[] = [
    ...popularMarkets(ctx),
    ...resultadoMarkets(ctx),
    ...goalsMarkets(ctx),
    ...temposMarkets(ctx),
    ...cornersMarkets(ctx),
    ...cardsMarkets(ctx),
    ...playerMarkets(ctx),
    ...combinadasMarkets(ctx),
    ...extrasMarkets(ctx),
  ];

  let total = countSelections(out);

  for (const m of padMarkets(ctx)) {
    if (total >= MARKETS_PER_MATCH) break;
    if (total + m.selections.length <= MARKETS_PER_MATCH) {
      out.push(m);
      total += m.selections.length;
    } else {
      out.push({ ...m, selections: m.selections.slice(0, MARKETS_PER_MATCH - total) });
      total = MARKETS_PER_MATCH;
    }
  }

  let guard = 0;
  while (total < MARKETS_PER_MATCH && guard < 3000) {
    const line = 25.5 + guard;
    for (const outcome of ["1", "X", "2"]) {
      if (total >= MARKETS_PER_MATCH) break;
      const m = emergencyMarket(ctx, guard, outcome, line);
      out.push(m);
      total += m.selections.length;
    }
    guard++;
  }

  return out;
}

export function getMainOdds(fixture: Fixture): { home: number; draw: number; away: number } {
  const { lh, la } = expectedGoals(fixture.home, fixture.away);
  const joint = jointPmf(lh, la);
  return {
    home: oddsFromProb(pResult(joint, "1")),
    draw: oddsFromProb(pResult(joint, "X")),
    away: oddsFromProb(pResult(joint, "2")),
  };
}

export function findSelection(fixture: Fixture, selectionId: string): { market: Market; selection: Selection } | null {
  for (const m of buildMarkets(fixture)) {
    const s = m.selections.find((x) => x.id === selectionId);
    if (s) return { market: m, selection: s };
  }
  return null;
}

// ─────────────────────────────── settlement ───────────────────────────────

type EvalStats = {
  gh: number;
  ga: number;
  htGh: number;
  htGa: number;
  shGh: number;
  shGa: number;
  diff: number;
  total: number;
  firstTeam: "h" | "a" | "none";
  lastTeam: "h" | "a" | "none";
  goals: { minute: number; team: "h" | "a"; playerId: string; assistId?: string }[];
  cards: { minute: number; team: "h" | "a"; playerId: string; red: boolean }[];
  corners: { minute: number; team: "h" | "a" }[];
};

export function statsForEval(stats: MatchStats): EvalStats {
  const goals = stats.goals.map((g) => ({
    minute: g.minute,
    team: g.team,
    playerId: g.playerId,
    assistId: g.assistId,
  }));
  const cards = stats.cards.map((c) => ({
    minute: c.minute,
    team: c.team,
    playerId: c.playerId,
    red: c.red,
  }));
  const corners = stats.corners.map((c) => ({ minute: c.minute, team: c.team }));

  const htGh = goals.filter((g) => g.team === "h" && g.minute <= 45).length;
  const htGa = goals.filter((g) => g.team === "a" && g.minute <= 45).length;
  const shGh = goals.filter((g) => g.team === "h" && g.minute > 45).length;
  const shGa = goals.filter((g) => g.team === "a" && g.minute > 45).length;
  let firstTeam: "h" | "a" | "none" = "none";
  let lastTeam: "h" | "a" | "none" = "none";
  if (goals.length) {
    const sorted = goals.slice().sort((a, b) => a.minute - b.minute);
    firstTeam = sorted[0].team;
    lastTeam = sorted[sorted.length - 1].team;
  }
  return {
    gh: htGh + shGh,
    ga: htGa + shGa,
    htGh,
    htGa,
    shGh,
    shGa,
    diff: htGh + shGh - (htGa + shGa),
    total: htGh + shGh + htGa + shGa,
    firstTeam,
    lastTeam,
    goals,
    cards,
    corners,
  };
}

const BANDS: Record<string, (m: number) => boolean> = {
  "1-15": (m) => m >= 1 && m <= 15,
  "16-30": (m) => m >= 16 && m <= 30,
  "31-45": (m) => m >= 31 && m <= 45,
  "46-60": (m) => m >= 46 && m <= 60,
  "61-75": (m) => m >= 61 && m <= 75,
  "76-90": (m) => m >= 76 && m <= 94,
};

function resultCode(h: number, a: number): "1" | "X" | "2" {
  if (h > a) return "1";
  if (h === a) return "X";
  return "2";
}

function raceWinner(events: { minute: number; team: "h" | "a" }[], target: number): "h" | "a" | "none" {
  const sorted = events.slice().sort((a, b) => a.minute - b.minute);
  let h = 0;
  let a = 0;
  for (const ev of sorted) {
    if (ev.team === "h") h++;
    else a++;
    if (h >= target && a >= target) return ev.team;
    if (h >= target) return "h";
    if (a >= target) return "a";
  }
  return "none";
}

export function evaluateSelection(selectionId: string, stats: MatchStats): "win" | "lose" | "void" {
  const s = statsForEval(stats);
  return evaluate(s, selectionId);
}

function evaluate(s: EvalStats, id: string): "win" | "lose" | "void" {
  const parts = id.split(":");
  const kind = parts[0];

  if (kind === "combo") {
    const body = id.slice("combo:".length);
    const pieces = body.split("|");
    let win = true;
    for (const piece of pieces) {
      const r = evaluate(s, piece);
      if (r === "lose") return "lose";
      if (r === "void") win = false;
    }
    return win ? "win" : "void";
  }

  switch (kind) {
    case "r":
      return resultCode(s.gh, s.ga) === parts[1] ? "win" : "lose";
    case "dc": {
      const code = resultCode(s.gh, s.ga);
      return parts[1].includes(code) ? "win" : "lose";
    }
    case "btts": {
      const yes = s.gh > 0 && s.ga > 0;
      return (parts[1] === "y") === yes ? "win" : "lose";
    }
    case "btts1": {
      const yes = s.htGh > 0 && s.htGa > 0;
      return (parts[1] === "y") === yes ? "win" : "lose";
    }
    case "btts2": {
      const yes = s.shGh > 0 && s.shGa > 0;
      return (parts[1] === "y") === yes ? "win" : "lose";
    }
    case "ou": {
      const line = Number(parts[2]);
      return parts[1] === "over" ? (s.total > line ? "win" : "lose") : s.total < line ? "win" : "lose";
    }
    case "ou1": {
      const line = Number(parts[2]);
      const t = s.htGh + s.htGa;
      return parts[1] === "over" ? (t > line ? "win" : "lose") : t < line ? "win" : "lose";
    }
    case "ou2": {
      const line = Number(parts[2]);
      const t = s.shGh + s.shGa;
      return parts[1] === "over" ? (t > line ? "win" : "lose") : t < line ? "win" : "lose";
    }
    case "ouh": {
      const line = Number(parts[2]);
      return parts[1] === "over" ? (s.gh > line ? "win" : "lose") : s.gh < line ? "win" : "lose";
    }
    case "oua": {
      const line = Number(parts[2]);
      return parts[1] === "over" ? (s.ga > line ? "win" : "lose") : s.ga < line ? "win" : "lose";
    }
    case "ouh1":
    case "ouh2":
    case "oua1":
    case "oua2": {
      const line = Number(parts[2]);
      const phase = kind.endsWith("1") ? 1 : 2;
      const side = kind.startsWith("ouh") ? s.gh : s.ga;
      const ht = kind.startsWith("ouh") ? s.htGh : s.htGa;
      const value = phase === 1 ? ht : side - ht;
      return parts[1] === "over" ? (value > line ? "win" : "lose") : value < line ? "win" : "lose";
    }
    case "cs": {
      if (parts[1] === "other") {
        return s.gh > 6 || s.ga > 6 ? "win" : "lose";
      }
      return `${s.gh}-${s.ga}` === parts[1] ? "win" : "lose";
    }
    case "cs1":
      return `${s.htGh}-${s.htGa}` === parts[1] ? "win" : "lose";
    case "cs2":
      return `${s.shGh}-${s.shGa}` === parts[1] ? "win" : "lose";
    case "ah": {
      const line = Number(parts[2]);
      const adjusted = parts[1] === "1" ? s.diff + line : -s.diff + line;
      if (adjusted > 0) return "win";
      if (adjusted === 0) return "void";
      return "lose";
    }
    case "ah1t": {
      // ah1t:1:phase:line
      const phase = Number(parts[2]);
      const line = Number(parts[3]);
      const diff = phase === 1 ? s.htGh - s.htGa : s.shGh - s.shGa;
      const adjusted = parts[1] === "1" ? diff + line : -diff + line;
      if (adjusted > 0) return "win";
      if (adjusted === 0) return "void";
      return "lose";
    }
    case "eh": {
      const line = Number(parts[2]);
      const adjusted = s.diff + line;
      if (parts[1] === "1") return adjusted > 0 ? "win" : "lose";
      if (parts[1] === "X") return adjusted === 0 ? "win" : "lose";
      return adjusted < 0 ? "win" : "lose";
    }
    case "margin": {
      const side = parts[1];
      const value = parts[2];
      const d = side === "h" ? s.diff : -s.diff;
      if (value === "1") return d === 1 ? "win" : "lose";
      if (value === "2") return d === 2 ? "win" : "lose";
      return d >= 3 ? "win" : "lose";
    }
    case "wtn": {
      if (parts[1] === "h") return s.diff > 0 && s.ga === 0 ? "win" : "lose";
      return s.diff < 0 && s.gh === 0 ? "win" : "lose";
    }
    case "clean": {
      if (parts[1] === "h") return s.ga === 0 ? "win" : "lose";
      return s.gh === 0 ? "win" : "lose";
    }
    case "comeback": {
      if (parts[1] === "h") return s.firstTeam === "a" && s.diff > 0 ? "win" : "lose";
      return s.firstTeam === "h" && s.diff < 0 ? "win" : "lose";
    }
    case "first":
      return s.firstTeam === parts[1] ? "win" : "lose";
    case "last":
      return s.lastTeam === parts[1] ? "win" : "lose";
    case "exactgoals": {
      if (parts[1] === "7p") return s.total >= 7 ? "win" : "lose";
      if (parts[1] === "14p") return s.total >= 14 ? "win" : "lose";
      return s.total === Number(parts[1]) ? "win" : "lose";
    }
    case "range": {
      const code = parts[1];
      if (code === "0-1") return s.total <= 1 ? "win" : "lose";
      if (code === "2-3") return s.total >= 2 && s.total <= 3 ? "win" : "lose";
      if (code === "4-6") return s.total >= 4 && s.total <= 6 ? "win" : "lose";
      return s.total >= 7 ? "win" : "lose";
    }
    case "htft": {
      const [ht, ft] = parts[1].split("/");
      return resultCode(s.htGh, s.htGa) === ht && resultCode(s.gh, s.ga) === ft ? "win" : "lose";
    }
    case "htr":
      return resultCode(s.htGh, s.htGa) === parts[1] ? "win" : "lose";
    case "shr":
      return resultCode(s.shGh, s.shGa) === parts[1] ? "win" : "lose";
    case "corners": {
      const line = Number(parts[2]);
      const total = s.corners.length;
      return parts[1] === "over" ? (total > line ? "win" : "lose") : total < line ? "win" : "lose";
    }
    case "corners1": {
      const line = Number(parts[2]);
      const total = s.corners.filter((c) => c.minute <= 45).length;
      return parts[1] === "over" ? (total > line ? "win" : "lose") : total < line ? "win" : "lose";
    }
    case "cornersh": {
      const line = Number(parts[2]);
      const total = s.corners.filter((c) => c.team === "h").length;
      return parts[1] === "over" ? (total > line ? "win" : "lose") : total < line ? "win" : "lose";
    }
    case "cornersa": {
      const line = Number(parts[2]);
      const total = s.corners.filter((c) => c.team === "a").length;
      return parts[1] === "over" ? (total > line ? "win" : "lose") : total < line ? "win" : "lose";
    }
    case "cornersh1": {
      const line = Number(parts[2]);
      const total = s.corners.filter((c) => c.team === "h" && c.minute <= 45).length;
      return parts[1] === "over" ? (total > line ? "win" : "lose") : total < line ? "win" : "lose";
    }
    case "cornersa1": {
      const line = Number(parts[2]);
      const total = s.corners.filter((c) => c.team === "a" && c.minute <= 45).length;
      return parts[1] === "over" ? (total > line ? "win" : "lose") : total < line ? "win" : "lose";
    }
    case "corner-exact": {
      return s.corners.length === Number(parts[1]) ? "win" : "lose";
    }
    case "corner-exacth": {
      return s.corners.filter((c) => c.team === "h").length === Number(parts[1]) ? "win" : "lose";
    }
    case "corner-exacta": {
      return s.corners.filter((c) => c.team === "a").length === Number(parts[1]) ? "win" : "lose";
    }
    case "corner-race": {
      const target = Number(parts[1]);
      return raceWinner(s.corners, target) === parts[2] ? "win" : "lose";
    }
    case "cards": {
      const line = Number(parts[2]);
      const total = s.cards.length;
      return parts[1] === "over" ? (total > line ? "win" : "lose") : total < line ? "win" : "lose";
    }
    case "cards1": {
      const line = Number(parts[2]);
      const total = s.cards.filter((c) => c.minute <= 45).length;
      return parts[1] === "over" ? (total > line ? "win" : "lose") : total < line ? "win" : "lose";
    }
    case "cardsh": {
      const line = Number(parts[2]);
      const total = s.cards.filter((c) => c.team === "h").length;
      return parts[1] === "over" ? (total > line ? "win" : "lose") : total < line ? "win" : "lose";
    }
    case "cardsa": {
      const line = Number(parts[2]);
      const total = s.cards.filter((c) => c.team === "a").length;
      return parts[1] === "over" ? (total > line ? "win" : "lose") : total < line ? "win" : "lose";
    }
    case "cardsh1": {
      const line = Number(parts[2]);
      const total = s.cards.filter((c) => c.team === "h" && c.minute <= 45).length;
      return parts[1] === "over" ? (total > line ? "win" : "lose") : total < line ? "win" : "lose";
    }
    case "cardsa1": {
      const line = Number(parts[2]);
      const total = s.cards.filter((c) => c.team === "a" && c.minute <= 45).length;
      return parts[1] === "over" ? (total > line ? "win" : "lose") : total < line ? "win" : "lose";
    }
    case "card-exact":
      return s.cards.length === Number(parts[1]) ? "win" : "lose";
    case "card-exacth":
      return s.cards.filter((c) => c.team === "h").length === Number(parts[1]) ? "win" : "lose";
    case "card-exacta":
      return s.cards.filter((c) => c.team === "a").length === Number(parts[1]) ? "win" : "lose";
    case "card-exact1": {
      return s.cards.filter((c) => c.minute <= 45).length === Number(parts[1]) ? "win" : "lose";
    }
    case "card-race": {
      const target = Number(parts[1]);
      const events = s.cards.map((c) => ({ minute: c.minute, team: c.team }));
      return raceWinner(events, target) === parts[2] ? "win" : "lose";
    }
    case "p-any": {
      const playerId = parts.slice(1).join(":");
      return s.goals.some((g) => g.playerId === playerId) ? "win" : "lose";
    }
    case "p-first": {
      if (!s.goals.length) return "lose";
      const sorted = s.goals.slice().sort((a, b) => a.minute - b.minute);
      return sorted[0].playerId === parts.slice(1).join(":") ? "win" : "lose";
    }
    case "p-last": {
      if (!s.goals.length) return "lose";
      const sorted = s.goals.slice().sort((a, b) => a.minute - b.minute);
      return sorted[sorted.length - 1].playerId === parts.slice(1).join(":") ? "win" : "lose";
    }
    case "p-2plus": {
      const playerId = parts.slice(1).join(":");
      return s.goals.filter((g) => g.playerId === playerId).length >= 2 ? "win" : "lose";
    }
    case "p-3plus": {
      const playerId = parts.slice(1).join(":");
      return s.goals.filter((g) => g.playerId === playerId).length >= 3 ? "win" : "lose";
    }
    case "p-assist": {
      const playerId = parts.slice(1).join(":");
      return s.goals.some((g) => g.assistId === playerId) ? "win" : "lose";
    }
    case "p-goa": {
      const playerId = parts.slice(1).join(":");
      return s.goals.some((g) => g.playerId === playerId || g.assistId === playerId) ? "win" : "lose";
    }
    case "p-card": {
      const playerId = parts.slice(1).join(":");
      return s.cards.some((c) => c.playerId === playerId) ? "win" : "lose";
    }
    case "p-card1": {
      const playerId = parts.slice(1).join(":");
      return s.cards.some((c) => c.playerId === playerId && c.minute <= 45) ? "win" : "lose";
    }
    case "p-1h": {
      const playerId = parts.slice(1).join(":");
      return s.goals.some((g) => g.playerId === playerId && g.minute <= 45) ? "win" : "lose";
    }
    case "p-2h": {
      const playerId = parts.slice(1).join(":");
      return s.goals.some((g) => g.playerId === playerId && g.minute > 45) ? "win" : "lose";
    }
    case "p-bothhalves": {
      const playerId = parts.slice(1).join(":");
      const first = s.goals.some((g) => g.playerId === playerId && g.minute <= 45);
      const second = s.goals.some((g) => g.playerId === playerId && g.minute > 45);
      return first && second ? "win" : "lose";
    }
    case "bothhalves": {
      const first = parts[1] === "h" ? s.htGh > 0 : s.htGa > 0;
      const second = parts[1] === "h" ? s.shGh > 0 : s.shGa > 0;
      return first && second ? "win" : "lose";
    }
    case "bhtt": {
      const yes = s.htGh + s.htGa > 0 && s.shGh + s.shGa > 0;
      return (parts[1] === "y") === yes ? "win" : "lose";
    }
    case "nogoal": {
      const t = Number(parts[1]);
      const none = !s.goals.some((g) => g.minute <= t);
      return (parts[2] === "y") === none ? "win" : "lose";
    }
    case "goal-until": {
      const t = Number(parts[1]);
      const yes = s.goals.some((g) => g.minute <= t);
      return (parts[2] === "y") === yes ? "win" : "lose";
    }
    case "band": {
      const band = parts[1];
      const test = BANDS[band];
      const yes = test ? s.goals.some((g) => test(g.minute)) : false;
      return (parts[2] === "y") === yes ? "win" : "lose";
    }
    case "bandh":
    case "banda": {
      const band = parts[1];
      const test = BANDS[band];
      const side = kind === "bandh" ? "h" : "a";
      const yes = test ? s.goals.some((g) => g.team === side && test(g.minute)) : false;
      return (parts[2] === "y") === yes ? "win" : "lose";
    }
    case "winboth": {
      const home = s.htGh > s.htGa && s.shGh > s.shGa;
      const away = s.htGa > s.htGh && s.shGa > s.shGh;
      return (parts[1] === "h" ? home : away) ? "win" : "lose";
    }
    case "moregoals": {
      const first = s.htGh + s.htGa;
      const second = s.shGh + s.shGa;
      if (parts[1] === "1t") return first > second ? "win" : "lose";
      if (parts[1] === "2t") return second > first ? "win" : "lose";
      return first === second ? "win" : "lose";
    }
    case "dc1t": {
      const code = resultCode(s.htGh, s.htGa);
      return parts[1].includes(code) ? "win" : "lose";
    }
    case "dc2t": {
      const code = resultCode(s.shGh, s.shGa);
      return parts[1].includes(code) ? "win" : "lose";
    }
    case "exactgoals1": {
      const t = s.htGh + s.htGa;
      if (parts[1].endsWith("p")) return t >= Number(parts[1].slice(0, -1)) ? "win" : "lose";
      return t === Number(parts[1]) ? "win" : "lose";
    }
    case "exactgoals2": {
      const t = s.shGh + s.shGa;
      if (parts[1].endsWith("p")) return t >= Number(parts[1].slice(0, -1)) ? "win" : "lose";
      return t === Number(parts[1]) ? "win" : "lose";
    }
    case "combo1t": {
      // combo1t:r:CODE|btts1:y
      const [first, second] = id.slice("combo1t:".length).split("|");
      const r1 = evaluate(s, first);
      const r2 = evaluate(s, second);
      if (r1 === "lose" || r2 === "lose") return "lose";
      if (r1 === "void" || r2 === "void") return "void";
      return "win";
    }
    default:
      return "void";
  }
}
