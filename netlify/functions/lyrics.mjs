import { json, suno, callbackUrl, readJson, str } from "../lib/suno.mjs";

// POST { prompt } -> start an AI lyrics task.  GET ?taskId= -> poll it.
export default async (req) => {
  if (req.method === "POST") {
    const input = await readJson(req);
    const prompt = str(input?.prompt, 200);
    if (!prompt) return json({ error: "Describe what the lyrics should be about." }, 400);
    const r = await suno("/api/v1/lyrics", { method: "POST", body: { prompt, callBackUrl: callbackUrl(req) } });
    if (!r.ok) return json({ error: r.error, code: r.code }, r.status);
    return json({ taskId: r.data?.taskId });
  }

  const taskId = new URL(req.url).searchParams.get("taskId") || "";
  if (!/^[A-Za-z0-9_-]{4,128}$/.test(taskId)) return json({ error: "Invalid taskId." }, 400);
  const r = await suno(`/api/v1/lyrics/record-info?taskId=${encodeURIComponent(taskId)}`);
  if (!r.ok) return json({ error: r.error, code: r.code }, r.status);
  const d = r.data || {};
  const options = (d.response?.data || []).filter((o) => o.text).map((o) => ({ title: o.title, text: o.text }));
  return json({ taskId, status: d.status || "PENDING", errorMessage: d.errorMessage || null, options });
};
