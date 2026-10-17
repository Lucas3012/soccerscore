"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import MatchCard, { type MatchCardData } from "./MatchCard";
import { formatTimeMs } from "@/lib/time";
import type { RegionId } from "@/lib/types";

export type LiveMatchDTO = {
  id: string;
  leagueName: string;
  country: string;
  flag: string;
  region: RegionId;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  kickoff: number;
  period: "1T" | "INT" | "2T";
  clockLabel: string;
  odds: { home: number; draw: number; away: number };
};

export type LivePayload = {
  ok: boolean;
  updatedAt: number;
  error: string | null;
  matches: LiveMatchDTO[];
};

const FILTERS: { id: RegionId | "todos"; label: string }[] = [
  { id: "todos", label: "🌐 Todos" },
  { id: "brasil", label: "🇧🇷 Brasil" },
  { id: "internacional", label: "🏆 Internacionais" },
  { id: "europa", label: "🇪🇺 Europa" },
  { id: "americas", label: "🌎 Américas" },
  { id: "mundo", label: "🌍 Mundo" },
];

const REFRESH_MS = 45_000;

export default function LiveBoard({ initial }: { initial: LivePayload }) {
  const [data, setData] = useState<LivePayload>(initial);
  const [filter, setFilter] = useState<RegionId | "todos">("todos");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/live", { cache: "no-store" });
      const json = (await res.json()) as LivePayload;
      if (json.matches.length > 0 || json.ok) setData(json);
    } catch {
      /* mantém os dados atuais */
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      await load();
    };
    const timer = setInterval(tick, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [load]);

  const matches = data.matches;

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const match of matches) map.set(match.region, (map.get(match.region) ?? 0) + 1);
    return map;
  }, [matches]);

  const visible = useMemo(
    () => (filter === "todos" ? matches : matches.filter((match) => match.region === filter)),
    [matches, filter],
  );

  const leagues = useMemo(() => {
    const map = new Map<string, { key: string; leagueName: string; country: string; flag: string; matches: LiveMatchDTO[] }>();
    for (const match of visible) {
      const key = match.leagueName;
      const entry = map.get(key) ?? {
        key,
        leagueName: match.leagueName,
        country: match.country,
        flag: match.flag,
        matches: [],
      };
      entry.matches.push(match);
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => {
      const brasilA = a.matches[0]?.region === "brasil" ? 0 : 1;
      const brasilB = b.matches[0]?.region === "brasil" ? 0 : 1;
      if (brasilA !== brasilB) return brasilA - brasilB;
      if (a.matches.length !== b.matches.length) return b.matches.length - a.matches.length;
      return a.leagueName.localeCompare(b.leagueName, "pt-BR");
    });
  }, [visible]);

  const totalLive = matches.length;
  const totalLeagues = new Set(matches.map((match) => match.leagueName)).size;
  const updatedLabel = formatTimeMs(data.updatedAt);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-edge bg-panel/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold">
              <span className="flex items-center gap-1.5 text-sm font-bold text-red-300">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                AO VIVO
              </span>
              Futebol acontecendo agora
            </h1>
            <p className="mt-1 text-xs text-muted">
              {totalLive > 0 ? (
                <>
                  <strong className="text-white/90">{totalLive}</strong> jogos ao vivo em{" "}
                  <strong className="text-white/90">{totalLeagues}</strong>{" "}
                  {totalLeagues === 1 ? "competição" : "competições"} · placares atualizados às{" "}
                  {updatedLabel} · atualização automática a cada 45s
                </>
              ) : (
                `Nenhum jogo ao vivo neste momento · última verificação às ${updatedLabel}`
              )}
            </p>
          </div>
          <button
            onClick={() => {
              setLoading(true);
              void load().finally(() => setLoading(false));
            }}
            className="rounded-lg border border-edge px-3 py-1.5 text-xs text-muted transition hover:border-accent/60 hover:text-white"
          >
            {loading ? "Atualizando…" : "Atualizar agora"}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {FILTERS.map((item) => {
            const count = item.id === "todos" ? totalLive : (counts.get(item.id) ?? 0);
            const active = filter === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setFilter(item.id)}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  active
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-edge text-muted hover:border-accent/60 hover:text-white"
                }`}
              >
                {item.label}
                <span className="ml-1.5 text-[10px] text-muted">{count}</span>
              </button>
            );
          })}
        </div>

        {!data.ok && (
          <p className="mt-3 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-xs text-gold">
            Não foi possível atualizar os dados do Flashscore agora
            {data.error ? ` (${data.error})` : ""}. Exibindo a última leitura disponível.
          </p>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-edge bg-panel/40 p-10 text-center">
          <p className="text-3xl">⚽</p>
          <p className="mt-3 font-semibold">Nenhum jogo ao vivo {filter === "todos" ? "" : "nesta região"}</p>
          <p className="mt-1 text-sm text-muted">
            Assim que uma partida começar, ela aparece aqui automaticamente.
          </p>
        </div>
      ) : (
        leagues.map((league) => (
          <section key={league.key}>
            <div className="mb-2 flex items-center justify-between gap-2 border-b border-edge pb-2">
              <h2 className="truncate text-sm font-semibold text-white/90">
                {league.flag} {league.leagueName}
              </h2>
              <span className="shrink-0 rounded-full bg-panel2 px-2 py-0.5 text-[11px] text-muted">
                {league.matches.length} {league.matches.length === 1 ? "jogo" : "jogos"}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {league.matches.map((match) => (
                <MatchCard key={match.id} match={toCard(match)} odds={match.odds} />
              ))}
            </div>
          </section>
        ))
      )}

      <p className="pt-2 text-center text-[11px] text-muted">
        Jogos, ligas e placares ao vivo: Flashscore. Odds e mercados são simulados para demonstração —
        sem valor real.
      </p>
    </div>
  );
}

function toCard(match: LiveMatchDTO): MatchCardData {
  return {
    id: match.id,
    leagueName: match.leagueName,
    flag: match.flag,
    home: match.home,
    away: match.away,
    kickoff: match.kickoff,
    timeLabel: match.clockLabel,
    status: "live",
    clockLabel: match.clockLabel,
    scoreHome: match.homeScore,
    scoreAway: match.awayScore,
  };
}
