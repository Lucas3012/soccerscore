const HEADERS = {
  "x-fsign": "SW9D1eZo",
  Referer: "https://www.flashscore.com.br/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "*/*",
};

function parseFeed(text) {
  const blocks = text.split("~").filter(Boolean);
  const out = [];
  for (const block of blocks) {
    const record = {};
    for (const pair of block.split("\u00ac")) {
      const idx = pair.indexOf("\u00f7");
      if (idx === -1) continue;
      record[pair.slice(0, idx)] = pair.slice(idx + 1);
    }
    out.push(record);
  }
  return out;
}

async function snapshot() {
  const res = await fetch("https://www.flashscore.com.br/x/feed/f_1_0_3_pt_1", { headers: HEADERS });
  const records = parseFeed(await res.text());
  const map = new Map();
  let league = null;
  for (const record of records) {
    if (record.ZA && !record.AA) league = record.ZA;
    else if (record.AA && record.AB === "2") map.set(record.AA, { ...record, league });
  }
  return map;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const first = await snapshot();
  console.log("captura 1:", first.size, "jogos ao vivo");
  await sleep(75000);
  const second = await snapshot();
  console.log("captura 2:", second.size, "jogos ao vivo");

  let changed = 0;
  for (const [id, a] of first) {
    const b = second.get(id);
    if (!b) continue;
    const diff = [];
    for (const key of ["AB", "AC", "BC", "BD", "CR", "AG", "AH", "AW", "AO", "BX", "WL", "AN"]) {
      if (a[key] !== b[key]) diff.push(`${key}: ${a[key]} -> ${b[key]}`);
    }
    if (diff.length) {
      changed += 1;
      if (changed <= 10) console.log(`${a.AE} x ${a.AF} [${a.league}] :: ${diff.join(", ")}`);
    }
  }
  console.log("jogos com mudanças:", changed);
})().catch((error) => console.error("ERRO:", error.message));
