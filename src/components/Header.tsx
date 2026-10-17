import Link from "next/link";
import { formatBRL } from "@/lib/money";
import { Logo } from "./Logo";
import LogoutButton from "./LogoutButton";

export default function Header({
  user,
}: {
  user: { name: string; balance_cents: number };
}) {
  const firstName = user.name.split(" ")[0];
  return (
    <header className="sticky top-0 z-30 border-b border-edge bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
        <Link href="/" aria-label="SoccerScore — início">
          <Logo />
        </Link>
        <nav className="ml-3 hidden items-center gap-1 text-sm sm:flex">
          <NavLink href="/">Início</NavLink>
          <NavLink href="/deposito">Depósito</NavLink>
          <NavLink href="/conta">Minha conta</NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <div className="text-right">
            <p className="text-[11px] leading-none text-muted">Saldo</p>
            <p className="odd-num text-sm font-semibold text-gold">
              {formatBRL(user.balance_cents)}
            </p>
          </div>
          <span className="hidden max-w-[10rem] truncate text-xs text-muted md:block">{firstName}</span>
          <LogoutButton />
        </div>
      </div>
      <nav className="flex items-center gap-1 overflow-x-auto border-t border-edge px-4 py-2 text-sm sm:hidden">
        <NavLink href="/">Início</NavLink>
        <NavLink href="/deposito">Depósito</NavLink>
        <NavLink href="/conta">Minha conta</NavLink>
      </nav>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="whitespace-nowrap rounded-lg px-3 py-1.5 text-muted transition hover:bg-panel2 hover:text-white"
    >
      {children}
    </Link>
  );
}
