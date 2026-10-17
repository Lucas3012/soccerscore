const BASE = "http://localhost:3000";

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

async function post(path, body, cookie) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => null);
  return { res, json };
}

async function get(path, cookie) {
  const res = await fetch(`${BASE}${path}`, { headers: cookie ? { cookie } : {} });
  const json = await res.json().catch(() => null);
  return { res, json };
}

(async () => {
  const stamp = Date.now().toString().slice(-8);
  const reg = await post("/api/auth/register", {
    name: "Teste Ao Vivo",
    email: `teste.live.${stamp}@soccerscore.dev`,
    cpf: cpfCheck("987654321"),
    phone: "11999998888",
    password: "senha123",
  });
  const cookie = (reg.res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  console.log("registro:", reg.res.status, JSON.stringify(reg.json?.user ?? reg.json));

  const live = await get("/api/live", cookie);
  const matches = live.json?.matches ?? [];
  console.log("\n/api/live:", live.res.status, "ok=", live.json?.ok, "jogos=", matches.length, "erro=", live.json?.error);

  const clocks = new Map();
  for (const m of matches) clocks.set(m.clockLabel, (clocks.get(m.clockLabel) ?? 0) + 1);
  const clockList = [...clocks.entries()].sort((a, b) => b[1] - a[1]);
  console.log("relógios:", clockList.slice(0, 14).map(([k, v]) => `${k}=${v}`).join(" "));

  const latest = [...matches].sort((a, b) => b.kickoff - a.kickoff).slice(0, 8);
  console.log("\njogos mais recentes:");
  for (const m of latest) {
    console.log(`  ${m.flag} ${m.leagueName} | ${m.home} ${m.homeScore}x${m.awayScore} ${m.away} | ${m.clockLabel}`);
  }

  const target = latest[0] ?? matches[0];
  if (!target) return;

  // depósito simulado via PIX
  const dep = await post("/api/deposits", { method: "pix", amountCents: 10000 }, cookie);
  const txId = dep.json?.transactionId;
  console.log("\ndepósito pix:", dep.res.status, "tx=", txId);
  const conf = await post(`/api/deposits/${txId}/confirm`, {}, cookie);
  console.log("confirmação:", conf.res.status, JSON.stringify(conf.json));

  // mercados do jogo ao vivo
  const odds = await get(`/api/odds/${encodeURIComponent(target.id)}`, cookie);
  const total = (odds.json?.markets ?? []).reduce((acc, m) => acc + m.selections.length, 0);
  console.log("\nmercados de", target.id, "→", odds.res.status, "total=", total);

  // aposta ao vivo (1X2 + escanteios simulados)
  const cornerMarket = (odds.json?.markets ?? []).find((m) => m.group === "escanteios");
  const cornerSel = cornerMarket?.selections?.[0];
  const bet = await post(
    "/api/bets",
    {
      stakeCents: 1000,
      selections: [
        { matchId: target.id, selectionId: "r:1" },
      ],
    },
    cookie,
  );
  console.log("aposta ao vivo:", bet.res.status, JSON.stringify(bet.json));

  const betCorner = cornerSel
    ? await post(
        "/api/bets",
        { stakeCents: 500, selections: [{ matchId: target.id, selectionId: cornerSel.id }] },
        cookie,
      )
    : null;
  if (betCorner) {
    console.log("aposta escanteios (mesmo jogo):", betCorner.res.status, JSON.stringify(betCorner.json));
  }

  // múltipla com 2 jogos ao vivo
  const two = matches.slice(0, 2);
  if (two.length === 2) {
    const multi = await post(
      "/api/bets",
      {
        stakeCents: 500,
        selections: [
          { matchId: two[0].id, selectionId: "r:1" },
          { matchId: two[1].id, selectionId: "r:2" },
        ],
      },
      cookie,
    );
    console.log("múltipla ao vivo:", multi.res.status, JSON.stringify(multi.json));
  }

  // jogo encerrado / inexistente
  const gone = await get("/api/odds/fs-XXXXXXXX", cookie);
  console.log("odds de jogo inexistente:", gone.res.status, JSON.stringify(gone.json));

  // conta
  const conta = await fetch(`${BASE}/conta`, { headers: { cookie } });
  const html = await conta.text();
  console.log("\n/conta:", conta.status, "menciona 'Ao vivo':", html.includes("Ao vivo"));
})().catch((error) => console.error("ERRO:", error.message));
