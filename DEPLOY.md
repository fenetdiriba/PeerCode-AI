# Deploying PeerCode AI

PeerCode has two parts that deploy separately:

| Part | What it is | Where | Config in repo |
| --- | --- | --- | --- |
| **Frontend** | Static Vite build (landing, editor, match page) | Vercel | `vercel.json` |
| **Server** | Node server: signaling, relay, matchmaking, debugger API and test runner | Railway (or Render) | `railway.json` / `render.yaml` |

The server has to be a long-running process with WebSocket support, which is why it doesn't go on Vercel. It introduces browsers so they can sync directly over WebRTC. When a network blocks that (common on mobile data), it relays the room's updates between the two browsers instead. It never stores them.

Deploy the **server first**, because the frontend needs its URL at build time.

## 1. Server on Railway

1. Go to [railway.com](https://railway.com), sign in with GitHub.
2. **New Project → Deploy from GitHub repo →** pick `PeerCode-AI`.
   Railway reads `railway.json`: start command `npm start`, health check `/health`, no build step.
3. Open the service → **Settings → Networking → Generate Domain**. You get something like
   `https://peercode-ai-production.up.railway.app`. Copy it.
4. Check it: open `https://<your-railway-domain>/health` in a browser. You should see
   `{"ok":true,"queue":0,"connections":0}`.

Leave `ALLOWED_ORIGINS` unset for now. You'll set it in step 3 once you know the Vercel URL.

<details>
<summary>Using Render instead</summary>

1. [render.com](https://render.com) → **New → Blueprint** → pick the repo. It reads `render.yaml`.
2. When asked for `ALLOWED_ORIGINS`, leave it blank for now.
3. Your URL looks like `https://peercode-server.onrender.com`.

On Render's free plan, the server sleeps after 15 minutes idle and takes ~30s to wake, so the first match or room after a quiet period is slow.
</details>

## 2. Frontend on Vercel

1. Go to [vercel.com](https://vercel.com), sign in with GitHub.
2. **Add New → Project →** import `PeerCode-AI`. Vercel detects Vite from `vercel.json`.
3. Before deploying, open **Environment Variables** and add:

   | Name | Value |
   | --- | --- |
   | `VITE_SERVER_URL` | your Railway URL from step 1, e.g. `https://peercode-ai-production.up.railway.app` |

   `https://` is fine; the app converts it to `wss://`.
4. **Deploy.** You get a URL like `https://peercode-ai.vercel.app`.

`VITE_*` variables are baked in at build time. If you change one, redeploy (**Deployments → ⋯ → Redeploy**).

## 3. Lock the server to your site

Back on Railway → your service → **Variables** → add:

| Name | Value |
| --- | --- |
| `ALLOWED_ORIGINS` | `https://peercode-ai.vercel.app,https://peercode-ai-*.vercel.app` |

Use your real Vercel domain. The `*` entry allows Vercel's preview deployments (one per PR). Railway redeploys automatically. Without this, any website could use your server.

## 4. Turn on AI hints (Gemini)

1. Get a free key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → **Create API key**. Treat it like a password: don't commit it or paste it anywhere public.
2. Railway → your service → **Variables** → add:

   | Name | Value |
   | --- | --- |
   | `GEMINI_API_KEY` | your key |

   Railway redeploys on its own. The key only lives on the server; the browser never sees it.
3. Check: `https://<your-railway-domain>/health` should now show `"ai":true`.

Optional: `GEMINI_MODEL` (one or more models, comma-separated, tried in order; by default the server tries `gemini-flash-latest`, then `gemini-2.5-flash`, then `gemini-2.0-flash`) and `AI_REQUESTS_PER_10_MIN` (per-IP limit, default 20).

If an AI request fails, the prompt bar says why (invalid key, quota used up, region not supported, and so on). The full Gemini error is in Railway → **Deployments → View logs**.

## 5. Smoke test

1. Open your Vercel URL → **Create a room** → copy the link → open it on your phone (on mobile data, not your Wi-Fi). Type on one, watch the other. The status bar should say **Connected to 1 peer · direct** or **· via server relay**. Both are fine.
2. Open `/#/match` in two different browsers with overlapping skills → **Find partner** in both → they land in the same room.
3. In a room, press **Ctrl/Cmd+K** (or **Ask AI**) → "write a function that reverses a string" → the code appears for both people.

## Troubleshooting

Click the status text in the bottom-left of a room to open the **Connection** panel. It shows whether the server is reachable and whether you're connected directly or through the relay.

| Symptom | Likely cause |
| --- | --- |
| Red dot, "Can't reach the server" | `VITE_SERVER_URL` missing or wrong on Vercel, or you didn't redeploy after setting it. Or `ALLOWED_ORIGINS` on Railway doesn't match the site's exact address. |
| "Can't reach the matchmaking server" | Same as above. |
| Yellow, "waiting for peers", while your partner is in the room | You're in different rooms (compare the room code at the top), or one side is on an old deploy. Hard-refresh both. |
| "AI hints aren't set up on this server yet" | `GEMINI_API_KEY` isn't set on Railway (or the redeploy hasn't finished). `/health` shows `"ai":false`. |
| "The AI request failed" | Usually an invalid key or quota. Railway → **Deployments → View logs** shows the Gemini error. |
| Green, "via server relay" | Working as intended: a direct connection wasn't possible on this network, so edits go through the server. Adding a TURN server (below) can make it direct. |

### TURN (optional)

The relay already keeps rooms working on strict networks. If you'd rather keep traffic browser-to-browser there too, add a TURN server. Free tiers exist (for example Metered or Cloudflare Calls TURN). Add it to Vercel as:

```
VITE_ICE_SERVERS=[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:YOUR_HOST:3478","username":"USER","credential":"PASS"}]
```

then redeploy.

## Limits worth knowing

- The matchmaking queue lives in the server's memory. That's fine for one instance. Scaling to several instances would need a shared store like Redis.
- Each IP can hold 20 WebSocket connections at once (`MAX_CONNECTIONS_PER_IP`).

## Time-travel debugger (secure setup)

The debugger runs tests on the server, so set it up in this order. Steps marked **(you)** need your Railway account or a credential. Nothing here should ever be committed or pasted in chat.

### What the server will and won't run
The public server runs in `EXECUTION_MODE=restricted` (the default). It only executes code whose hash is on a server-side allowlist: the built-in scenario checkpoints, plus patches it generated and verified itself. Visitors can type and checkpoint anything, but their code never runs, and the AI only ever sees server-owned code. The runner is a constrained child process (no file writes, subprocesses, workers, env vars or `eval`; checked at startup), but **outbound network from test processes is not blocked**. That's why restricted mode is the default and `EXECUTION_MODE=local` is refused on Railway and Render.

### 1. Variables **(you)**
Railway → your service → **Variables**:

| Name | Value | Why |
| --- | --- | --- |
| `MODEL_API_KEY` | your Meta Model API key | Muse Spark analysis. Server only; never a `VITE_` variable. |
| `ALLOWED_ORIGINS` | `https://<your-vercel-domain>` | Only your site may call the API. |
| `DEBUGGER_ACCESS_CODE` | a long random string | Recommended for a public demo: writes, test runs and AI calls need it. Give it to judges in the submission, not in the repo. |
| `AI_DAILY_LIMIT` | e.g. `150` | Caps model calls per day across everyone (default 200). |

**Do not** set `EXECUTION_MODE` (the server refuses `local` on a host) or `META_AUTH` (`injected` is for the Claude Code dev proxy only, and is refused on a host).

### 2. Persistent checkpoints **(you)**
Railway → your service → **Settings → Volumes → Add volume**, mount path `/data`. Railway then sets `RAILWAY_VOLUME_MOUNT_PATH`, and checkpoints go to `/data/revisions` automatically (`REVISIONS_DIR` overrides this). Without a volume the server logs `WARNING: no Railway volume attached` and checkpoints vanish on every redeploy. Keep **one replica**: analyses and rate limits live in memory.

### 3. Node version
`package.json` pins Node `22.x` (`.nvmrc` too). The runner's permission model needs Node ≥ 22.13. If the host picks another version and the startup self-check fails, test execution is disabled (`/health` shows `executionAvailable: false`) rather than running unconstrained.

### 4. Check `/health`
`https://<railway-domain>/health` → `debugger` should show:
```json
{ "executionMode": "restricted", "executionAvailable": true, "isolation": { "ok": true, ... },
  "networkRestricted": false, "persistence": "volume (/data/revisions)", "ai": true, "accessCodeRequired": true }
```

### 5. Redeploy the frontend **(you)**
Vercel → **Deployments → Redeploy**, so the site picks up the debugger UI (`VITE_SERVER_URL` is unchanged).

### 6. End-to-end check against the deployment
Security checks run first. If any fail, the script stops before spending API credits.
```bash
SERVER_URL=https://<railway-domain> FRONTEND_ORIGIN=https://<vercel-domain> PEERCODE_ACCESS_CODE=<code> node e2e/deployed-api.mjs --expect-volume
```
```bash
BASE_URL=https://<vercel-domain> PEERCODE_ACCESS_CODE=<code> node e2e/browser-flow-cart.cjs
```
```bash
BASE_URL=https://<vercel-domain> PEERCODE_ACCESS_CODE=<code> node e2e/browser-flow-search.cjs
```
```bash
BASE_URL=https://<vercel-domain> PEERCODE_ACCESS_CODE=<code> node e2e/browser-security.cjs
```
Then redeploy the server once and confirm an earlier room's timeline is still there (volume check).

### Costs and limits
Each analysis is about 2–3.5k tokens (see [docs/EVALUATION.md](docs/EVALUATION.md)). Test runs are child Node processes (64 MB heap, 8 s limit, 2 at a time). Per-IP limits: 60 test runs/min, 20 AI calls/10 min.
