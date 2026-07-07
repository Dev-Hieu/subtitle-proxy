export default async function handler(req, res) {
  const videoId = req.query.v;
  if (!videoId || videoId.length !== 11) return res.status(400).json({ error: "missing v" });
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    // Direct innertube API call — different user agent + consent bypass
    const playerResp = await fetch("https://www.youtube.com/youtubei/v1/player", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Youtube-Client-Name": "1",
        "X-Youtube-Client-Version": "2.20240101.00.00",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Origin": "https://www.youtube.com",
        "Referer": "https://www.youtube.com/",
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "WEB",
            clientVersion: "2.20240101.00.00",
            hl: "en",
            gl: "US",
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        },
        videoId,
      }),
    });
    const playerData = await playerResp.json();
    const tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    
    if (tracks.length > 0) {
      const en = tracks.find(t => (t.languageCode || "").startsWith("en")) || tracks[0];
      const subUrl = en.baseUrl.replace(/\\u0026/g, "&");
      const subResp = await fetch(subUrl);
      const xml = await subResp.text();
      const sentences = parseXml(xml);
      if (sentences.length > 0) {
        return res.json({ videoId, sentences, count: sentences.length, method: "innertube", lang: en.languageCode });
      }
    }

    // Fallback: youtube-transcript package
    const { YoutubeTranscript } = await import("youtube-transcript");
    for (const lang of ["en", "en-US", ""]) {
      try {
        const items = await YoutubeTranscript.fetchTranscript(videoId, lang ? { lang } : {});
        if (items?.length) {
          const sentences = items.map(i => ({
            start: Math.round(i.offset / 100) / 10,
            end: Math.round((i.offset + i.duration) / 100) / 10,
            text: i.text.replace(/\n/g, " ").trim(),
          })).filter(s => s.text);
          return res.json({ videoId, sentences, count: sentences.length, method: "yt-transcript", lang: lang || "auto" });
        }
      } catch { /* try next */ }
    }

    // Fallback: scrape page with different approach
    const pageResp = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    const html = await pageResp.text();
    const m = html.match(/"captionTracks":\[(.*?)\]/);
    if (m) {
      const htmlTracks = JSON.parse("[" + m[1] + "]");
      const en = htmlTracks.find(t => (t.languageCode || "").startsWith("en")) || htmlTracks[0];
      if (en) {
        const subResp2 = await fetch(en.baseUrl.replace(/\\u0026/g, "&"));
        const xml2 = await subResp2.text();
        const sentences = parseXml(xml2);
        if (sentences.length > 0) {
          return res.json({ videoId, sentences, count: sentences.length, method: "scrape", lang: en.languageCode });
        }
      }
    }

    res.json({ sentences: [], error: "no captions found" });
  } catch (e) {
    res.status(502).json({ error: e.message || "failed" });
  }
}

function parseXml(xml) {
  const sentences = [];
  const re = /<text start="([^"]+)" dur="([^"]+)"[^>]*>([^<]*)<\/text>/g;
  let match;
  while ((match = re.exec(xml)) !== null) {
    const s = parseFloat(match[1]), d = parseFloat(match[2]);
    let t = match[3].replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\n/g," ").trim();
    if (t) sentences.push({ start: Math.round(s*10)/10, end: Math.round((s+d)*10)/10, text: t });
  }
  return sentences;
}
