import type { Metadata } from "next";
import DepositTabs from "@/components/DepositTabs";

export const metadata: Metadata = {
  title: "Depósito via PIX ou cartão",
};

export default function DepositPage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black tracking-tight">💰 Depósito</h1>
        <p className="mt-1 text-sm text-muted">
          Adicione saldo por <strong className="text-white">PIX</strong> ou{" "}
          <strong className="text-white">cartão de crédito</strong>. Apenas esses dois métodos são
          aceitos.
        </p>
      </header>
      <DepositTabs />
    </div>
  );
}
