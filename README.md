# PeerCodeAI: Time-Travel Debugger

> **Find the moment your code broke. Understand why. Fix it with proof.**

PeerCodeAI is a real-time collaborative code editor that can debug regressions in the code two people write together. It records explicit checkpoints of the shared document, runs real tests against them to find the **first observed failing checkpoint**, shows the diff that introduced the failure, asks **Meta Muse Spark** for a root-cause explanation and a minimal patch, **verifies that patch by running the tests on an isolated copy**, and only then lets a person apply it to the shared document. If anyone edited the code in the meantime, apply is blocked until the patch is verified again.

Built for the Meta Global AI Developer Hackathon (Indie Track).

```
Edit together → Checkpoint → Locate regression → Explain (Muse Spark) → Verify (real tests) → Review & apply
```

## Status

| Capability | State |
|---|---|
| Two-browser real-time editing (Yjs CRDT over WebRTC + relay fallback) | Working. Verified with Playwright in two isolated browser contexts. |
| Persistent checkpoints, time travel, diffs | Working. Survives page refresh and server restart (JSON files). |
| Test execution + regression localization | Working. 64/64 correct on a generated benchmark ([docs/BENCHMARK.md](docs/BENCHMARK.md)). |
| Patch validation, isolated verification, conflict-safe apply | Working. Covered by unit, HTTP and browser tests. |
| **Meta Muse Spark call** | **Implemented but not yet verified against the real API.** The docs host and API host were blocked from the environment this was built in, so the request format in [`server/meta.js`](server/meta.js) follows the common chat-completions shape and is marked unverified. Run `npm run smoke:meta` with a real key to confirm (see below). The app never fakes AI output: without a key, the AI step says it's unavailable. |
| Live site ([peer-code-ai.vercel.app](https://peer-code-ai.vercel.app)) | Has the collaborative editor. The debugger needs a redeploy of both server and frontend. |

## Quick start

```bash
npm install
cp .env.example .env        # then set MODEL_API_KEY for Meta AI (optional)
npm run dev:all             # server on :4444, app on :3000
```

Open `http://localhost:3000`, click **Create a room**, then open the same URL in a second browser (or a private window).

### Demo (about 2 minutes)
1. In the room, the **Debugger** view is on by default on wide screens (toggle it in the top bar).
2. Click **Load demo scenario** (bottom left). This replays a two-developer history through the live editor and saves 5 real checkpoints: a working `calculateTotal`, a harmless helper, Developer B's "Simplify reducer" (which drops `* item.quantity`), and two more edits on top. The second browser sees the code and the timeline update.
3. Click any checkpoint to **time travel**: a read-only diff opens and the live document is untouched.
4. Click **Locate regression**. The server runs the 5 predefined tests on checkpoints, reports `#2` as last passing and `#3` as first observed failing, and opens the `#2 → #3` diff with the failing cases (`expected 12, got 4`).
5. Click **Analyze & generate fix**. Muse Spark returns: what failed, what changed, the probable root cause, the uncertainty, and a find/replace patch. The patch is validated, applied to an isolated copy, and the tests run again. You'll see **Candidate generated → Verification running → Tests passed / Tests failed / Verification error**.
6. To show conflict safety, type something in the *other* browser. Apply is blocked ("the live code changed after this patch was verified"). Click **Re-verify against live code**.
7. **Review patch**, then **Apply verified patch**. The edit goes through the shared Y.Doc for everyone and is saved as a new checkpoint. Run its tests from the timeline: 5/5.

### Checking the real Meta API
```bash
MODEL_API_KEY=... npm run smoke:meta
```
This runs the whole pipeline (locate → **real** Muse Spark call → validate → verify) without the UI and prints the model's answer and the verification result. If the request shape is wrong, the error says so (e.g. 400/404). Adjust `buildRequest` / `readText` in `server/meta.js`, or set `META_BASE_URL`, `META_MODEL`, or `META_JSON_MODE=off`.

## Architecture

```
 Browser A / Browser B (React + Monaco)                 Node server (one port)
 ┌────────────────────────────────────┐                ┌───────────────────────────────────────────┐
 │ CodeEditor ── y-monaco ── Y.Doc ───┼── WebRTC P2P ──┼─ signaling (ws)                           │
 │                              │     │── relay (ws) ──┼─ /relay/:room   forwards, never stores    │
 │ meta.timelineVersion (CRDT) ─┘     │                │                                           │
 │   └ tells every peer to refetch    │     HTTP       │ /api/rooms/:id/revisions  revisions.js    │
 │ TimelinePanel ─────────────────────┼───────────────►│   JSON file per room, atomic writes       │
 │ TimeTravelView (read-only diff)    │                │ /api/rooms/:id/regression regression.js   │
 │ DebuggerPanel ─────────────────────┼───────────────►│   bisect + backward verification          │
 │   applyDecision(live == verified?) │                │ /api/.../analyze  meta.js + analysis.js   │
 └────────────────────────────────────┘                │   schema-validated JSON, 1 retry          │
                                                       │ /api/verify       patches.js + runner.js  │
                                                       │   ┌───────────────────────────────────┐   │
                                                       │   │ child process: node --permission  │   │
                                                       │   │ empty env, heap cap, SIGKILL      │   │
                                                       │   │ vm context, data-driven tests     │   │
                                                       │   └───────────────────────────────────┘   │
                                                       └───────────────────────────────────────────┘
```

### Key design decisions and trade-offs
- **Checkpoints are snapshots, not CRDT updates.** Yjs updates are fine-grained and interleaved across peers, so they aren't meaningful units for debugging. A checkpoint stores the full source (lossless, exact to reconstruct, trivially diffable) with a **server-assigned sequence number** (deterministic order even when two people checkpoint at once), a SHA-256 hash, the author and a label. Snapshots cost storage (fine at ≤ 200 × 50 KB per room). Deltas would only matter at scale.
- **Checkpoints live on the server, invalidation goes through the CRDT.** The relay stores nothing by design, so history needs its own store. When anyone checkpoints, they bump a counter in the shared `Y.Map`, and every peer refetches. That reuses the existing sync channel without adding a pub/sub system.
- **Regression localization = bisect, then verify.** Bisection (`O(log n)`) assumes outcomes are monotonic. A backward linear scan from the head then confirms the boundary: it costs one run per checkpoint in the failing tail and is exact for "the failure that persists to the latest checkpoint". If they disagree, the linear answer wins and the report says outcomes weren't monotonic. Results are cached by content hash. Infrastructure errors abort the search; compile errors, runtime errors and timeouts count as failing but are labelled. **Full scan** tests every checkpoint for when flips matter. See [docs/BENCHMARK.md](docs/BENCHMARK.md) for where bisection does and doesn't save work.
- **No causal over-claiming.** The report names the first *observed* failing checkpoint and the diff. It never claims a failing test pinpoints a line.
- **Patches are exact find/replace edits**, not unified diffs (LLMs often get those wrong). Each `find` must occur exactly once in the target code and edits can't overlap. A patch either applies unambiguously or is rejected with a reason. Model output must be a JSON object with all fields. Invalid output is retried once with the validation error, then reported as an error.
- **Verification is bound to exact code.** The verified source is compared with the live document when you click Apply (not just when it renders). Any drift blocks apply until you re-verify. Nothing is ever applied automatically.
- **"Tests passed" means the predefined tests ran and passed on the patched copy.** The UI says so: it doesn't prove the patch is correct for every input.

## Execution safety (read this)
Candidate code **never runs in the server process**. Each test run is a fresh Node child process with:
- the Node permission model (`--permission`): no filesystem writes, no child processes, no worker threads, and reads limited to the harness file
- an **empty environment**, so `MODEL_API_KEY` and other secrets aren't visible
- `--max-old-space-size=64`, `--disallow-code-generation-from-strings`, capped output, and a wall-clock timeout followed by `SIGKILL`
- a fresh `vm` context with no `require`, `process` or `fetch`, plus a per-test timeout

**This is not a sandbox.** Node 22's permission model does **not** restrict network access, `vm` is not a security boundary, and the process shares the host kernel. That's why this MVP runs **only predefined challenges with server-owned tests**, and why it must not be offered as arbitrary code execution. Real isolation would be a container per run (`--network none`, memory/pid limits, read-only rootfs, seccomp) or a microVM (Firecracker/gVisor). That wasn't possible here (no container runtime in the build environment) and is the top item of future work.

## Configuration
Server (`.env` locally, or the host's variables):

| Variable | Purpose |
|---|---|
| `MODEL_API_KEY` | Meta Model API key. Enables Muse Spark analysis. Server-only; never put it in a `VITE_` variable. |
| `META_BASE_URL` / `META_MODEL` | Default `https://api.meta.ai/v1` / `muse-spark-1.3`. |
| `META_JSON_MODE` | `off` stops sending `response_format` if the API rejects it. |
| `REVISIONS_DIR` | Checkpoint storage, default `./data/revisions`. Use a persistent volume in production (Railway's disk is ephemeral). |
| `TEST_TIMEOUT_MS` | Wall-clock limit per test run, default 8000. |
| `ALLOWED_ORIGINS`, `MAX_CONNECTIONS_PER_IP`, `GEMINI_API_KEY`, … | Unchanged, see `server/index.js`. |

## Testing
```bash
npm test             # 73 tests (node:test): revisions, runner + parsing, regression (incl. non-monotonic),
                     # model validation, patches, Meta client errors, HTTP pipeline end to end
npm run lint         # TypeScript
npm run build
npm run benchmark    # localization accuracy / runs / latency on generated histories → docs/BENCHMARK.md
npm run smoke:meta   # manual: the real Meta API, end to end
```
The automated pipeline test (`server/debugger.test.js`) uses a **scripted model**. It's labelled as a mock and never stands in for the real demo.

## Limitations and future work
- The Meta request format is unverified (see Status). This is the first thing to confirm with a key.
- One language (TypeScript) and one challenge. Tests are data-driven calls of top-level functions with JSON-comparable results.
- Execution is constrained, not sandboxed (see above). Next: a container or microVM runner.
- Regression reports and AI analyses are per-viewer (not synced). Checkpoints and code are shared.
- Checkpoint storage is a JSON file per room. Fine for a demo, not for concurrent server instances.
- No auth: anyone with a room link can read and add to its timeline.

## Project layout
```
server/app.js              one port: signaling, relay, matchmaking, /api/* (CORS-checked), /health
server/debugger.js         debugger REST routes, rate limits, result cache
server/revisions.js        checkpoint store (snapshots, sequence numbers, SHA-256, atomic JSON writes)
server/challenges.js       predefined challenge, tests and demo history
server/runner.js           compile (sucrase) + spawn constrained test process, classify results
server/runner-harness.cjs  runs inside the child process: vm context, data-driven test cases
server/regression.js       bisect + backward verification, non-monotonic detection
server/meta.js             Meta Model API client (wire format isolated, typed errors)
server/analysis.js         debugging prompt + strict response validation
server/patches.js          find/replace patch validation and application
shared/diff.js             LCS line diff (prompt + UI stats)
shared/patch-safety.js     the apply rule: verified, passing, and live == verified source
src/hooks/useDebugger.ts   debugger state + actions; CRDT-based timeline invalidation
src/components/            TimelinePanel, TimeTravelView, DiffView, DebuggerPanel (+ existing editor UI)
scripts/                   smoke-meta.mjs (real API), benchmark.mjs (measured results)
```

## Collaboration features (existing)
- **Rooms by link**, no accounts. **Live cursors and presence** via Yjs awareness. **Synced chat** and per-language files in the same Y.Doc.
- **Peer-to-peer with a fallback**: `y-webrtc` data channels, plus a server relay for networks that block direct connections, plus BroadcastChannel between tabs.
- **Skill-based matchmaking** (cosine similarity over profile vectors) and **Gemini code hints** (Ctrl/Cmd+K).
- **In-browser JS/TS runner** (Web Worker, 5 s timeout) for quick experiments.

See [DEPLOY.md](DEPLOY.md) for deploying (Vercel + Railway).

## How collaboration works

```
 Browser A                          Browser B
 Monaco <-> y-monaco <-> Y.Doc  <== WebRTC data channel ==>  Y.Doc <-> y-monaco <-> Monaco
                          |  \                               /  |
                          |   \--- signaling (ws :4444) ----/   |   introduces peers
                          \------- relay (ws :4444/relay) ------/   fallback when direct is blocked
```

Yjs gives every inserted character a unique ID (client ID + logical clock), so when two peers type at once, both inserts are kept and ordered the same way everywhere. There's no last-write-wins. Awareness is a separate channel for temporary per-peer state (name, color, cursor) that is broadcast but never saved.

Both transports run at once. Yjs updates are idempotent, so receiving the same edit over WebRTC and the relay is harmless. Updates that arrived over WebRTC aren't echoed back out through the relay.

## How matchmaking works

Each profile becomes a 15-number vector: 7 one-hot language slots, 7 one-hot topic slots, and a level slot (beginner 0, intermediate 0.5, advanced 1). Two people's similarity is the cosine of the angle between their vectors, `a·b / (|a||b|)`. That's 1 for identical interests and 0 for nothing in common. Because it looks at direction, not length, ticking more boxes doesn't count against you.

The server keeps a queue in memory. Every second it scores every waiting pair, then pairs people greedily from the best score down. A pair has to clear a minimum score that starts at 0.75 and relaxes toward 0 over 30 seconds of waiting, so close matches come first and nobody waits forever. Matched users get a fresh room id, their partner's profile, the overlap, and a suggested editor language (the first shared language the editor supports).

The math lives in `shared/matching.js` and is used by both the server and the UI.

## How AI hints work

The browser sends the current file, your instruction, and the selection offsets to `POST /api/ai-hint` on the server, which calls Gemini with the key it keeps in `GEMINI_API_KEY`. With a selection, the prompt marks the selected region and asks for only its replacement. Without one, it asks for the whole updated file, and the client applies just the changed middle part (common prefix and suffix skipped) so the edit stays small in the shared document.

Your partner can keep typing while the AI works. A selected region is tracked as their edits shift it. For whole-file edits, if the file changed in the meantime, the stale result is dropped instead of overwriting their work. The endpoint is limited to allowed origins and rate-limited per IP.
