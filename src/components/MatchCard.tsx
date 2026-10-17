"use client";

import { useState } from "react";
import { formatOdd } from "@/lib/money";
import type { Market, Selection, SlipItem } from "@/lib/types";
import { useSlip } from "./SlipProvider";
import OddsDrawer, { type DrawerFixture } from "./OddsDrawer";

export type MatchCardData = {
  id: string;
  leagueName: string;
  flag: string;
  home: string;
  away: string;
  kickoff: number;
  timeLabel: string;
  status: "upcoming" | "live" | "finished";
  minute?: number;
  /** Live clock text shown on the chip (e.g. "37'" or "Intervalo"). */
  clockLabel?: string;
  scoreHome?: number;
  scoreAway?: number;
};

type Props = {
  match: MatchCardData;
  odds: { home: number; draw: number; away: number };
};

export default function MatchCard({ match, odds }: Props) {
  const { add, has } = useSlip();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const drawerFixture: DrawerFixture = {
    id: match.id,
    leagueName: match.leagueName,
    flag: match.flag,
    home: match.home,
    away: match.away,
  };

  const pick = (market: Market, selection: Selection, label?: string) => {
    const item: SlipItem = {
      key: `${match.id}::${selection.id}`,
      matchId: match.id,
      leagueName: match.leagueName,
      home: match.home,
      away: match.away,
      kickoff: match.kickoff,
      marketId: market.id,
      marketName: market.name,
      selectionId: selection.id,
      label: label ?? selection.label,
      odd: selection.odd,
    };
    add(item);
  };

  const mainButtons: { key: string; label: string; text: string; odd: number }[] = [
    { key: "r:1", label: match.home, text: "1", odd: odds.home },
    { key: "r:X", label: "Empate", text: "X", odd: odds.draw },
    { key: "r:2", label: match.away, text: "2", odd: odds.away },
  ];

  return (
    <div className="rounded-xl border border-edge bg-panel/80 p-3 transition hover:border-edge/80">
      <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-muted">
        <span className="truncate">
          {match.flag} {match.leagueName}
        </span>
        <StatusChip match={match} />
      </div>

      <div className="space-y-1.5">
        <TeamRow
          name={match.home}
          score={match.scoreHome}
          showScore={match.status !== "upcoming"}
          onClick={() => setDrawerOpen(true)}
        />
        <TeamRow
          name={match.away}
          score={match.scoreAway}
          showScore={match.status !== "upcoming"}
          onClick={() => setDrawerOpen(true)}
        />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {mainButtons.map((button) => {
          const picked = has(`${match.id}::${button.key}`);
          const locked = match.status === "finished";
          return (
            <button
              key={button.key}
              title={
                locked
                  ? "Mercado fechado — partida encerrada"
                  : `${button.label} — ${formatOdd(button.odd)}`
              }
              disabled={locked}
              onClick={() =>
                pick(
                  { id: "rf", name: "Resultado Final", group: "popular", selections: [] },
                  { id: button.key, label: button.label, odd: button.odd },
                )
              }
              className={`rounded-lg border px-2 py-2 text-center transition ${
                locked
                  ? "cursor-not-allowed border-edge/60 bg-panel2/40 opacity-50"
                  : picked
                    ? "border-accent bg-accent/20"
                    : "border-edge bg-panel2/70 hover:border-accent/70 hover:bg-accent/10"
              }`}
            >
              <span className="block text-[10px] uppercase text-muted">{button.text}</span>
              <span className={`odd-num text-sm font-semibold ${locked ? "text-muted" : "text-accent"}`}>
                {formatOdd(button.odd)}
              </span>
            </button>
          );
        })}
      </div>

      <button
        onClick={() => setDrawerOpen(true)}
        className="mt-2 w-full rounded-lg border border-dashed border-edge/80 py-1.5 text-[11px] text-muted transition hover:border-accent/60 hover:text-white"
      >
        + 1.500 mercados — clique no time para ver tudo
      </button>

      {drawerOpen && (
        <OddsDrawer
          fixture={drawerFixture}
          locked={match.status === "finished"}
          onClose={() => setDrawerOpen(false)}
          onPick={(fixture, market, selection) => pick(market, selection)}
          isPicked={has}
        />
      )}
    </div>
  );
}

function TeamRow({
  name,
  score,
  showScore,
  onClick,
}: {
  name: string;
  score?: number;
  showScore: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <button
        onClick={onClick}
        className="flex-1 truncate text-left text-sm font-medium text-white/90 transition hover:text-accent"
        title={`Ver todos os mercados de ${name}`}
      >
        {name}
      </button>
      {showScore && (
        <span className="odd-num rounded bg-panel2 px-2 py-0.5 text-sm font-semibold text-gold">
          {score ?? 0}
        </span>
      )}
    </div>
  );
}

function StatusChip({ match }: { match: MatchCardData }) {
  if (match.status === "live") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 font-semibold text-red-300">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
        {match.clockLabel ?? `${match.minute}'`}
      </span>
    );
  }
  if (match.status === "finished") {
    return <span className="rounded-full bg-panel2 px-2 py-0.5">Encerrado</span>;
  }
  return <span className="rounded-full bg-panel2 px-2 py-0.5 text-white/80">{match.timeLabel}</span>;
}
