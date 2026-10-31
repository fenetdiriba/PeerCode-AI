# Deploying PeerCode AI

PeerCode has two parts that deploy separately:

| Part | What it is | Where | Config in repo |
| --- | --- | --- | --- |
| **Frontend** | Static Vite build (landing, editor, match page) | Vercel | `vercel.json` |
| **Server** | Node server: signaling, relay, matchmaking, debugger API and test runner | Render Free (or Railway) | `render.yaml` / `railway.json` |

The server has to be a long-running process with WebSocket support, which is why it doesn't go on Vercel. It introduces browsers so they can sync directly over WebRTC. When a network blocks that (common on mobile data), it relays the room's updates between the two browsers instead. It never stores them.

Deploy the **server first**, because the frontend needs its URL at build time.

## 1. Server on Render Free ($0)

Render's free web service runs the server with **512 MB RAM, 0.1 CPU and no persistent disk**, and spins down after about 15 minutes without traffic.

> **Storage is temporary.** On Render Free, checkpoints live in the instance's temp directory (`/tmp/peercode/revisions`). They work for as long as the instance runs, and are **erased by every restart, redeploy or spin-down**. Nothing else is lost: code and chat live in the browsers (Yjs), and each challenge's **Load demo scenario** rebuilds its history in one click. The timeline says this, and `/health` shows `"persistence": "ephemeral disk (...)"`.

### Option A: Blueprint (uses `render.yaml`)
1. [dashboard.render.com](https://dashboard.render.com) → **New → Blueprint** → connect GitHub → pick `PeerCode-AI` and the branch you deploy.
2. Render reads `render.yaml`:
   - free plan;
   - build `npm ci`, start `npm run start`, health check `/health`;
   - `NODE_VERSION=22`, `TEST_CONCURRENCY=1`, `AI_DAILY_LIMIT=150`;
   - a generated `DEBUGGER_ACCESS_CODE`.
3. It asks for the two secret variables **(you)**:
   - `MODEL_API_KEY`: your Meta Model API key.
   - `ALLOWED_ORIGINS`: your frontend address, e.g. `https://peer-code-ai.vercel.app`. If you don't know it yet, use a placeholder and fix it after step 2 below.
4. **Apply.** The service URL looks like `https://peercode-server.onrender.com`.

### Option B: Manual web service (same settings)
**New → Web Service** → pick the repo, then:

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Branch | the branch you deploy |
| Build Command | `npm ci` |
| Start Command | `npm run start` |
| Instance Type | **Free** |
| Health Check Path (Advanced) | `/health` |

Environment variables:

| Name | Value | Notes |
| --- | --- | --- |
| `NODE_VERSION` | `22` | The runner's permission model needs Node ≥ 22.13 (also pinned in `package.json`). |
| `MODEL_API_KEY` | your Meta key | Server only. Never a `VITE_` variable, never committed. |
| `ALLOWED_ORIGINS` | `https://<your-frontend-domain>` | Only your site may call the API. |
| `DEBUGGER_ACCESS_CODE` | a long random string | Writes, test runs and AI calls need it. Give it to judges in the submission. |
| `TEST_CONCURRENCY` | `1` | One test process at a time on 0.1 CPU. |
| `AI_DAILY_LIMIT` | `150` | Caps model calls per day across all users. |

**Do not set** `PORT` (Render sets it; the server binds `0.0.0.0:$PORT`), `EXECUTION_MODE`, or `META_AUTH`. The server refuses to start with `EXECUTION_MODE=local` or `META_AUTH=injected` on Render, because those are for local development only. Leave `REVISIONS_DIR` unset to use the temp directory.

### Why the build command is `npm ci` and not `npm ci && npm run build`
`npm run build` builds the **frontend** (Vite + Monaco), which is hosted on Vercel. The server runs from source and doesn't need it. Measured in a clean clone:

| Step | Peak memory |
| --- | --- |
| `npm ci` | about 530 MB (npm itself) |
| `npm run build` | **about 2.5 GB** |

Running the frontend build on the free service would at best waste build minutes, and could fail for lack of memory. Both commands work; only `npm ci` belongs on this service.

### Check it
Open `https://<render-domain>/health`. The `debugger` object should show:
```json
{ "executionMode": "restricted", "executionAvailable": true, "isolation": { "ok": true, ... },
  "networkRestricted": false, "persistence": "ephemeral disk (/tmp/peercode/revisions)",
  "ai": true, "accessCodeRequired": true }
```

### Measured resource use (Render-like settings, clean clone, `TEST_CONCURRENCY=1`)
| | |
| --- | --- |
| Server idle | about 70–145 MB RSS |
| Peak during the full e2e (security checks + real Muse Spark on both challenges) | about 125–205 MB RSS, against the 512 MB limit |
| One test process | about 42 MB RSS, ≤ 0.1 s CPU (64 MB heap cap, 8 s wall limit) |

At 0.1 CPU a test run should take roughly 10× its CPU time (under a second), well inside the limits. Startup self-check timeout is 20 s. I couldn't measure on Render itself; if `/health` ever shows test timeouts, raise `TEST_TIMEOUT_MS` (e.g. `15000`).

### Free-tier behaviour to plan the demo around
- **Cold start:** after about 15 idle minutes, the first request wakes the service. That takes roughly 30–60 s, and checkpoints from before are gone. Open `/health` a minute before demoing, then click **Load demo scenario**.
- **WebSockets** (signaling and relay) work on the free plan. They reconnect automatically after a restart.

<details>
<summary>Railway instead (paid after the trial; keeps checkpoints)</summary>

Railway reads `railway.json`. Set the same variables (not `TEST_CONCURRENCY` if you have more CPU), and attach a volume at `/data` (**Settings → Volumes**). Railway then sets `RAILWAY_VOLUME_MOUNT_PATH` and checkpoints persist in `/data/revisions`.
</details>

## 2. Frontend on Vercel

1. Go to [vercel.com](https://vercel.com), sign in with GitHub.
2. **Add New → Project →** import `PeerCode-AI`. Vercel detects Vite from `vercel.json`.
3. Before deploying, open **Environment Variables** and add (or, if the project exists, update it and redeploy):

   | Name | Value |
   | --- | --- |
   | `VITE_SERVER_URL` | your server URL from step 1, e.g. `https://peercode-server.onrender.com` |

   `https://` is fine; the app converts it to `wss://`.
4. **Deploy.** You get a URL like `https://peercode-ai.vercel.app`.

`VITE_*` variables are baked in at build time. If you change one, redeploy (**Deployments → ⋯ → Redeploy**).

## 3. Lock the server to your site

Back on Render → your service → **Environment** → set:

| Name | Value |
| --- | --- |
| `ALLOWED_ORIGINS` | `https://peercode-ai.vercel.app,https://peercode-ai-*.vercel.app` |

Use your real Vercel domain. The `*` entry allows Vercel's preview deployments (one per PR). Saving restarts the service, which clears checkpoints on Render Free. Without this, any website could use your server.

## 4. Turn on AI hints (Gemini)

1. Get a free key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → **Create API key**. Treat it like a password: don't commit it or paste it anywhere public.
2. Render → your service → **Environment** → add:

   | Name | Value |
   | --- | --- |
   | `GEMINI_API_KEY` | your key |

   Saving restarts the service. The key only lives on the server; the browser never sees it.
3. Check: `https://<your-render-domain>/health` should now show `"ai":true`.

Optional: `GEMINI_MODEL` (one or more models, comma-separated, tried in order; by default the server tries `gemini-flash-latest`, then `gemini-2.5-flash`, then `gemini-2.0-flash`) and `AI_REQUESTS_PER_10_MIN` (per-IP limit, default 20).

If an AI request fails, the prompt bar says why (invalid key, quota used up, region not supported, and so on). The full Gemini error is in Render → your service → **Logs**.

## 5. Smoke test

1. Open your Vercel URL → **Create a room** → copy the link → open it on your phone (on mobile data, not your Wi-Fi). Type on one, watch the other. The status bar should say **Connected to 1 peer · direct** or **· via server relay**. Both are fine.
2. Open `/#/match` in two different browsers with overlapping skills → **Find partner** in both → they land in the same room.
3. In a room, press **Ctrl/Cmd+K** (or **Ask AI**) → "write a function that reverses a string" → the code appears for both people.

## Troubleshooting

Click the status text in the bottom-left of a room to open the **Connection** panel. It shows whether the server is reachable and whether you're connected directly or through the relay.

| Symptom | Likely cause |
| --- | --- |
| Red dot, "Can't reach the server" | `VITE_SERVER_URL` missing or wrong on Vercel, or you didn't redeploy after setting it. Or `ALLOWED_ORIGINS` on the server doesn't match the site's exact address. On Render Free the first request after idling can take about a minute (cold start). |
| "Can't reach the matchmaking server" | Same as above. |
| Yellow, "waiting for peers", while your partner is in the room | You're in different rooms (compare the room code at the top), or one side is on an old deploy. Hard-refresh both. |
| "AI hints aren't set up on this server yet" | `GEMINI_API_KEY` isn't set on the server (or the restart hasn't finished). `/health` shows `"ai":false`. |
| "The AI request failed" | Usually an invalid key or quota. Render → **Logs** shows the Gemini error. |
| Timeline empty / "That checkpoint no longer exists" | The free server restarted or spun down and its temporary checkpoints are gone. Click **Load demo scenario** for the challenge you want. |
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

## Time-travel debugger: security and verification

### What the server will and won't run
The public server runs in `EXECUTION_MODE=restricted` (the default):
- It only executes code whose hash is on a server-side allowlist: the built-in scenario checkpoints, plus patches it generated and verified itself.
- Visitors can type and checkpoint anything, but their code never runs, and the AI only ever sees server-owned code.
- The runner is a constrained child process: no file writes, subprocesses, workers, env vars or `eval`, all checked at startup.

**Outbound network from test processes is not blocked.** That's why restricted mode is the default and `EXECUTION_MODE=local` is refused on Render and Railway. On Render Free this is unchanged: the allowlist lives in memory and is rebuilt at every start.

### End-to-end check against the deployment
Security checks run first; if any fail, the script stops before spending API credits.
```bash
SERVER_URL=https://<render-domain> FRONTEND_ORIGIN=https://<vercel-domain> PEERCODE_ACCESS_CODE=<code> node e2e/deployed-api.mjs
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
Run these after a cold start has finished (open `/health` first). On a host with a volume, add `--expect-volume` to the first command.

### Costs and limits
Each analysis uses about 2–3.5k tokens (see [docs/EVALUATION.md](docs/EVALUATION.md)). Test runs are child Node processes: 64 MB heap, 8 s limit, `TEST_CONCURRENCY` at a time. Per-IP limits: 60 test runs/min and 20 AI calls/10 min, plus `AI_DAILY_LIMIT` overall.
