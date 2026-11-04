# PeerCodeAI: Time-Travel Debugger — Implementation Plan

> **Historical document (written 2026-10-30 at the start of the build).** The blockers below were resolved later: the Meta API wire format was verified against the docs and the live API, and Muse Spark was evaluated in 30 real trials. For the current status see [README.md](README.md), [docs/EVALUATION.md](docs/EVALUATION.md) and [TASKS.md](TASKS.md).

Deadline: 2026-11-04, 9:00 PM ET. Promise: *find the moment your code broke, understand why, fix it with proof.*

## 1. Audit findings (2026-10-30)

### What exists and was verified working
| Area | Evidence |
|---|---|
| Collaborative editor (React 19 + Monaco + Yjs `Y.Text` + `y-monaco`) | Playwright: two **separate browser contexts** in one room, both typed, both ended with identical text, status "Connected to 1 peer · direct", no page errors. |
| Transport: `y-webrtc` P2P + server WebSocket relay fallback + BroadcastChannel | Same test (direct WebRTC path). Relay has unit tests. |
| Presence, live cursors, synced chat, per-language files | Code inspection + existing UI. |
| Node `ws` server: signaling, relay, matchmaking, `/api/ai-hint` (Gemini), `/health` | `npm test`: 30/30 pass. |
| In-browser JS/TS runner (Web Worker, sucrase, 5 s timeout) | Code inspection. |
| `npm run lint` (tsc) and `npm run build` | Both pass. |

### Broken or incomplete
1. **`npm run dev` broke rooms on a cold Vite cache.** Monaco's `?worker` imports went through Vite's dep optimizer, which failed ("optimized info should be defined"), so `RoomView.tsx` 404'd and the room page crashed. **Fixed** in Phase 1: workers load through `new Worker(new URL(...))`, and the room's heavy deps are pre-bundled.
2. No revision history, regression detection, server-side test execution, Meta API, or patch verification.
3. Nothing is persisted. The relay stores nothing by design, so a room is lost when its last peer leaves.
4. The AI integration is Gemini-specific. It's kept for the Ctrl/Cmd+K hints; the debugger gets its own Meta client.

### Blockers
- **Meta docs and API are unreachable from the dev container.** `dev.meta.ai` and `api.meta.ai` both get a 403 from the network policy. The exact request format can't be checked here, so the Meta client keeps its wire format in one small, configurable module, marked unverified until someone runs the manual smoke test (`npm run smoke:meta`) where the host is reachable. No AI output is ever faked.
- **No Docker daemon.** Container-level isolation can't be built or tested here (see §4).

### Stack present
Vite 6, React 19, TypeScript 5.8 (frontend only), Tailwind 4, Motion, lucide-react, Monaco 0.57, Yjs 13, y-webrtc, y-monaco, y-protocols, sucrase. Server: Node ≥ 20, plain ESM JavaScript with JSDoc, `ws`, `node:test`. Deploy: Vercel frontend plus Railway/Render server.

## 2. MVP architecture (adapting, not replacing)

```
Browser (React)                                   Node server (existing http + ws, one port)
 ├─ RoomView (existing) ─ CodeEditor (Yjs live) ── ws: signaling / relay (unchanged)
 ├─ DebuggerPanel (new, right side)               ├─ /api/challenges          challenges.js (trusted tests)
 │   timeline · test results · regression ·       ├─ /api/rooms/:id/revisions revisions.js (JSON-file store)
 │   AI analysis · patch · verification           ├─ .../revisions/:rev/test  runner.js → child process
 ├─ TimeTravelView (read-only Monaco DiffEditor)  ├─ .../regression          regression.js (bisect + verify)
 └─ lib/debugger.ts (API client, hashing, apply)  ├─ .../analyze             meta.js + analysis.js (schema-validated)
                                                  └─ /api/verify              patches.js + runner.js
```

Key decisions:
- **Revisions are explicit checkpoints**, not CRDT updates. Each stores a full snapshot (lossless and trivially exact), `sequenceNumber` (server-assigned and strictly increasing, so ordering is deterministic), `contentHash` (SHA-256), author, label and `challengeId`. They're stored **on the server** so they survive refreshes and every collaborator sees the same timeline.
- **Time travel never touches the live `Y.Text`.** It opens a separate read-only diff editor with its own models.
- **Tests are trusted, data-driven fixtures** (`{name, fn, args, expected}`) owned by the challenge. Only the candidate source is untrusted.
- **Regression localization:** binary search for a pass→fail boundary (O(log n)), then a backward linear scan from the head to confirm. If they disagree, outcomes weren't monotonic, and the linear answer wins and is flagged. Results are cached by content hash, and the report counts test runs.
- **Patch format:** `edits: [{find, replace}]`. Each `find` must occur exactly once in the source revision. This format is deterministic, minimal and easy to validate, where unified diffs from LLMs often aren't.
- **Apply safety:** a verification is bound to the `contentHash` of the code it was verified against. Apply is allowed only if the live document still hashes the same. Otherwise the UI shows a conflict and offers re-verification against the live code.
- **The server stays plain JS + JSDoc + `node:test`** to match the existing code (no build step).

## 3. Smallest viable path (vertical slices)
1. Phase 1: fix the dev-mode crash and confirm two-browser sync. **Done.**
2. Phase 2: revision store + REST + timeline UI + read-only diff view.
3. Phase 3: challenge fixtures + constrained runner + regression service + UI.
4. Phase 4: Meta client + prompt + response schema validation + error handling.
5. Phase 5: patch apply/verify endpoint + conflict-safe apply in the client.
6. Phase 6: one-click demo scenario, README, architecture, measured results.

## 4. Execution safety (honest)
Candidate code runs in a **separate Node process**, never in the server process, with:
- the Node permission model (`--permission`): no filesystem writes, no child processes, no worker threads, and read access only to the harness file
- an empty environment (no API keys or other host secrets)
- `--max-old-space-size` and a capped output size
- a wall-clock timeout, then SIGKILL
- candidate code evaluated in a `vm` context without `require`, `process` or `fetch`

**This is not a sandbox.** Node 22's permission model doesn't block the network, and `vm` isn't a security boundary. That's why only the predefined challenges run, and why the README states the limitation. Real isolation (a container with `--network none`, memory/pid limits and a read-only rootfs, or a microVM) is future work.

## 5. First files modified
`vite.config.ts`, `src/lib/monaco.ts` (Phase 1 fix). Then new: `server/http.js`, `server/revisions.js`, `server/challenges.js`, `server/runner.js`, `server/runner-harness.cjs`, `server/regression.js`, `server/meta.js`, `server/analysis.js`, `server/patches.js`, `server/debugger.js`; edited `server/app.js`, `server/index.js`; frontend `src/lib/debugger.ts`, `src/components/DebuggerPanel.tsx`, `src/components/TimeTravelView.tsx`, `src/components/RoomView.tsx`.
