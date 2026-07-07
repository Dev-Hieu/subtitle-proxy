export default async function handler(req, res) {
  const videoId = req.query.v;
  if (!videoId || videoId.length !== 11) return res.status(400).json({ error: "missing v" });
  res.setHeader("Access-Control-Allow-Origin", "*");

  // YouTube Data API v3 — dùng API key (miễn phí 10,000 quota/ngày)
  const API_KEY = process.env.YOUTUBE_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: "missing YOUTUBE_API_KEY env" });

  try {
    // Step 1: Lấy danh sách caption tracks
    const listResp = await fetch(
      `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${videoId}&key=${API_KEY}`
    );
    const listData = await listResp.json();
    
    if (listData.error) {
      // API key error hoặc quota exceeded → fallback youtube-transcript
      return await fallbackTranscript(videoId, res);
    }

    const tracks = listData.items || [];
    const enTrack = tracks.find(t => 
      (t.snippet?.language || "").startsWith("en") && t.snippet?.trackKind === "ASR"
    ) || tracks.find(t => 
      (t.snippet?.language || "").startsWith("en")
    );

    if (!enTrack) {
      // Không có caption trong API → fallback
      return await fallbackTranscript(videoId, res);
    }

    // Step 2: YouTube captions.download cần OAuth (không dùng API key được)
    // → Dùng timedtext URL trực tiếp
    const timedtextResp = await fetch(
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=srv3&key=${API_KEY}`
    );
    const xml = await timedtextResp.text();
    
    if (xml && xml.includes("<text")) {
      const sentences = parseXml(xml);
      if (sentences.length > 0) {
        return res.json({ videoId, sentences, count: sentences.length, method: "youtube-api" });
      }
    }

    // Fallback
    return await fallbackTranscript(videoId, res);
  } catch (e) {
    return res.status(502).json({ error: e.message || "failed" });
  }
}

async function fallbackTranscript(videoId, res) {
  try {
    const { YoutubeTranscript } = await import("youtube-transcript");
    for (const lang of ["en", ""]) {
      try {
        const items = await YoutubeTranscript.fetchTranscript(videoId, lang ? { lang } : {});
        if (items?.length) {
          const sentences = items.map(i => ({
            start: Math.round(i.offset / 100) / 10,
            end: Math.round((i.offset + i.duration) / 100) / 10,
            text: i.text.replace(/\n/g, " ").trim(),
          })).filter(s => s.text);
          return res.json({ videoId, sentences, count: sentences.length, method: "yt-transcript" });
        }
      } catch { /* next */ }
    }
  } catch {}
  return res.json({ sentences: [], error: "no captions found" });
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
