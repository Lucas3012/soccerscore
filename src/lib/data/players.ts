import { hashString, mulberry32 } from "../random";
import type { Player } from "../types";

const FIRST_NAMES = [
  "Gabriel", "Lucas", "Rafael", "Matheus", "João", "Pedro", "Bruno", "Diego",
  "Felipe", "Gustavo", "Rodrigo", "Thiago", "Vinícius", "Carlos", "Eduardo", "Fernando",
  "Leandro", "Marcelo", "Paulo", "Renato", "Sérgio", "André", "Caio", "Danilo",
  "Éverton", "Fábio", "Igor", "Juliano", "Kaio", "Léo", "Murilo", "Nícolas",
  "Otávio", "Ricardo", "Samuel", "Tomás", "Alan", "Breno", "César", "Douglas",
  "Emerson", "Flávio", "Guilherme", "Hugo", "Ítalo", "Jonas", "Kevin", "Luan",
];

const LAST_NAMES = [
  "Silva", "Santos", "Oliveira", "Souza", "Lima", "Costa", "Pereira", "Almeida",
  "Nascimento", "Araújo", "Ribeiro", "Carvalho", "Gomes", "Martins", "Rocha", "Barbosa",
  "Teixeira", "Moraes", "Cardoso", "Freitas", "Nunes", "Mendes", "Correia", "Fonseca",
  "Batista", "Machado", "Campos", "Cunha", "Monteiro", "Pinto", "Ramos", "Reis",
  "Assis", "Braga", "Castro", "Duarte", "Esteves", "Farias", "Guimarães", "Lopes",
  "Marques", "Neves", "Peixoto", "Queiroz", "Sales", "Tavares", "Vieira", "Xavier",
];

/**
 * Deterministic squad of 18 fictional players per team. Index 0..5 are treated
 * as attackers, 6..11 midfielders and 12..17 defenders by the odds model.
 */
export function playersForTeam(team: string, side: "h" | "a"): Player[] {
  const rng = mulberry32(hashString(`squad|${team}`));
  const used = new Set<string>();
  const players: Player[] = [];
  let guard = 0;
  while (players.length < 18 && guard < 500) {
    guard++;
    const first = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)];
    const last = LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)];
    const key = `${first[0]}.${last}`;
    if (used.has(key)) continue;
    used.add(key);
    players.push({
      id: `${side}-${players.length + 1}`,
      name: `${first[0]}. ${last}`,
      team: side,
    });
  }
  return players;
}

export function playersForFixture(home: string, away: string): Player[] {
  return [...playersForTeam(home, "h"), ...playersForTeam(away, "a")];
}

/** Goal-scoring tendency by squad index (0..5 attackers, 6..11 midfield, 12..17 defense). */
export function goalWeight(index: number): number {
  return Math.max(0.15, 1.6 - 0.08 * index);
}

export function assistWeight(index: number): number {
  if (index < 6) return 0.7;
  if (index < 12) return 1.3;
  return 0.5;
}

export function cardWeight(index: number): number {
  if (index < 6) return 0.4;
  if (index < 12) return 0.9;
  return 1.4;
}

export function normalizeWeights(weights: number[]): number[] {
  const total = weights.reduce((acc, w) => acc + w, 0);
  return weights.map((w) => w / total);
}

export function weightedPick<T>(
  rng: () => number,
  list: readonly T[],
  weight: (item: T, index: number) => number,
): T {
  let total = 0;
  for (let i = 0; i < list.length; i++) total += weight(list[i], i);
  let roll = rng() * total;
  for (let i = 0; i < list.length; i++) {
    roll -= weight(list[i], i);
    if (roll <= 0) return list[i];
  }
  return list[list.length - 1];
}
