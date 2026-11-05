// Shared helpers for talking to sunoapi.org from Netlify Functions.
// The API key lives only in the SUNO_API_KEY environment variable (server side).

export const SUNO_BASE = "https://api.sunoapi.org";

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

// Accept a few common spellings and strip stray spaces/quotes pasted into Netlify.
const KEY_NAMES = ["SUNO_API_KEY", "SUNOAPI_KEY", "SUNO_KEY", "SUNO_API_TOKEN", "API_KEY"];

export function apiKey() {
  for (const name of KEY_NAMES) {
    const v = (process.env[name] || "").trim().replace(/^["']|["']$/g, "").replace(/^Bearer\s+/i, "");
    if (v) return v;
  }
  return "";
}

// Friendly messages for the documented sunoapi.org status codes.
const CODE_MESSAGES = {
  400: "Invalid parameters.",
  401: "Unauthorized — check the SUNO_API_KEY environment variable.",
  404: "Invalid request method or path.",
  405: "Rate limit exceeded. Please wait a moment.",
  413: "Prompt, style or lyrics is too long.",
  429: "Insufficient credits on the sunoapi.org account.",
  430: "Too many requests. Please try again shortly.",
  455: "Suno API is under maintenance. Try again later.",
  500: "Suno API server error.",
};

// Primary host from docs.sunoapi.org, plus the alternate host listed in the OpenAPI spec.
const HOSTS = [SUNO_BASE, "https://apibox.erweima.ai"];

async function call(host, path, method, body, key) {
  const headers = { Authorization: `Bearer ${key}`, Accept: "application/json" };
  if (body) headers["Content-Type"] = "application/json";
  let res;
  try {
    res = await fetch(host + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    return { ok: false, status: 502, error: "Could not reach sunoapi.org." };
  }
  let payload;
  try {
    payload = await res.json();
  } catch {
    return { ok: false, status: 502, error: `Unexpected response from sunoapi.org (HTTP ${res.status}).` };
  }
  if (payload?.code !== 200) {
    const code = payload?.code ?? res.status;
    return { ok: false, status: code >= 400 && code < 600 ? code : 502, error: payload?.msg || CODE_MESSAGES[code] || "Request failed.", code };
  }
  return { ok: true, data: payload.data };
}

export async function suno(path, { method = "GET", body } = {}) {
  const key = apiKey();
  if (!key) {
    return { ok: false, status: 500, error: "Server is missing SUNO_API_KEY. Add it in Netlify → Site configuration → Environment variables." };
  }
  let r;
  for (const host of HOSTS) {
    r = await call(host, path, method, body, key);
    if (r.ok || r.code !== 401) return r;
  }
  // Both hosts rejected the key: say which key is loaded (last 4 chars only) to help diagnose.
  r.error = `sunoapi.org rejected the API key (ending in …${key.slice(-4)}, ${key.length} characters). ` +
    "Copy the key again from sunoapi.org → API Key page, update SUNO_API_KEY in Netlify, and redeploy.";
  return r;
}

export function callbackUrl(req) {
  // Netlify sets URL to the site's primary URL. Fall back to the request origin.
  const base = process.env.URL || new URL(req.url).origin;
  return `${base}/.netlify/functions/callback`;
}

export async function readJson(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const num01 = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? Math.round(n * 100) / 100 : undefined;
};
