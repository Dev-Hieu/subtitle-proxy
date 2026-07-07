export default async function handler(req, res) {
  const videoId = req.query.v;
  if (!videoId || videoId.length !== 11) return res.status(400).json({ error: "missing v" });
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    // Method 1: innertube embedded player API
    const tracks = await getTracksInnertube(videoId);
    const en = tracks.find((t) => (t.languageCode || "").startsWith("en"));
    if (en) return res.json(await fetchAndParse(en.baseUrl.replace(/\\u0026/g, "&"), videoId));

    // Method 2: innertube WEB client
    const tracks2 = await getTracksWeb(videoId);
    const en2 = tracks2.find((t) => (t.languageCode || "").startsWith("en"));
    if (en2) return res.json(await fetchAndParse(en2.baseUrl.replace(/\\u0026/g, "&"), videoId));

    // Method 3: scrape HTML
    const tracks3 = await getTracksHtml(videoId);
    const en3 = tracks3.find((t) => (t.languageCode || "").startsWith("en"));
    if (en3) return res.json(await fetchAndParse(en3.baseUrl.replace(/\\u0026/g, "&"), videoId));

    res.json({ sentences: [], error: "no captions found" });
  } catch (e) {
    res.status(502).json({ error: e.message || "failed" });
  }
}

async function getTracksInnertube(videoId) {
  try {
    const r = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        context: { client: { clientName: "WEB_EMBEDDED_PLAYER", clientVersion: "1.20240101.00.00", hl: "en" }, thirdParty: { embedUrl: "https://www.google.com" } },
        videoId,
      }),
    });
    const d = await r.json();
    return d?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  } catch { return []; }
}

async function getTracksWeb(videoId) {
  try {
    const r = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
      body: JSON.stringify({
        context: { client: { clientName: "WEB", clientVersion: "2.20240101.00.00", hl: "en", gl: "US" } },
        videoId,
      }),
    });
    const d = await r.json();
    return d?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  } catch { return []; }
}

async function getTracksHtml(videoId) {
  try {
    const r = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Accept-Language": "en-US,en;q=0.9", "Cookie": "CONSENT=YES+cb.20210328-17-p0.en+FX+929" },
    });
    const html = await r.text();
    const m = html.match(/"captionTracks":\[(.*?)\]/);
    if (!m) return [];
    return JSON.parse(`[${m[1]}]`);
  } catch { return []; }
}

async function fetchAndParse(subUrl, videoId) {
  const r = await fetch(subUrl);
  const xml = await r.text();
  const sentences = [];
  const re = /<text start="([^"]+)" dur="([^"]+)"[^>]*>([^<]*)<\/text>/g;
  let match;
  while ((match = re.exec(xml)) !== null) {
    const s = parseFloat(match[1]), d = parseFloat(match[2]);
    let t = match[3].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\n/g, " ").trim();
    if (t) sentences.push({ start: Math.round(s * 10) / 10, end: Math.round((s + d) * 10) / 10, text: t });
  }
  return { videoId, sentences, count: sentences.length };
}
