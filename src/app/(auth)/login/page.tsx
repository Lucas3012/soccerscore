import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { Logo } from "@/components/Logo";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Entrar ou criar conta",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const user = await getCurrentUser();
  if (user) redirect("/");

  const params = await searchParams;
  const nextParam = typeof params.next === "string" ? params.next : undefined;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-10">
      <Logo className="scale-110" />
      <p className="max-w-md text-center text-sm text-muted">
        Entre para apostar nos maiores campeonatos do Brasil e do mundo — mais de{" "}
        <strong className="text-white">1.500 mercados por jogo</strong>.
      </p>
      <AuthForm next={nextParam} />
      <p className="text-[11px] text-muted">
        +18 · Jogue com responsabilidade · Ambiente de demonstração
      </p>
    </main>
  );
}
