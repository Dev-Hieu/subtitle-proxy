export default async function handler(req, res) {
  const videoId = req.query.v;
  if (!videoId || videoId.length !== 11) return res.status(400).json({ error: "missing v" });
  res.setHeader("Access-Control-Allow-Origin", "*");
  try {
    const ytResp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Cookie": "CONSENT=YES+cb.20210328-17-p0.en+FX+929"
      }
    });
    const html = await ytResp.text();
    const m = html.match(/"captionTracks":\[(.*?)\]/);
    if (!m) return res.json({ sentences: [], error: "no captions" });
    const tracks = JSON.parse(`[${m[1]}]`);
    const en = tracks.find(t => (t.languageCode || "").startsWith("en"));
    if (!en) return res.json({ sentences: [], error: "no english" });
    const subResp = await fetch(en.baseUrl.replace(/\\u0026/g, "&"));
    const xml = await subResp.text();
    const sentences = [];
    const re = /<text start="([^"]+)" dur="([^"]+)"[^>]*>([^<]*)<\/text>/g;
    let match;
    while ((match = re.exec(xml)) !== null) {
      const s = parseFloat(match[1]), d = parseFloat(match[2]);
      let t = match[3].replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&#39;/g,"'").replace(/\n/g," ").trim();
      if (t) sentences.push({ start: Math.round(s*10)/10, end: Math.round((s+d)*10)/10, text: t });
    }
    res.json({ videoId, sentences, count: sentences.length });
  } catch (e) { res.status(502).json({ error: e.message }); }
}
