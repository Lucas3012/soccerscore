/**
 * Verifica a liquidação de apostas em jogos ao vivo.
 *
 * Cria uma conta nova, injeta apostas pendentes (vitória, derrota, estorno,
 * múltipla com perna anulada e aposta ainda em andamento) e abre a home para
 * disparar o settleUserBets(), conferindo os status e os créditos no extrato.
 */
const fs = require("fs");
const { createClient } = require("@libsql/client");

const BASE = process.env.BASE || "http://localhost:3000";
const HEADERS = {
  "x-fsign": "SW9D1eZo",
  Referer: "https://www.flashscore.com.br/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "*/*",
};

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

function parseFeed(text) {
  const out = [];
  for (const block of text.split("~")) {
    if (!block) continue;
    const record = {};
    for (const pair of block.split("\u00ac")) {
      const idx = pair.indexOf("\u00f7");
      if (idx === -1) continue;
      record[pair.slice(0, idx)] = pair.slice(idx + 1);
    }
    if (Object.keys(record).length > 0) out.push(record);
  }
  return out;
}

async function post(path, body, cookie) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body ?? {}),
  });
  return { res, json: await res.json().catch(() => null) };
}

function cpfCheck(base) {
  const calc = (nums) => {
    const sum = nums.reduce((acc, n, i) => acc + n * (nums.length + 1 - i), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  const d1 = calc(base.split("").map(Number));
  const d2 = calc([...base.split("").map(Number), d1]);
  return `${base}${d1}${d2}`;
}

async function main() {
  const env = loadEnv();
  const client = createClient({
    url: env.TURSO_DATABASE_URL,
    authToken: env.TURSO_AUTH_TOKEN,
  });

  // ── 1) cria a conta de teste ────────────────────────────────────────────
  const stamp = Date.now().toString().slice(-8);
  const reg = await post("/api/auth/register", {
    name: "Teste Liquidacao",
    email: `teste.settle.${stamp}@soccerscore.dev`,
    cpf: cpfCheck("123456789"),
    phone: "11999997777",
    password: "senha123",
  });
  const userId = reg.json?.user?.id;
  const cookie = (reg.res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  if (!userId) throw new Error(`registro falhou: ${JSON.stringify(reg.json)}`);
  console.log("usuário de teste:", userId, `(saldo inicial 0)`);

  // ── 2) descobre jogos no feed: um encerrado e um ao vivo ───────────────
  const feedRes = await fetch("https://www.flashscore.com.br/x/feed/f_1_0_2_pt_1", {
    headers: HEADERS,
  });
  const records = parseFeed(await feedRes.text());
  const finished = records.find(
    (r) => r.AA && r.AB === "3" && Number(r.AG) !== Number(r.AH) && Number(r.AD) > 0,
  );
  const live = records.find((r) => r.AA && r.AB === "2");
  if (!finished || !live) throw new Error("feed sem jogo encerrado/ao vivo para o teste");

  const winner = Number(finished.AG) > Number(finished.AH) ? "1" : "2";
  const loser = winner === "1" ? "2" : "1";
  console.log(
    `jogo encerrado: ${finished.AE} ${finished.AG}x${finished.AH} ${finished.AF} (fs-${finished.AA}) → escolha vencedora r:${winner}`,
  );
  console.log(`jogo ao vivo: ${live.AE} x ${live.AF} (fs-${live.AA}) → deve seguir pendente\n`);

  const now = Date.now();
  const old = Number(finished.AD) * 1000;
  const liveKickoff = Number(live.AD) * 1000;

  const selection = (matchId, selectionId, label, odd, kickoff) => ({
    matchId,
    leagueName: "Liga de teste",
    home: "Time A",
    away: "Time B",
    kickoff,
    marketId: "r",
    marketName: "Resultado Final",
    selectionId,
    label,
    odd,
  });

  const cases = [
    {
      name: "vitória (placar real)",
      stake: 101,
      expect: "won",
      expectCredit: 202,
      items: [selection(`fs-${finished.AA}`, `r:${winner}`, "Vencedor", 2, old)],
    },
    {
      name: "derrota (placar real)",
      stake: 102,
      expect: "lost",
      expectCredit: 0,
      items: [selection(`fs-${finished.AA}`, `r:${loser}`, "Perdedor", 2, old)],
    },
    {
      name: "estorno (jogo fora do feed há +3h)",
      stake: 103,
      expect: "void",
      expectCredit: 103,
      items: [selection("fs-ZZZZZZZZ", "r:1", "Fantasma", 2, now - 5 * 3600_000)],
    },
    {
      name: "mercado de placar em múltipla + perna anulada",
      stake: 104,
      expect: "won",
      expectCredit: 208,
      items: [
        selection(`fs-${finished.AA}`, `r:${winner}`, "Vencedor", 2, old),
        selection("fs-ZZZZZZZZ", "r:1", "Fantasma", 3, now - 5 * 3600_000),
      ],
    },
    {
      name: "aposta ainda em andamento (deve seguir pendente)",
      stake: 105,
      expect: "pending",
      expectCredit: 0,
      items: [
        selection(`fs-${finished.AA}`, `r:${winner}`, "Vencedor", 2, old),
        selection(`fs-${live.AA}`, `r:1`, "Ao vivo", 2, liveKickoff),
      ],
    },
  ];

  for (const item of cases) {
    const inserted = await client.execute({
      sql: `INSERT INTO bets (user_id, stake_cents, total_odd, potential_cents, status, selections, created_at)
            VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
      args: [
        userId,
        item.stake,
        item.items.reduce((acc, s) => acc * s.odd, 1),
        item.stake * item.items.reduce((acc, s) => acc * s.odd, 1),
        JSON.stringify(item.items),
        now,
      ],
    });
    item.betId = Number(inserted.lastInsertRowid);
  }

  // ── 3) abre a home para disparar a liquidação ──────────────────────────
  const page = await fetch(`${BASE}/`, { headers: { cookie } });
  console.log("home:", page.status, "\n");

  // ── 4) confere os resultados ───────────────────────────────────────────
  let failures = 0;
  for (const item of cases) {
    const row = (
      await client.execute({
        sql: "SELECT status FROM bets WHERE id = ?",
        args: [item.betId],
      })
    ).rows[0];
    const credit = (
      await client.execute({
        sql: "SELECT COALESCE(SUM(amount_cents), 0) AS total FROM transactions WHERE user_id = ? AND detail LIKE ?",
        args: [userId, `%aposta #${item.betId}`],
      })
    ).rows[0];
    const ok = row?.status === item.expect && Number(credit?.total ?? 0) === item.expectCredit;
    if (!ok) failures++;
    console.log(
      `${ok ? "OK  " : "FALHA"} | aposta #${item.betId} (${item.name})\n       status=${row?.status} (esperado ${item.expect}) · creditado=${credit?.total}¢ (esperado ${item.expectCredit}¢)`,
    );
  }

  const balance = (
    await client.execute({
      sql: "SELECT balance_cents FROM users WHERE id = ?",
      args: [userId],
    })
  ).rows[0];
  const pending = (
    await client.execute({
      sql: "SELECT COALESCE(SUM(stake_cents), 0) AS total FROM bets WHERE user_id = ? AND status = 'pending'",
      args: [userId],
    })
  ).rows[0];
  console.log(`\nsaldo final: ${balance?.balance_cents}¢ · ainda preso em apostas abertas: ${pending?.total}¢`);
  console.log(failures === 0 ? "\n✅ liquidação ao vivo OK" : `\n❌ ${failures} caso(s) falharam`);

  client.close();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("ERRO:", error.message);
  process.exit(1);
});
