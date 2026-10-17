import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { formatBRL, formatOdd } from "@/lib/money";
import { TZ } from "@/lib/time";
import type { StoredSelection } from "@/lib/types";
import { settleUserBets } from "@/lib/wallet";

export const metadata: Metadata = {
  title: "Minha conta",
};

const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  dateStyle: "short",
  timeStyle: "short",
});

type BetRow = {
  id: number;
  stake_cents: number;
  total_odd: number;
  potential_cents: number;
  status: "pending" | "won" | "lost" | "void";
  selections: string;
  created_at: number;
};

type TransactionRow = {
  id: number;
  type: "deposit" | "bet" | "payout" | "refund";
  method: string | null;
  amount_cents: number;
  status: string;
  detail: string | null;
  created_at: number;
};

const STATUS_LABEL: Record<BetRow["status"], { label: string; className: string }> = {
  pending: { label: "Em aberto", className: "bg-gold/15 text-gold border-gold/40" },
  won: { label: "Ganha", className: "bg-accent/15 text-accent border-accent/40" },
  lost: { label: "Perdida", className: "bg-red-500/15 text-red-300 border-red-500/40" },
  void: { label: "Anulada", className: "bg-panel2 text-muted border-edge" },
};

const TX_LABEL: Record<TransactionRow["type"], string> = {
  deposit: "Depósito",
  bet: "Aposta",
  payout: "Prêmio",
  refund: "Estorno",
};

export default async function AccountPage({ searchParams }: PageProps<"/conta">) {
  const user = await requireUser();
  await settleUserBets(user.id);
  await searchParams;

  const fresh = await q<{ balance_cents: number }>(
    "SELECT balance_cents FROM users WHERE id = ?",
    [user.id],
  );
  const balance = fresh[0]?.balance_cents ?? user.balance_cents;

  const bets = await q<BetRow>(
    `SELECT id, stake_cents, total_odd, potential_cents, status, selections, created_at
     FROM bets WHERE user_id = ? ORDER BY id DESC LIMIT 30`,
    [user.id],
  );

  const transactions = await q<TransactionRow>(
    `SELECT id, type, method, amount_cents, status, detail, created_at
     FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 30`,
    [user.id],
  );

  const totalStaked = bets.reduce((acc, bet) => acc + bet.stake_cents, 0);
  const wonBets = bets.filter((bet) => bet.status === "won").length;

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-gold/40 bg-gold/10 p-5">
          <p className="text-xs text-gold/90">Saldo disponível</p>
          <p className="odd-num mt-1 text-3xl font-black text-gold">{formatBRL(balance)}</p>
        </div>
        <div className="rounded-2xl border border-edge bg-panel/70 p-5">
          <p className="text-xs text-muted">Apostas no histórico</p>
          <p className="odd-num mt-1 text-3xl font-black">{bets.length}</p>
          <p className="mt-1 text-xs text-muted">Total apostado {formatBRL(totalStaked)}</p>
        </div>
        <div className="rounded-2xl border border-edge bg-panel/70 p-5">
          <p className="text-xs text-muted">Apostas ganhas</p>
          <p className="odd-num mt-1 text-3xl font-black text-accent">{wonBets}</p>
          <p className="mt-1 text-xs text-muted">Resultados liquidados automaticamente</p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Minhas apostas</h2>
        {bets.length === 0 ? (
          <p className="rounded-2xl border border-edge bg-panel/70 p-6 text-center text-sm text-muted">
            Você ainda não fez apostas. Escolha um jogo na página inicial para começar.
          </p>
        ) : (
          bets.map((bet) => {
            let selections: StoredSelection[] = [];
            try {
              selections = JSON.parse(bet.selections) as StoredSelection[];
            } catch {
              selections = [];
            }
            const status = STATUS_LABEL[bet.status];
            return (
              <article key={bet.id} className="rounded-2xl border border-edge bg-panel/70 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-0.5 text-[11px] ${status.className}`}>
                    {status.label}
                  </span>
                  <span className="text-xs text-muted">Aposta #{bet.id}</span>
                  <span className="text-xs text-muted">{dateTimeFmt.format(bet.created_at)}</span>
                  <span className="ml-auto text-xs text-muted">
                    {selections.length} seleção(ões) · odd{" "}
                    <span className="odd-num font-semibold text-gold">{formatOdd(bet.total_odd)}</span>
                  </span>
                </div>

                <ul className="mt-3 space-y-1.5">
                  {selections.map((selection, index) => (
                    <li
                      key={`${bet.id}-${index}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-edge/70 bg-background/50 px-3 py-2 text-xs"
                    >
                      <span className="text-white/85">
                        {selection.home} x {selection.away}{" "}
                        <span className="text-muted">· {selection.leagueName}</span>
                      </span>
                      <span className="text-muted">
                        {selection.marketName} — <span className="text-white/80">{selection.label}</span>
                      </span>
                      <span className="odd-num font-semibold text-accent">
                        {formatOdd(selection.odd)}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
                  <span>
                    Valor: <span className="odd-num text-white">{formatBRL(bet.stake_cents)}</span>
                  </span>
                  <span>
                    Retorno potencial:{" "}
                    <span className="odd-num text-gold">{formatBRL(bet.potential_cents)}</span>
                  </span>
                  {bet.status === "won" && (
                    <span className="text-accent">Prêmio creditado no saldo ✓</span>
                  )}
                </div>
              </article>
            );
          })
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Extrato</h2>
        {transactions.length === 0 ? (
          <p className="rounded-2xl border border-edge bg-panel/70 p-6 text-center text-sm text-muted">
            Nenhuma movimentação ainda. Faça um depósito via PIX ou cartão.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-edge bg-panel/70">
            <table className="w-full text-left text-xs">
              <thead className="bg-panel2/70 text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Detalhe</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction) => (
                  <tr key={transaction.id} className="border-t border-edge/70">
                    <td className="px-4 py-3 text-muted">{dateTimeFmt.format(transaction.created_at)}</td>
                    <td className="px-4 py-3">
                      {TX_LABEL[transaction.type]}
                      {transaction.method === "pix" && " · PIX"}
                      {transaction.method === "card" && " · Cartão"}
                    </td>
                    <td className="px-4 py-3 text-muted">{transaction.detail ?? "—"}</td>
                    <td className="px-4 py-3">
                      {transaction.status === "confirmed" ? (
                        <span className="text-accent">Confirmado</span>
                      ) : transaction.status === "pending" ? (
                        <span className="text-gold">Pendente</span>
                      ) : (
                        <span className="text-red-300">Cancelado</span>
                      )}
                    </td>
                    <td
                      className={`odd-num px-4 py-3 text-right font-semibold ${
                        transaction.amount_cents >= 0 ? "text-accent" : "text-red-300"
                      }`}
                    >
                      {transaction.amount_cents >= 0 ? "+" : "-"}
                      {formatBRL(Math.abs(transaction.amount_cents))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
