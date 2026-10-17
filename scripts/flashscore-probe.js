const HEADERS = {
  "x-fsign": "SW9D1eZo",
  Referer: "https://www.flashscore.com.br/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "*/*",
};

(async () => {
  const urls = [
    "https://global.flashscore.ninja/401/x/feed/dc_1_GMtcxRgA",
    "https://www.flashscore.com.br/x/feed/dc_1_nylhpPON",
  ];
  for (const url of urls) {
    const res = await fetch(url, { headers: HEADERS });
    const text = await res.text();
    console.log(`\n=== ${url}\nstatus ${res.status} · ${text.length} bytes`);
    console.log(JSON.stringify(text.slice(0, 1200)));
  }
})().catch((error) => console.error("ERRO:", error.message));
