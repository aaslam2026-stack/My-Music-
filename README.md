# My Music 🎵

An AI song studio powered by [sunoapi.org](https://docs.sunoapi.org/). Users describe a song (or write their own lyrics), choose a style, and get two full tracks they can play and download.

## Features
- **Simple mode** – describe the idea + pick a style; lyrics are written automatically.
- **Custom mode** – your own title, lyrics, style, vocal gender, length, "avoid" styles, style adherence, creativity and variety.
- **✨ AI lyrics** – generate lyrics from a short idea and drop them into the editor.
- **Live progress** – the app polls the task and plays the streaming preview as soon as it's ready, then the final MP3.
- **Library** – your songs are kept in the browser (localStorage), unfinished jobs resume on reload.
- **Credits badge** – shows your remaining sunoapi.org credits.
- Models: `V6` (default), `V6_WILD`, `V6_MINI`.

## Tech stack
- Static front end (plain HTML/CSS/JS) in `public/` – no build step.
- **Netlify Functions** in `netlify/functions/` act as a secure proxy to `https://api.sunoapi.org`, so the API key **never** reaches the browser.

| Route | Function | sunoapi.org endpoint |
|---|---|---|
| `POST /api/generate` | `generate.mjs` | `POST /api/v1/generate` |
| `GET /api/status?taskId=` | `status.mjs` | `GET /api/v1/generate/record-info` |
| `POST /api/lyrics`, `GET /api/lyrics?taskId=` | `lyrics.mjs` | `POST /api/v1/lyrics`, `GET /api/v1/lyrics/record-info` |
| `GET /api/credits` | `credits.mjs` | `GET /api/v1/generate/credit` |
| `/.netlify/functions/callback` | `callback.mjs` | required `callBackUrl` (acknowledged; app polls) |

## Deploy on Netlify
1. In Netlify: **Add new site → Import an existing project →** pick this GitHub repo, branch `main`.
2. Build settings are read from `netlify.toml` (publish `public`, functions `netlify/functions`). No build command needed.
3. **Site configuration → Environment variables →** add `SUNO_API_KEY` = your sunoapi.org key.
4. Deploy (or **Trigger deploy** if you added the key after the first deploy).

> 🔐 Never commit the API key. It belongs only in Netlify's environment variables (or a local `.env`, which is git-ignored).

## Run locally
```bash
npm i -g netlify-cli
cp .env.example .env   # then put your key in .env
netlify dev
```
