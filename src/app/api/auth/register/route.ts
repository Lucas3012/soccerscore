import { NextResponse } from "next/server";
import {
  createSession,
  hashPassword,
  isValidCPF,
  isValidEmail,
  onlyDigits,
  setSessionCookie,
} from "@/lib/auth";
import { ensureSchema, q, run } from "@/lib/db";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "Requisição inválida." }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const cpf = onlyDigits(String(body.cpf ?? ""));
  const phone = onlyDigits(String(body.phone ?? ""));
  const password = String(body.password ?? "");

  if (name.length < 3 || name.length > 80) {
    return NextResponse.json({ ok: false, error: "Informe seu nome completo." }, { status: 400 });
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ ok: false, error: "E-mail inválido." }, { status: 400 });
  }
  if (!isValidCPF(cpf)) {
    return NextResponse.json({ ok: false, error: "CPF inválido." }, { status: 400 });
  }
  if (phone && phone.length < 10) {
    return NextResponse.json({ ok: false, error: "Telefone inválido." }, { status: 400 });
  }
  if (password.length < 6 || password.length > 72) {
    return NextResponse.json(
      { ok: false, error: "A senha precisa ter entre 6 e 72 caracteres." },
      { status: 400 },
    );
  }

  await ensureSchema();
  const existing = await q<{ id: number }>("SELECT id FROM users WHERE email = ?", [email]);
  if (existing.length > 0) {
    return NextResponse.json({ ok: false, error: "Este e-mail já está cadastrado." }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const insert = await run(
    `INSERT INTO users (name, email, cpf, phone, password_hash, balance_cents, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
    [name, email, cpf, phone || null, passwordHash, Date.now()],
  );

  const userId = Number(insert.lastInsertRowid);
  const session = await createSession(userId);
  await setSessionCookie(session.token, session.expiresAt);

  return NextResponse.json({ ok: true, user: { id: userId, name, email } });
}
