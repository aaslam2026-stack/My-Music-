import { json, suno, callbackUrl, readJson, str, num01 } from "../lib/suno.mjs";

const MODELS = ["V6", "V6_WILD", "V6_MINI"];

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const input = await readJson(req);
  if (!input) return json({ error: "Invalid JSON body." }, 400);

  const customMode = input.customMode === true;
  const instrumental = input.instrumental === true;
  const model = MODELS.includes(input.model) ? input.model : "V6";

  const body = { customMode, instrumental, model, callBackUrl: callbackUrl(req) };
  const style = str(input.style, 1000);
  if (style) body.style = style;

  if (!customMode) {
    // Simple mode: prompt is the idea; lyrics are written automatically.
    const prompt = str(input.prompt, 3000);
    if (!prompt) return json({ error: "Please describe the song you want." }, 400);
    if (!style) return json({ error: "Please pick or type a style." }, 400);
    body.prompt = prompt;
  } else {
    // Custom mode: full control.
    const title = str(input.title, 80);
    const lyrics = instrumental ? "" : str(input.lyrics, 5000);
    const negativeTags = str(input.negativeTags, 1000);
    if (!style && !lyrics && !negativeTags) {
      return json({ error: "Provide at least a style or lyrics." }, 400);
    }
    if (title) body.title = title;
    if (lyrics) body.lyrics = lyrics;
    if (negativeTags) body.negativeTags = negativeTags;
    if (!instrumental && (input.vocalGender === "m" || input.vocalGender === "f")) body.vocalGender = input.vocalGender;

    const duration = Number(input.duration);
    if (Number.isFinite(duration) && duration >= 10 && duration <= 360) body.duration = Math.round(duration);

    const styleWeight = num01(input.styleWeight);
    const weirdness = num01(input.weirdnessConstraint);
    if (styleWeight !== undefined) body.styleWeight = styleWeight;
    if (weirdness !== undefined) body.weirdnessConstraint = weirdness;

    const variety = Number(input.variety);
    if (Number.isInteger(variety) && variety >= 0 && variety <= 4) body.variety = variety;
  }

  const r = await suno("/api/v1/generate", { method: "POST", body });
  if (!r.ok) return json({ error: r.error, code: r.code }, r.status);
  return json({ taskId: r.data?.taskId });
};
