import { json, suno } from "../lib/suno.mjs";

export default async () => {
  const r = await suno("/api/v1/generate/credit");
  if (!r.ok) return json({ error: r.error, code: r.code }, r.status);
  return json({ credits: r.data });
};
