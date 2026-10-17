import { clamp, hashString } from "../random";

/** Stable 1200..1800 rating derived from the team name. */
export function teamRating(team: string): number {
  const h = hashString(`rating|${team}`);
  return 1200 + (h % 601);
}

export function expectedGoals(home: string, away: string): { lh: number; la: number } {
  const diff = (teamRating(home) - teamRating(away)) / 400;
  const lh = clamp(1.35 * Math.exp(0.95 * diff), 0.35, 3.8);
  const la = clamp(1.15 * Math.exp(-0.95 * diff), 0.3, 3.4);
  return { lh, la };
}

export function poissonPmf(lambda: number, max = 10): number[] {
  const out: number[] = [];
  let p = Math.exp(-lambda);
  let acc = 0;
  for (let k = 0; k <= max; k++) {
    out.push(p);
    acc += p;
    p = (p * lambda) / (k + 1);
  }
  return out;
}

/** joint[i][j] = P(home scores i, away scores j). */
export function jointPmf(lh: number, la: number, max = 10): number[][] {
  const ph = poissonPmf(lh, max);
  const pa = poissonPmf(la, max);
  const joint: number[][] = [];
  for (let i = 0; i <= max; i++) {
    const row: number[] = [];
    for (let j = 0; j <= max; j++) row.push(ph[i] * pa[j]);
    joint.push(row);
  }
  return joint;
}

export type HalfModel = {
  p1: number[][];
  p2: number[][];
  halfResult: [number, number, number]; // [1, X, 2] probabilities
  secondResult: [number, number, number];
  htft: number[][]; // [htIndex][ftIndex] with 0=1,1=X,2=2
  winBothHalves: [number, number]; // [home, away]
  bothHalvesGoal: number; // both halves have at least one goal
  moreGoals: [number, number, number]; // [1st, 2nd, equal]
  halfCorrect: number[][];
  secondCorrect: number[][];
};

function resultIndex(h: number, a: number): 0 | 1 | 2 {
  if (h > a) return 0;
  if (h === a) return 1;
  return 2;
}

/** Split the match into two ~independent halves. */
export function buildHalfModel(lh: number, la: number, max = 5): HalfModel {
  const lh1 = lh * 0.46;
  const lh2 = lh * 0.54;
  const la1 = la * 0.46;
  const la2 = la * 0.54;
  const p1 = jointPmf(lh1, la1, max);
  const p2 = jointPmf(lh2, la2, max);

  const halfResult: [number, number, number] = [0, 0, 0];
  const secondResult: [number, number, number] = [0, 0, 0];
  const htft: number[][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  let winHome = 0;
  let winAway = 0;
  let bothBulbs = 0;
  let moreFirst = 0;
  let moreSecond = 0;
  let equalGoals = 0;

  for (let h1 = 0; h1 <= max; h1++) {
    for (let a1 = 0; a1 <= max; a1++) {
      const pFirst = p1[h1][a1];
      if (pFirst === 0) continue;
      halfResult[resultIndex(h1, a1)] += pFirst;
      const total1 = h1 + a1;
      if (total1 > 0) bothBulbs += pFirst;
      for (let h2 = 0; h2 <= max; h2++) {
        for (let a2 = 0; a2 <= max; a2++) {
          const pSecond = p2[h2][a2];
          if (pSecond === 0) continue;
          const p = pFirst * pSecond;
          secondResult[resultIndex(h2, a2)] += p;
          htft[resultIndex(h1, a1)][resultIndex(h1 + h2, a1 + a2)] += p;
          if (h1 > a1 && h2 > a2) winHome += p;
          if (a1 > h1 && a2 > h2) winAway += p;
          const total2 = h2 + a2;
          if (total1 > total2) moreFirst += p;
          else if (total2 > total1) moreSecond += p;
          else equalGoals += p;
        }
      }
    }
  }

  // Both halves with goals: P(total1>0) * P(total2>0)
  const totalP1 = 1 - p1[0][0];
  const totalP2 = 1 - p2[0][0];

  return {
    p1,
    p2,
    halfResult,
    secondResult,
    htft,
    winBothHalves: [winHome, winAway],
    bothHalvesGoal: totalP1 * totalP2,
    moreGoals: [moreFirst, moreSecond, equalGoals],
    halfCorrect: p1,
    secondCorrect: p2,
  };
}

export function oddsFromProb(prob: number, margin = 0.06): number {
  const raw = (1 - margin) / Math.max(prob, 1e-9);
  return Math.min(501, Math.max(1.01, Math.round(raw * 100) / 100));
}
