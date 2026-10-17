"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatBRL, parseAmountToCents } from "@/lib/money";

type PixCharge = {
  transactionId: number;
  amountCents: number;
  payload: string;
  qr: string;
  txid: string;
};

export default function DepositTabs() {
  const router = useRouter();
  const [tab, setTab] = useState<"pix" | "card">("pix");
  const [amountText, setAmountText] = useState("50,00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pix, setPix] = useState<PixCharge | null>(null);
  const [pixConfirmed, setPixConfirmed] = useState(false);
  const [cardForm, setCardForm] = useState({ number: "", holder: "", expiry: "", cvv: "" });
  const [cardApproved, setCardApproved] = useState<number | null>(null);

  const amountCents = parseAmountToCents(amountText) ?? 0;

  async function createPix() {
    setBusy(true);
    setError(null);
    setPixConfirmed(false);
    try {
      const res = await fetch("/api/deposits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method: "pix", amountCents }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string } & PixCharge;
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Falha ao gerar o PIX.");
      setPix({
        transactionId: json.transactionId,
        amountCents: json.amountCents,
        payload: json.payload,
        qr: json.qr,
        txid: json.txid,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmPix() {
    if (!pix) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/deposits/${pix.transactionId}/confirm`, { method: "POST" });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Falha ao confirmar o pagamento.");
      setPixConfirmed(true);
      setPix(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setBusy(false);
    }
  }

  async function payCard(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/deposits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method: "card", amountCents, card: cardForm }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string; amountCents?: number };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Pagamento recusado.");
      setCardApproved(json.amountCents ?? amountCents);
      setCardForm({ number: "", holder: "", expiry: "", cvv: "" });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setBusy(false);
    }
  }

  async function copyPayload() {
    if (!pix) return;
    try {
      await navigator.clipboard.writeText(pix.payload);
    } catch {
      /* clipboard may be unavailable */
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="rounded-2xl border border-edge bg-panel/80 p-5">
        <div className="mb-5 grid grid-cols-2 rounded-xl border border-edge bg-background/60 p-1 text-sm">
          <button
            onClick={() => setTab("pix")}
            className={`rounded-lg py-2 font-medium transition ${
              tab === "pix" ? "bg-accent text-black" : "text-muted hover:text-white"
            }`}
          >
            PIX
          </button>
          <button
            onClick={() => setTab("card")}
            className={`rounded-lg py-2 font-medium transition ${
              tab === "card" ? "bg-accent text-black" : "text-muted hover:text-white"
            }`}
          >
            Cartão de crédito
          </button>
        </div>

        <label className="mb-1 block text-xs text-muted">Valor do depósito</label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={amountText}
            onChange={(event) => setAmountText(event.target.value)}
            inputMode="decimal"
            className="w-36 rounded-lg border border-edge bg-background px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
          {["20,00", "50,00", "100,00", "200,00"].map((value) => (
            <button
              key={value}
              onClick={() => setAmountText(value)}
              className="rounded-lg border border-edge px-3 py-2 text-xs text-muted transition hover:border-accent/60 hover:text-white"
            >
              R$ {value}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted">
          Mínimo {formatBRL(1000)} · máximo {formatBRL(500000)} · limite aumentado após verificação
        </p>

        {error && (
          <p className="mt-3 rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {error}
          </p>
        )}
        {pixConfirmed && (
          <p className="mt-3 rounded-lg border border-accent/50 bg-accent/10 px-3 py-2 text-xs text-accent">
            Depósito PIX confirmado! Seu saldo já está atualizado.
          </p>
        )}
        {cardApproved !== null && (
          <p className="mt-3 rounded-lg border border-accent/50 bg-accent/10 px-3 py-2 text-xs text-accent">
            Pagamento aprovado no valor de {formatBRL(cardApproved)}. Saldo creditado!
          </p>
        )}

        {tab === "pix" && (
          <div className="mt-5">
            <button
              onClick={createPix}
              disabled={busy || amountCents < 1000}
              className="rounded-xl bg-accent px-5 py-3 text-sm font-bold text-black transition hover:brightness-110 disabled:opacity-50"
            >
              {busy ? "Gerando…" : "Gerar QR Code PIX"}
            </button>

            {pix && (
              <div className="mt-5 flex flex-col gap-4 rounded-xl border border-edge bg-background/60 p-4 sm:flex-row">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pix.qr}
                  alt="QR Code do PIX"
                  className="h-44 w-44 shrink-0 self-center rounded-lg border border-edge bg-white p-1"
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-sm font-semibold">
                    PIX de {formatBRL(pix.amountCents)} · ref. {pix.txid}
                  </p>
                  <p className="break-all rounded-lg border border-edge bg-panel2/60 p-2 text-[11px] text-muted">
                    {pix.payload}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={copyPayload}
                      className="rounded-lg border border-edge px-3 py-2 text-xs text-muted transition hover:text-white"
                    >
                      Copiar código
                    </button>
                    <button
                      onClick={confirmPix}
                      disabled={busy}
                      className="rounded-lg bg-emerald-600/90 px-3 py-2 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
                    >
                      Já paguei (simular confirmação)
                    </button>
                  </div>
                  <p className="text-[11px] text-muted">
                    Demonstração: o QR Code é um BR Code válido para leitura, mas não há banco
                    recebedor — a confirmação é simulada.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "card" && (
          <form onSubmit={payCard} className="mt-5 space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Número do cartão</span>
              <input
                value={cardForm.number}
                onChange={(event) => setCardForm((f) => ({ ...f, number: event.target.value }))}
                placeholder="4111 1111 1111 1111"
                inputMode="numeric"
                className="w-full rounded-lg border border-edge bg-background px-3 py-2.5 text-sm outline-none focus:border-accent"
                required
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Nome impresso no cartão</span>
              <input
                value={cardForm.holder}
                onChange={(event) => setCardForm((f) => ({ ...f, holder: event.target.value }))}
                placeholder="MARIA D SILVA"
                className="w-full rounded-lg border border-edge bg-background px-3 py-2.5 text-sm outline-none focus:border-accent"
                required
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs text-muted">Validade (MM/AA)</span>
                <input
                  value={cardForm.expiry}
                  onChange={(event) => setCardForm((f) => ({ ...f, expiry: event.target.value }))}
                  placeholder="12/28"
                  className="w-full rounded-lg border border-edge bg-background px-3 py-2.5 text-sm outline-none focus:border-accent"
                  required
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-muted">CVV</span>
                <input
                  value={cardForm.cvv}
                  onChange={(event) => setCardForm((f) => ({ ...f, cvv: event.target.value }))}
                  placeholder="123"
                  inputMode="numeric"
                  className="w-full rounded-lg border border-edge bg-background px-3 py-2.5 text-sm outline-none focus:border-accent"
                  required
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={busy || amountCents < 1000}
              className="rounded-xl bg-accent px-5 py-3 text-sm font-bold text-black transition hover:brightness-110 disabled:opacity-50"
            >
              {busy ? "Processando…" : `Pagar ${formatBRL(amountCents)}`}
            </button>
            <p className="text-[11px] text-muted">
              Demonstração: nenhum dado de cartão é armazenado ou cobrado — a aprovação é simulada
              com validação de Luhn.
            </p>
          </form>
        )}
      </div>

      <aside className="space-y-3 self-start rounded-2xl border border-edge bg-panel/80 p-5 text-sm">
        <h3 className="font-semibold text-white">Como funciona o depósito</h3>
        <ul className="space-y-2 text-xs leading-relaxed text-muted">
          <li>• PIX: gere o QR Code, pague no app do seu banco e toque em “Já paguei”.</li>
          <li>• Cartão: preencha os dados e a aprovação é imediata.</li>
          <li>• O saldo é creditado na hora e pode ser usado para apostar.</li>
          <li>• Ambiente de demonstração: não há dinheiro real envolvido.</li>
        </ul>
      </aside>
    </div>
  );
}
