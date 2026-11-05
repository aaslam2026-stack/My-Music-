// My Music — front end. Talks only to our own Netlify Functions (/api/*);
// the sunoapi.org key never reaches the browser.

const $ = (id) => document.getElementById(id);
const STORE_KEY = "mymusic.jobs.v1";
const POLL_MS = 5000;
const MAX_POLL_MS = 10 * 60 * 1000;
const DONE = new Set(["SUCCESS"]);
const FAILED = new Set(["CREATE_TASK_FAILED", "GENERATE_AUDIO_FAILED", "CALLBACK_EXCEPTION", "SENSITIVE_WORD_ERROR", "GENERATE_LYRICS_FAILED"]);
const STATUS_LABEL = {
  PENDING: "Queued",
  TEXT_SUCCESS: "Writing lyrics…",
  FIRST_SUCCESS: "First track ready",
  SUCCESS: "Done",
  CREATE_TASK_FAILED: "Failed",
  GENERATE_AUDIO_FAILED: "Failed",
  CALLBACK_EXCEPTION: "Failed",
  SENSITIVE_WORD_ERROR: "Blocked content",
  TIMEOUT: "Timed out",
};
const STYLES = ["Pop", "Hip-hop", "Lo-fi chill", "EDM", "Rock", "R&B soul", "Jazz", "Acoustic folk", "Cinematic orchestral", "Afrobeats", "Country", "Synthwave"];
const VARIETY = ["Off", "Normal", "High", "Extra", "Max"];

let mode = "simple";
let jobs = load();

// ---------- storage ----------
function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(jobs.slice(0, 50))); } catch { /* ignore */ }
}

// ---------- api ----------
async function api(path, options = {}) {
  const res = await fetch(`/api/${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  let data = {};
  try { data = await res.json(); } catch { /* ignore */ }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

async function refreshCredits() {
  const el = $("credits").querySelector("strong");
  try {
    const { credits } = await api("credits");
    el.textContent = Number(credits).toLocaleString();
  } catch {
    el.textContent = "—";
  }
}

// ---------- UI wiring ----------
function setMode(next) {
  mode = next;
  document.querySelectorAll(".tab").forEach((t) => {
    const on = t.dataset.mode === next;
    t.classList.toggle("active", on);
    t.setAttribute("aria-selected", String(on));
  });
  document.querySelectorAll(".simple-only").forEach((el) => (el.hidden = next !== "simple"));
  document.querySelectorAll(".custom-only").forEach((el) => (el.hidden = next !== "custom"));
  syncInstrumental();
}

function syncInstrumental() {
  const instr = $("instrumental").checked;
  if (mode === "custom") {
    $("lyrics").disabled = instr;
    $("aiLyricsBtn").disabled = instr;
    $("vocalGender").disabled = instr;
  }
}

function showError(msg) {
  const el = $("error");
  el.textContent = msg || "";
  el.hidden = !msg;
}

function counter(inputId, outId) {
  const update = () => ($(outId).textContent = $(inputId).value.length);
  $(inputId).addEventListener("input", update);
  update();
}

function initChips() {
  const wrap = $("styleChips");
  STYLES.forEach((s) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = s;
    b.addEventListener("click", () => {
      const cur = $("style").value.trim();
      $("style").value = cur ? `${cur}, ${s.toLowerCase()}` : s.toLowerCase();
      $("style").focus();
    });
    wrap.appendChild(b);
  });
}

function initRanges() {
  const bind = (id, out, fmt) => {
    const f = () => ($(out).textContent = fmt($(id).value));
    $(id).addEventListener("input", f);
    f();
  };
  bind("styleWeight", "styleWeightOut", (v) => Number(v).toFixed(2));
  bind("weirdness", "weirdnessOut", (v) => Number(v).toFixed(2));
  bind("variety", "varietyOut", (v) => VARIETY[v]);
}

function buildPayload() {
  const payload = {
    customMode: mode === "custom",
    instrumental: $("instrumental").checked,
    model: $("model").value,
    style: $("style").value.trim(),
  };
  if (mode === "simple") {
    payload.prompt = $("prompt").value.trim();
    if (!payload.prompt) throw new Error("Please describe the song you want.");
    if (!payload.style) throw new Error("Please pick or type a style (tap a chip below the Style box).");
  } else {
    payload.title = $("title").value.trim();
    if (!payload.instrumental) payload.lyrics = $("lyrics").value.trim();
    payload.negativeTags = $("negativeTags").value.trim();
    payload.vocalGender = $("vocalGender").value;
    if ($("duration").value) payload.duration = Number($("duration").value);
    payload.styleWeight = Number($("styleWeight").value);
    payload.weirdnessConstraint = Number($("weirdness").value);
    payload.variety = Number($("variety").value);
    if (!payload.style && !payload.lyrics && !payload.negativeTags) {
      throw new Error("Add a style or some lyrics to get started.");
    }
  }
  return payload;
}

async function onSubmit(e) {
  e.preventDefault();
  showError("");
  let payload;
  try { payload = buildPayload(); } catch (err) { return showError(err.message); }

  const btn = $("submitBtn");
  btn.disabled = true;
  btn.querySelector(".btn-label").textContent = "Starting…";
  try {
    const { taskId } = await api("generate", { method: "POST", body: JSON.stringify(payload) });
    if (!taskId) throw new Error("No task ID returned.");
    const job = {
      taskId,
      createdAt: Date.now(),
      summary: payload.prompt || payload.title || payload.style || "Untitled",
      style: payload.style,
      status: "PENDING",
      tracks: [],
    };
    jobs.unshift(job);
    save();
    render();
    poll(job);
  } catch (err) {
    showError(err.message);
  } finally {
    btn.disabled = false;
    btn.querySelector(".btn-label").textContent = "Generate music";
  }
}

// ---------- polling ----------
const polling = new Set();
async function poll(job) {
  if (polling.has(job.taskId)) return;
  polling.add(job.taskId);
  try {
    while (!DONE.has(job.status) && !FAILED.has(job.status) && job.status !== "TIMEOUT") {
      if (Date.now() - job.createdAt > MAX_POLL_MS) {
        job.status = "TIMEOUT";
        job.error = "This is taking longer than expected. Refresh later to check again.";
        break;
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
      try {
        const s = await api(`status?taskId=${encodeURIComponent(job.taskId)}`);
        job.status = s.status;
        if (s.tracks?.length) job.tracks = s.tracks;
        if (s.errorMessage) job.error = s.errorMessage;
      } catch (err) {
        job.lastError = err.message; // transient; keep polling
      }
      save();
      renderJob(job);
    }
  } finally {
    polling.delete(job.taskId);
    save();
    renderJob(job);
    if (DONE.has(job.status)) refreshCredits();
  }
}

// ---------- rendering ----------
const safeUrl = (u) => (typeof u === "string" && /^https?:\/\//i.test(u) ? u : "");

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v);
  }
  children.flat().forEach((c) => c && n.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
  return n;
}

function fmtTime(sec) {
  if (!sec) return "";
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function trackCard(t) {
  const src = safeUrl(t.audioUrl) || safeUrl(t.streamUrl);
  const download = safeUrl(t.audioUrl);
  const cover = safeUrl(t.imageUrl);
  const lyricsBox = el("div", { class: "track-lyrics", hidden: true, text: t.lyrics || "" });

  const actions = el("div", { class: "track-actions" });
  if (download) actions.appendChild(el("a", { href: download, target: "_blank", rel: "noopener", download: "", text: "Download MP3" }));
  else actions.appendChild(el("span", { class: "hint", text: "Streaming preview — MP3 coming…" }));
  if (t.lyrics) {
    const b = el("button", { type: "button", text: "Lyrics" });
    b.addEventListener("click", () => (lyricsBox.hidden = !lyricsBox.hidden));
    actions.appendChild(b);
  }

  return el("div", { class: "track" },
    cover ? el("img", { class: "cover", src: cover, alt: "", loading: "lazy" }) : el("div", { class: "cover" }),
    el("div", { class: "track-body" },
      el("div", { class: "track-title", title: t.title || "", text: `${t.title || "Untitled"}${t.duration ? ` · ${fmtTime(t.duration)}` : ""}` }),
      el("div", { class: "track-tags", title: t.tags || "", text: t.tags || "" }),
      src ? el("audio", { controls: true, preload: "none", src }) : el("div", { class: "hint", text: "Rendering audio…" }),
      actions,
      lyricsBox,
    ),
  );
}

function jobNode(job) {
  const working = !DONE.has(job.status) && !FAILED.has(job.status) && job.status !== "TIMEOUT";
  const badgeClass = DONE.has(job.status) ? "done" : working ? "working" : "failed";
  const node = el("div", { class: "job", "data-task": job.taskId },
    el("div", { class: "job-head" },
      el("div", { class: "job-prompt", text: job.summary }),
      el("span", { class: `badge ${badgeClass}`, text: STATUS_LABEL[job.status] || job.status }),
    ),
  );
  if (working) node.appendChild(el("div", { class: "progress" }));
  if (!working && !DONE.has(job.status) && job.error) node.appendChild(el("div", { class: "job-error", text: job.error }));
  if (job.tracks?.length) node.appendChild(el("div", { class: "tracks" }, job.tracks.map(trackCard)));
  return node;
}

function renderJob(job) {
  const existing = document.querySelector(`.job[data-task="${CSS.escape(job.taskId)}"]`);
  if (!existing) return render();
  // Keep audio that is currently playing untouched.
  const playing = [...existing.querySelectorAll("audio")].some((a) => !a.paused);
  if (playing && job.status !== "SUCCESS") return;
  existing.replaceWith(jobNode(job));
}

function render() {
  const wrap = $("jobs");
  wrap.replaceChildren(...jobs.map(jobNode));
  $("empty").hidden = jobs.length > 0;
  $("clearBtn").hidden = jobs.length === 0;
}

// ---------- AI lyrics ----------
async function generateLyrics() {
  const idea = $("lyricsIdea").value.trim();
  const errEl = $("lyricsError");
  const out = $("lyricsOptions");
  const go = $("lyricsGo");
  errEl.hidden = true;
  if (!idea) { errEl.textContent = "Tell me what the song is about."; errEl.hidden = false; return; }

  go.disabled = true;
  go.textContent = "Writing…";
  out.replaceChildren(el("div", { class: "progress" }));
  try {
    const { taskId } = await api("lyrics", { method: "POST", body: JSON.stringify({ prompt: idea }) });
    const started = Date.now();
    let res;
    do {
      await new Promise((r) => setTimeout(r, 3000));
      res = await api(`lyrics?taskId=${encodeURIComponent(taskId)}`);
      if (FAILED.has(res.status)) throw new Error(res.errorMessage || "Lyrics generation failed.");
      if (Date.now() - started > 3 * 60 * 1000) throw new Error("Lyrics are taking too long. Try again.");
    } while (res.status !== "SUCCESS");

    out.replaceChildren(...res.options.map((o) => {
      const use = el("button", { type: "button", class: "primary small", text: "Use these lyrics" });
      use.addEventListener("click", () => {
        $("lyrics").value = o.text;
        $("lyrics").dispatchEvent(new Event("input"));
        if (!$("title").value && o.title) $("title").value = o.title;
        $("lyricsDialog").close();
      });
      return el("div", { class: "lyrics-option" }, el("strong", { text: o.title || "Lyrics" }), el("pre", { text: o.text }), use);
    }));
    refreshCredits();
  } catch (err) {
    out.replaceChildren();
    errEl.textContent = err.message;
    errEl.hidden = false;
  } finally {
    go.disabled = false;
    go.textContent = "Generate";
  }
}

// ---------- boot ----------
document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => setMode(t.dataset.mode)));
$("instrumental").addEventListener("change", syncInstrumental);
$("form").addEventListener("submit", onSubmit);
$("clearBtn").addEventListener("click", () => {
  if (!confirm("Remove all songs from this list? (Files stay on the provider for 14 days.)")) return;
  jobs = [];
  save();
  render();
});
$("aiLyricsBtn").addEventListener("click", () => {
  $("lyricsOptions").replaceChildren();
  $("lyricsError").hidden = true;
  $("lyricsDialog").showModal();
  $("lyricsIdea").focus();
});
$("lyricsGo").addEventListener("click", generateLyrics);
$("lyricsIdea").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); generateLyrics(); } });

counter("prompt", "promptCount");
counter("lyrics", "lyricsCount");
initChips();
initRanges();
setMode("simple");
render();
refreshCredits();
// Resume any unfinished jobs from a previous visit.
jobs.filter((j) => !DONE.has(j.status) && !FAILED.has(j.status)).forEach((j) => {
  if (j.status === "TIMEOUT") { j.status = "PENDING"; j.createdAt = Date.now(); }
  poll(j);
});
