"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatBRL, formatOdd, parseAmountToCents } from "@/lib/money";
import { useSlip } from "./SlipProvider";

export default function BetSlip() {
  const { items, remove, clear, stakeText, setStakeText, totalOdd } = useSlip();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const stakeCents = parseAmountToCents(stakeText) ?? 0;
  const potentialCents = Math.round(stakeCents * totalOdd);

  if (items.length === 0 && !message) return null;

  async function submit() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/bets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          selections: items.map((item) => ({ matchId: item.matchId, selectionId: item.selectionId })),
          stakeCents,
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        error?: string;
        betId?: number;
        totalOdd?: number;
        potentialCents?: number;
      };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Não foi possível registrar a aposta.");
      setMessage({
        kind: "ok",
        text: `Aposta #${json.betId} registrada! Odd total ${formatOdd(json.totalOdd ?? totalOdd)} · Retorno potencial ${formatBRL(json.potentialCents ?? potentialCents)}`,
      });
      clear();
      router.refresh();
    } catch (error) {
      setMessage({ kind: "err", text: error instanceof Error ? error.message : "Erro inesperado." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-edge bg-panel/95 shadow-2xl backdrop-blur">
      <button
        onClick={() => setCollapsed((value) => !value)}
        className="flex w-full items-center justify-between gap-2 rounded-t-2xl border-b border-edge px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold">
          🎟️ Cupom <span className="text-accent">({items.length})</span>
        </span>
        <span className="flex items-center gap-2 text-xs text-muted">
          Odd total <span className="odd-num font-semibold text-gold">{formatOdd(totalOdd)}</span>
          <span>{collapsed ? "▲" : "▼"}</span>
        </span>
      </button>

      {!collapsed && (
        <div className="max-h-[55vh] space-y-3 overflow-y-auto px-4 py-3">
          {message && (
            <p
              className={`rounded-lg border px-3 py-2 text-xs ${
                message.kind === "ok"
                  ? "border-accent/50 bg-accent/10 text-accent"
                  : "border-red-500/50 bg-red-500/10 text-red-200"
              }`}
            >
              {message.text}
            </p>
          )}

          {items.length === 0 && (
            <button
              onClick={() => setMessage(null)}
              className="w-full rounded-lg border border-edge px-3 py-2 text-xs text-muted transition hover:text-white"
            >
              Fechar aviso
            </button>
          )}

          {items.length > 0 && (
            <>
              <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.key} className="rounded-lg border border-edge bg-background/60 p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-white/90">
                      {item.home} x {item.away}
                    </p>
                    <p className="truncate text-[11px] text-muted">
                      {item.marketName} · {item.label}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="odd-num text-sm font-semibold text-accent">{formatOdd(item.odd)}</span>
                    <button
                      onClick={() => remove(item.key)}
                      className="text-muted transition hover:text-red-300"
                      aria-label="Remover seleção"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2">
            <label className="text-xs text-muted">Valor (R$)</label>
            <input
              value={stakeText}
              onChange={(event) => setStakeText(event.target.value)}
              inputMode="decimal"
              className="w-24 rounded-lg border border-edge bg-background px-2 py-1.5 text-sm outline-none focus:border-accent"
            />
            <div className="ml-auto text-right text-xs text-muted">
              Retorno
              <span className="odd-num ml-1 text-sm font-semibold text-gold">
                {formatBRL(potentialCents)}
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={clear}
              className="rounded-lg border border-edge px-3 py-2 text-xs text-muted transition hover:text-white"
            >
              Limpar
            </button>
            <button
              onClick={submit}
              disabled={busy || stakeCents <= 0}
              className="flex-1 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Enviando…" : "Apostar agora"}
            </button>
          </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
