const { createClient } = require("@libsql/client");

(async () => {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  const users = await client.execute("SELECT id, name, email, balance_cents FROM users");
  const tables = await client.execute("SELECT name FROM sqlite_master WHERE type='table'");
  console.log("tabelas:", tables.rows.map((row) => row.name).join(", "));
  console.log("usuários:", JSON.stringify(users.rows, null, 2));
  client.close();
})().catch((error) => {
  console.error("ERRO:", error.message);
  process.exit(1);
});
