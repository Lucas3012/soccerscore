import { compare, hash } from "bcryptjs";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { q, run } from "./db";

export const SESSION_COOKIE = "ss_session";
const SESSION_DAYS = 30;

export type User = {
  id: number;
  name: string;
  email: string;
  balance_cents: number;
};

export async function hashPassword(password: string): Promise<string> {
  return hash(password, 10);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return compare(password, passwordHash);
}

export function newSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export async function createSession(userId: number): Promise<{ token: string; expiresAt: number }> {
  const token = newSessionToken();
  const now = Date.now();
  const expiresAt = now + SESSION_DAYS * 24 * 60 * 60 * 1000;
  await run("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)", [
    token,
    userId,
    now,
    expiresAt,
  ]);
  return { token, expiresAt };
}

export async function setSessionCookie(token: string, expiresAt: number): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await run("DELETE FROM sessions WHERE token = ?", [token]);
  }
  store.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await q<User & { expires_at: number }>(
    `SELECT u.id, u.name, u.email, u.balance_cents, s.expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ?`,
    [token],
  );
  const row = rows[0];
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    await run("DELETE FROM sessions WHERE token = ?", [token]);
    return null;
  }
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    balance_cents: row.balance_cents,
  };
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export function onlyDigits(value: string): string {
  return value.replace(/\D+/g, "");
}

export function isValidCPF(input: string): boolean {
  const cpf = onlyDigits(input);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(cpf[i]) * (10 - i);
  let check = 11 - (sum % 11);
  if (check >= 10) check = 0;
  if (check !== Number(cpf[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(cpf[i]) * (11 - i);
  check = 11 - (sum % 11);
  if (check >= 10) check = 0;
  return check === Number(cpf[10]);
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}
