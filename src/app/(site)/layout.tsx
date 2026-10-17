import type { ReactNode } from "react";
import BetSlip from "@/components/BetSlip";
import Header from "@/components/Header";
import { SlipProvider } from "@/components/SlipProvider";
import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { settleUserBets } from "@/lib/wallet";

export default async function SiteLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  await settleUserBets(user.id);

  const fresh = await q<{ balance_cents: number }>(
    "SELECT balance_cents FROM users WHERE id = ?",
    [user.id],
  );
  const balance = fresh[0]?.balance_cents ?? user.balance_cents;

  return (
    <SlipProvider>
      <Header user={{ name: user.name, balance_cents: balance }} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-t border-edge py-6 text-center text-[11px] text-muted">
        SoccerScore © {new Date().getFullYear()} — plataforma demonstrativa. Jogos, ligas e placares ao
        vivo: Flashscore. Odds, mercados e pagamentos são simulados — nenhum valor real é movimentado.
        Aposte com responsabilidade (+18).
      </footer>
      <BetSlip />
    </SlipProvider>
  );
}
