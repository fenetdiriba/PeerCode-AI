# Deploying PeerCode AI

PeerCode has two parts that deploy separately:

| Part | What it is | Where | Config in repo |
| --- | --- | --- | --- |
| **Frontend** | Static Vite build (landing, editor, match page) | Vercel | `vercel.json` |
| **Server** | Node WebSocket server: signaling + matchmaking | Railway (or Render) | `railway.json` / `render.yaml` |

The server has to be a long-running process with WebSocket support, which is why it doesn't go on Vercel. It never sees any code: once two browsers are introduced, they sync directly over WebRTC.

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

## 4. Smoke test

1. Open your Vercel URL → **Create a room** → copy the link → open it on your phone (on mobile data, not your Wi-Fi). Type on one, watch the other. The status bar should say **Connected to 1 peer**.
2. Open `/#/match` in two different browsers with overlapping skills → **Find partner** in both → they land in the same room.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Status bar stays red ("Offline") | `VITE_SERVER_URL` missing or wrong, or you didn't redeploy after setting it. Open DevTools → Console for WebSocket errors. |
| "Can't reach the matchmaking server" | Same as above, or `ALLOWED_ORIGINS` doesn't include the exact URL you're on (check for a typo or a missing preview pattern). |
| Yellow status forever, partner is in the room too | Both reached the server but WebRTC couldn't connect directly. Usually a strict campus or corporate network. Add a TURN server (below). |
| Works on your Wi-Fi, fails on phone data | Same as above: needs TURN. |

### TURN (only if you hit the NAT problem)

By default, browsers use public STUN servers to find a direct path, which works on most home and mobile networks. Strict networks block direct connections and need a TURN relay. Free tiers exist (for example Metered or Cloudflare Calls TURN). Add it to Vercel as:

```
VITE_ICE_SERVERS=[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:YOUR_HOST:3478","username":"USER","credential":"PASS"}]
```

then redeploy.

## Limits worth knowing

- The matchmaking queue lives in the server's memory. That's fine for one instance. Scaling to several instances would need a shared store like Redis.
- Each IP can hold 20 WebSocket connections at once (`MAX_CONNECTIONS_PER_IP`).
