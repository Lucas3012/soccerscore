import { createClient, type Client, type InValue } from "@libsql/client";

/**
 * Turso (libSQL) access. In production the app talks to the remote Turso
 * database through TURSO_DATABASE_URL/TURSO_AUTH_TOKEN; in local development
 * it falls back to a file database so everything still works offline.
 */

const globalForDb = globalThis as unknown as {
  __ssClient?: Client;
  __ssSchema?: Promise<void>;
};

export function db(): Client {
  if (!globalForDb.__ssClient) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;
    globalForDb.__ssClient = url
      ? createClient({ url, authToken })
      : createClient({ url: "file:local.db" });
  }
  return globalForDb.__ssClient;
}

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    cpf TEXT NOT NULL,
    phone TEXT,
    password_hash TEXT NOT NULL,
    balance_cents INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    method TEXT,
    amount_cents INTEGER NOT NULL,
    status TEXT NOT NULL,
    detail TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS bets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    stake_cents INTEGER NOT NULL,
    total_odd REAL NOT NULL,
    potential_cents INTEGER NOT NULL,
    status TEXT NOT NULL,
    selections TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    settled_at INTEGER
  )`,
];

export function ensureSchema(): Promise<void> {
  if (!globalForDb.__ssSchema) {
    globalForDb.__ssSchema = (async () => {
      await db().batch(SCHEMA_STATEMENTS, "write");
    })().catch((error) => {
      globalForDb.__ssSchema = undefined;
      throw error;
    });
  }
  return globalForDb.__ssSchema;
}

export async function q<T = Record<string, unknown>>(
  sql: string,
  args: InValue[] = [],
): Promise<T[]> {
  await ensureSchema();
  const result = await db().execute({ sql, args });
  return result.rows as unknown as T[];
}

export async function run(sql: string, args: InValue[] = []) {
  await ensureSchema();
  return db().execute({ sql, args });
}
