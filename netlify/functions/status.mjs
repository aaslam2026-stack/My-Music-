import { json, suno } from "../lib/suno.mjs";

// Poll a music generation task. Returns a trimmed, client-friendly shape.
export default async (req) => {
  const taskId = new URL(req.url).searchParams.get("taskId") || "";
  if (!/^[A-Za-z0-9_-]{4,128}$/.test(taskId)) return json({ error: "Invalid taskId." }, 400);

  const r = await suno(`/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`);
  if (!r.ok) return json({ error: r.error, code: r.code }, r.status);

  const d = r.data || {};
  const tracks = (d.response?.sunoData || []).map((t) => ({
    id: t.id,
    title: t.title,
    tags: t.tags,
    lyrics: t.prompt,
    audioUrl: t.audio_url || t.audioUrl || "",
    streamUrl: t.stream_audio_url || t.streamAudioUrl || "",
    imageUrl: t.image_url || t.imageUrl || "",
    duration: t.duration,
    createTime: t.createTime,
  }));
  return json({ taskId, status: d.status || "PENDING", errorMessage: d.errorMessage || null, tracks });
};
