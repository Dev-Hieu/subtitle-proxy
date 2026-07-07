import { YoutubeTranscript } from "youtube-transcript";

export default async function handler(req, res) {
  const videoId = req.query.v;
  if (!videoId || videoId.length !== 11) return res.status(400).json({ error: "missing v" });
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const items = await YoutubeTranscript.fetchTranscript(videoId, { lang: "en" });
    const sentences = items.map((i) => ({
      start: Math.round(i.offset / 100) / 10,
      end: Math.round((i.offset + i.duration) / 100) / 10,
      text: i.text.replace(/\n/g, " ").trim(),
    })).filter((s) => s.text);
    res.json({ videoId, sentences, count: sentences.length });
  } catch (e) {
    res.status(502).json({ error: e.message || "failed" });
  }
}
