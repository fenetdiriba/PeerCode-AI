# Deploying PeerCode AI

PeerCode has two parts that deploy separately:

| Part | What it is | Where | Config in repo |
| --- | --- | --- | --- |
| **Frontend** | Static Vite build (landing, editor, match page) | Vercel | `vercel.json` |
| **Server** | Node WebSocket server: signaling + matchmaking | Railway (or Render) | `railway.json` / `render.yaml` |

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
