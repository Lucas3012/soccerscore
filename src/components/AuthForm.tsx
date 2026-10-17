"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Mode = "login" | "register";

export default function AuthForm({ next }: { next?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    cpf: "",
    phone: "",
    password: "",
  });

  function update(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const url = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload =
        mode === "login"
          ? { email: form.email, password: form.password }
          : {
              name: form.name,
              email: form.email,
              cpf: form.cpf,
              phone: form.phone,
              password: form.password,
            };
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Não foi possível entrar.");
      router.replace(next && next.startsWith("/") ? next : "/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-edge bg-panel/90 p-6 shadow-2xl">
      <div className="mb-5 grid grid-cols-2 rounded-xl border border-edge bg-background/60 p-1 text-sm">
        <button
          onClick={() => setMode("login")}
          className={`rounded-lg py-2 font-medium transition ${
            mode === "login" ? "bg-accent text-black" : "text-muted hover:text-white"
          }`}
        >
          Entrar
        </button>
        <button
          onClick={() => setMode("register")}
          className={`rounded-lg py-2 font-medium transition ${
            mode === "register" ? "bg-accent text-black" : "text-muted hover:text-white"
          }`}
        >
          Criar conta
        </button>
      </div>

      <form onSubmit={submit} className="space-y-3">
        {mode === "register" && (
          <>
            <Field
              label="Nome completo"
              value={form.name}
              onChange={(value) => update("name", value)}
              placeholder="Maria da Silva"
              required
            />
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="CPF"
                value={form.cpf}
                onChange={(value) => update("cpf", value)}
                placeholder="000.000.000-00"
                required
              />
              <Field
                label="Celular (opcional)"
                value={form.phone}
                onChange={(value) => update("phone", value)}
                placeholder="(11) 99999-9999"
              />
            </div>
          </>
        )}
        <Field
          label="E-mail"
          type="email"
          value={form.email}
          onChange={(value) => update("email", value)}
          placeholder="voce@email.com"
          required
        />
        <Field
          label="Senha"
          type="password"
          value={form.password}
          onChange={(value) => update("password", value)}
          placeholder={mode === "register" ? "Mínimo 6 caracteres" : "Sua senha"}
          required
        />

        {error && (
          <p className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-accent py-3 text-sm font-bold text-black transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Aguarde…" : mode === "login" ? "Entrar na conta" : "Criar conta e entrar"}
        </button>
      </form>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-muted">
        Plataforma demonstrativa. Apostas apenas com saldo simulado — nenhum pagamento real é
        processado.
      </p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-lg border border-edge bg-background px-3 py-2.5 text-sm outline-none placeholder:text-muted/70 focus:border-accent"
      />
    </label>
  );
}
