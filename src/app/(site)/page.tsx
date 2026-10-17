import type { Metadata } from "next";
import Link from "next/link";
import MatchCard, { type MatchCardData } from "@/components/MatchCard";
import { REGIONS } from "@/lib/data/leagues";
import { getMainOdds } from "@/lib/odds/markets";
import { leagueBlocksForDate, getMatchStats } from "@/lib/sports";
import {
  addDays,
  dateKeyOf,
  formatTimeMs,
  formatWeekday,
  liveMinute,
  matchPhase,
  type MatchPhase,
} from "@/lib/time";
import type { Fixture, RegionId } from "@/lib/types";

export const metadata: Metadata = {
  title: "Futebol — jogos de hoje",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type CardData = { match: MatchCardData; odds: { home: number; draw: number; away: number } };

function toCard(fixture: Fixture, now: number): CardData {
  const phase: MatchPhase = matchPhase(fixture.kickoff, now);
  const odds = getMainOdds(fixture);

  if (phase === "upcoming") {
    return {
      odds,
      match: {
        id: fixture.id,
        leagueName: fixture.leagueName,
        flag: fixture.flag,
        home: fixture.home,
        away: fixture.away,
        kickoff: fixture.kickoff,
        timeLabel: formatTimeMs(fixture.kickoff),
        status: "upcoming",
      },
    };
  }

  const minute = phase === "live" ? liveMinute(fixture.kickoff, now) : undefined;
  const stats = getMatchStats(fixture, phase === "live" ? minute : 95);

  return {
    odds,
    match: {
      id: fixture.id,
      leagueName: fixture.leagueName,
      flag: fixture.flag,
      home: fixture.home,
      away: fixture.away,
      kickoff: fixture.kickoff,
      timeLabel: formatTimeMs(fixture.kickoff),
      status: phase,
      minute,
      scoreHome: stats.goalsHome,
      scoreAway: stats.goalsAway,
    },
  };
}

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const today = dateKeyOf();
  const date = typeof params.data === "string" && DATE_RE.test(params.data) ? params.data : today;
  const regionParam = typeof params.regiao === "string" ? params.regiao : "todos";
  const validRegions = ["todos", "brasil", "internacional", "europa", "americas", "mundo"];
  const region = (validRegions.includes(regionParam) ? regionParam : "todos") as RegionId | "todos";
  const leagueFilter = typeof params.liga === "string" ? params.liga : null;

  const now = Date.now();
  const dates = Array.from({ length: 7 }, (_, index) => addDays(today, index));
  const allBlocks = leagueBlocksForDate(date, region);
  const blocks = leagueFilter ? allBlocks.filter((block) => block.leagueId === leagueFilter) : allBlocks;
  const totalMatches = blocks.reduce((acc, block) => acc + block.matches.length, 0);

  const query = (overrides: Record<string, string | undefined>) => {
    const merged: Record<string, string> = { data: date, regiao: region };
    if (leagueFilter) merged.liga = leagueFilter;
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete merged[key];
      else merged[key] = value;
    }
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(merged)) {
      if (value && value !== "todos" && !(key === "data" && value === today)) search.set(key, value);
    }
    const qs = search.toString();
    return qs ? `/?${qs}` : "/";
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-edge bg-panel/70 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight">
              ⚽ Futebol <span className="text-muted">·</span>{" "}
              <span className="text-accent">{totalMatches} jogos</span>
            </h1>
            <p className="mt-1 text-sm text-muted">
              Campeonatos nacionais e internacionais — com os{" "}
              <strong className="text-white">brasileiros em primeiro lugar</strong>. Cada jogo tem
              1.500 mercados de aposta.
            </p>
          </div>
          <div className="rounded-xl border border-gold/40 bg-gold/10 px-4 py-2 text-right">
            <p className="text-[11px] text-gold/90">Mercados por partida</p>
            <p className="odd-num text-xl font-black text-gold">1.500</p>
          </div>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {dates.map((day, index) => {
            const active = day === date;
            const label = index === 0 ? "Hoje" : index === 1 ? "Amanhã" : formatWeekday(day);
            return (
              <Link
                key={day}
                href={query({ data: day, liga: undefined })}
                className={`whitespace-nowrap rounded-full border px-4 py-2 text-xs transition ${
                  active
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-edge text-muted hover:border-accent/50 hover:text-white"
                }`}
              >
                <span className="font-semibold">{label}</span>
                <span className="ml-1 opacity-70">{day.slice(8)}/{day.slice(5, 7)}</span>
              </Link>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {REGIONS.map((r) => {
            const active = region === r.id;
            return (
              <Link
                key={r.id}
                href={query({ regiao: r.id, liga: undefined })}
                className={`rounded-full border px-3 py-1.5 text-xs transition ${
                  active
                    ? "border-gold bg-gold/15 text-gold"
                    : "border-edge text-muted hover:border-gold/50 hover:text-white"
                }`}
              >
                {r.label}
              </Link>
            );
          })}
          {leagueFilter && (
            <Link
              href={query({ liga: undefined })}
              className="rounded-full border border-red-400/50 bg-red-500/10 px-3 py-1.5 text-xs text-red-200"
            >
              Limpar filtro de liga ✕
            </Link>
          )}
        </div>
      </section>

      {blocks.length === 0 && (
        <p className="rounded-2xl border border-edge bg-panel/70 p-6 text-center text-sm text-muted">
          Nenhum jogo encontrado com esses filtros.
        </p>
      )}

      {blocks.map((block) => (
        <section key={block.leagueId} className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold">
              {block.flag} {block.leagueName}
            </h2>
            <span className="rounded-full bg-panel2 px-2 py-0.5 text-[11px] text-muted">
              {block.country}
            </span>
            <span className="text-[11px] text-muted">{block.matches.length} jogo(s)</span>
            <Link
              href={query({ liga: block.leagueId })}
              className="ml-auto text-[11px] text-muted underline-offset-2 transition hover:text-accent hover:underline"
            >
              ver só esta liga
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {block.matches.map((fixture) => {
              const card = toCard(fixture, now);
              return <MatchCard key={fixture.id} match={card.match} odds={card.odds} />;
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
