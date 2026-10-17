"use client";

import { useCallback, useEffect, useState } from "react";
import { formatOdd } from "@/lib/money";
import type { Market, MarketGroupId, Selection } from "@/lib/types";

const GROUPS: { id: MarketGroupId | "todos"; label: string }[] = [
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

export type DrawerFixture = {
  id: string;
  leagueName: string;
  flag: string;
  home: string;
  away: string;
};

type OddsPayload = {
  ok: boolean;
  total: number;
  markets: Market[];
  error?: string;
};

type Props = {
  fixture: DrawerFixture;
  locked?: boolean;
  onClose: () => void;
  onPick: (fixture: DrawerFixture, market: Market, selection: Selection) => void;
  isPicked: (key: string) => boolean;
};

export default function OddsDrawer({ fixture, locked = false, onClose, onPick, isPicked }: Props) {
  const [data, setData] = useState<OddsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState<MarketGroupId | "todos">("popular");
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/odds/${encodeURIComponent(fixture.id)}`);
      const json = (await res.json()) as OddsPayload;
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Falha ao carregar mercados.");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar mercados.");
    } finally {
      setLoading(false);
    }
  }, [fixture.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-2xl flex-col border-l border-edge bg-panel shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-edge px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">
              {fixture.flag} {fixture.leagueName}
            </p>
            <h2 className="text-lg font-semibold">
              {fixture.home} <span className="text-muted">x</span> {fixture.away}
            </h2>
            <p className="mt-1 text-xs text-muted">
              {data ? `${data.total} mercados disponíveis` : loading ? "Carregando mercados…" : "Mercados"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-edge px-3 py-1.5 text-sm text-muted transition hover:bg-panel2 hover:text-white"
          >
            Fechar
          </button>
        </div>

        <div className="border-b border-edge px-5 py-3">
          {locked && (
            <p className="mb-3 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-xs text-gold">
              Partida já iniciada — mercados apenas para consulta.
            </p>
          )}
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar mercado (ex.: escanteios, placar, jogador…)"
            className="w-full rounded-lg border border-edge bg-background px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {GROUPS.map((g) => (
              <button
                key={g.id}
                onClick={() => {
                  setGroup(g.id);
                  setShowAll(false);
                }}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  group === g.id
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-edge text-muted hover:border-accent/60 hover:text-white"
                }`}
              >
                {g.label}
              </button>
            ))}
            <button
              onClick={() => setShowAll(true)}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                showAll
                  ? "border-gold bg-gold/15 text-gold"
                  : "border-edge text-muted hover:border-gold/60 hover:text-white"
              }`}
            >
              Todos os 1500
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="space-y-3">
              <p className="text-sm text-muted">Gerando os 1500 mercados desta partida…</p>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-panel2" />
              ))}
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
              {error}
              <button onClick={load} className="ml-3 underline">
                Tentar novamente
              </button>
            </div>
          )}

          {data && !loading && (
            <MarketList
              key={`${showAll ? "todos" : group}|${query}`}
              fixtureId={fixture.id}
              markets={data.markets}
              group={showAll ? "todos" : group}
              limitAll={!showAll}
              query={query}
              locked={locked}
              isPicked={isPicked}
              onPick={(market, selection) => onPick(fixture, market, selection)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function MarketList({
  fixtureId,
  markets,
  group,
  limitAll,
  query,
  locked,
  isPicked,
  onPick,
}: {
  fixtureId: string;
  markets: Market[];
  group: MarketGroupId | "todos";
  limitAll: boolean;
  query: string;
  locked: boolean;
  isPicked: (key: string) => boolean;
  onPick: (market: Market, selection: Selection) => void;
}) {
  const [limit, setLimit] = useState(240);
  const needle = query.trim().toLowerCase();
  const visible = markets.filter((market) => {
    if (group !== "todos" && market.group !== group) return false;
    if (!needle) return true;
    if (market.name.toLowerCase().includes(needle)) return true;
    return market.selections.some((s) => s.label.toLowerCase().includes(needle));
  });

  if (visible.length === 0) {
    return <p className="text-sm text-muted">Nenhum mercado encontrado com esse filtro.</p>;
  }

  const shown = visible.slice(0, limit);

  return (
    <div className="space-y-4">
      {shown.map((market) => (
        <div key={market.id} className="rounded-xl border border-edge bg-panel2/60 p-3">
          <p className="mb-2 text-sm font-semibold text-white/90">{market.name}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {market.selections.map((selection) => {
              const picked = isPicked(`${fixtureId}::${selection.id}`);
              return (
                <button
                  key={selection.id}
                  disabled={locked}
                  onClick={() => onPick(market, selection)}
                  className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs transition ${
                    locked
                      ? "cursor-not-allowed border-edge/60 bg-background/30 opacity-60"
                      : picked
                        ? "border-accent bg-accent/15"
                        : "border-edge bg-background/60 hover:border-accent/70 hover:bg-accent/10"
                  }`}
                >
                  <span className="text-white/85">{selection.label}</span>
                  <span className={`odd-num font-semibold ${locked ? "text-muted" : "text-accent"}`}>
                    {formatOdd(selection.odd)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {visible.length > shown.length && (
        <button
          onClick={() => setLimit((value) => value + 300)}
          className="w-full rounded-lg border border-edge py-2 text-sm text-muted transition hover:border-accent/60 hover:text-white"
        >
          Mostrar mais mercados ({visible.length - shown.length} restantes)
        </button>
      )}
      {limitAll && group === "popular" && (
        <p className="text-center text-xs text-muted">
          Mostrando os mercados populares. Use as abas acima ou “Todos os 1500”.
        </p>
      )}
    </div>
  );
}
