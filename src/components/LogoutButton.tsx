"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={logout}
      disabled={busy}
      className="rounded-lg border border-edge px-3 py-1.5 text-xs text-muted transition hover:border-red-400/60 hover:text-red-200 disabled:opacity-50"
    >
      {busy ? "Saindo…" : "Sair"}
    </button>
  );
}
