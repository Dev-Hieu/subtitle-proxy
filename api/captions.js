import { YoutubeTranscript } from "youtube-transcript";

export default async function handler(req, res) {
  const videoId = req.query.v;
  if (!videoId || videoId.length !== 11) return res.status(400).json({ error: "missing v" });
  res.setHeader("Access-Control-Allow-Origin", "*");

  // Try multiple languages
  const langs = ["en", "en-US", "en-GB", ""];
  for (const lang of langs) {
    try {
      const config = lang ? { lang } : {};
      const items = await YoutubeTranscript.fetchTranscript(videoId, config);
      if (items && items.length > 0) {
        const sentences = items.map((i) => ({
          start: Math.round(i.offset / 100) / 10,
          end: Math.round((i.offset + i.duration) / 100) / 10,
          text: i.text.replace(/\n/g, " ").trim(),
        })).filter((s) => s.text);
        return res.json({ videoId, sentences, count: sentences.length, lang: lang || "auto" });
      }
    } catch (e) {
      // Try next language
      if (lang === langs[langs.length - 1]) {
        return res.status(502).json({ error: e.message || "failed", tried: langs });
      }
    }
  }
  res.json({ sentences: [], error: "no transcript" });
}
