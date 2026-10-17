import { NextResponse } from "next/server";
import { createSession, setSessionCookie, verifyPassword } from "@/lib/auth";
import { q } from "@/lib/db";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "Requisição inválida." }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  if (!email || !password) {
    return NextResponse.json({ ok: false, error: "Informe e-mail e senha." }, { status: 400 });
  }

  const rows = await q<{
    id: number;
    name: string;
    email: string;
    password_hash: string;
  }>("SELECT id, name, email, password_hash FROM users WHERE email = ?", [email]);

  const user = rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return NextResponse.json({ ok: false, error: "E-mail ou senha incorretos." }, { status: 401 });
  }

  const session = await createSession(user.id);
  await setSessionCookie(session.token, session.expiresAt);

  return NextResponse.json({ ok: true, user: { id: user.id, name: user.name, email: user.email } });
}
