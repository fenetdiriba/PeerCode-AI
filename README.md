# PeerCodeAI: Time-Travel Debugger

> **Find the moment your code broke. Understand why. Fix it with proof.**

PeerCodeAI is a real-time collaborative code editor that debugs regressions in the code people write together:
1. It records checkpoints of the shared document.
2. It runs real tests over that history to find the **first observed failing checkpoint**, and shows the diff that introduced the failure.
3. **Meta Muse Spark** explains the root cause and proposes a minimal patch.
4. The patch is **verified by running the tests on an isolated copy**.
5. A person applies it, and only if nobody has edited the code since it was verified.

Built for the Meta Global AI Developer Hackathon (Indie Track). Submission kit: [docs/HACKATHON.md](docs/HACKATHON.md) · Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · Real-API evaluation: [docs/EVALUATION.md](docs/EVALUATION.md)

```
Edit together → Checkpoint → Locate regression → Explain (Muse Spark) → Verify (real tests) → Review & apply
```

## Why it's different
Most AI assistants explain the code you paste and hand back a suggestion. PeerCodeAI works differently:
- it **finds when** the bug appeared by running tests over recorded history;
- it gives the model the **exact diff and failing inputs**;
- it **proves** the fix against real tests before anyone can apply it;
- it **refuses to overwrite a collaborator** whose edits arrived after that proof.

## Status
| Capability | State |
|---|---|
| Real-time two-browser editing (Yjs CRDT over WebRTC + relay) | Working; verified with Playwright in isolated browser contexts. |
| Checkpoints, time travel, diffs | Working; survive page refreshes. On **Render Free** they're temporary (lost on restart, redeploy or spin-down) and **Load demo scenario** rebuilds either challenge. A host with a volume keeps them. |
| Regression localization | Working; 64/64 on generated histories ([BENCHMARK](docs/BENCHMARK.md)); 10/10 on the real-API evaluation. |
| Muse Spark analysis (`muse-spark-1.3`, strict `json_schema`) | Working with the real API: 10/10 valid on the first attempt, root cause named 10/10 ([EVALUATION](docs/EVALUATION.md)). |
| Isolated verification + conflict-safe apply | Working; unit, HTTP and two-browser tests against the real model. |
| Public-server safety | Restricted execution (visitor code never runs), startup isolation self-check, access code, origin allowlist, AI daily cap. Outbound network from the runner is **not** blocked; see [Execution safety](#execution-safety). |
| Deployment | Ready for **Render Free** ($0): `render.yaml`, tested from a clean clone with Render-like settings (security suite + real Muse Spark, ≤ 205 MB peak of 512 MB). **Not yet deployed**: needs your Render and Vercel setup ([DEPLOY.md](DEPLOY.md)). |

## Quick start
```bash
npm install
cp .env.example .env        # set MODEL_API_KEY; add EXECUTION_MODE=local to test your own edits locally
npm run dev:all             # server on :4444, app on :3000
```
Open `http://localhost:3000`, click **Create a room**, and open the same URL in a second browser.

### Demo: shopping cart (TypeScript)
1. The **Debugger** view is on by default on wide screens (toggle it in the top bar).
2. **Load demo scenario** replays a two-developer history through the live editor and saves 5 real checkpoints. #3, Developer B's "Simplify reducer", drops `* item.quantity`.
3. Click a checkpoint to **time travel**: a read-only diff opens and the live document is untouched.
4. **Locate regression**: #2 last passing, #3 first observed failing, with the failing cases (`expected 12, got 4`).
5. **Analyze & generate fix**: Muse Spark returns what failed, what changed, the root cause, its uncertainty and find/replace edits. They're verified automatically: **Candidate generated → Verification running → Tests passed / Tests failed / Verification error**.
6. Type in the *other* browser: **Apply** is blocked because the proof was about different code. Undo the edit (in local mode you can also **Re-verify against live code**).
7. **Apply verified patch**: the edit reaches everyone through the CRDT and becomes checkpoint #6 (5/5).

### Demo: stale-response race (JavaScript, async)
Pick **Typeahead search: stale responses** in the challenge list (it syncs to the room), then load its demo. A `createSearch(fetchResults)` store drops out-of-order responses with a request counter. At #3 an "extract `runSearch` helper" refactor moves `++latestRequest` into the helper. The diff looks harmless, but clearing the input no longer invalidates the request in flight: type "rea", clear the box, and the old response fills the empty search box. The 8 tests are deterministic scenarios: deferred promises resolved in a scripted order, microtasks flushed after each step, no timers.

### Checking the real Meta API
```bash
npm run smoke:meta -- --challenge=all     # locate → Muse Spark → verify → apply → re-test, both challenges
```
```bash
npm run eval:meta -- --runs=5             # repeated evaluation; writes docs/eval/*.json (costs about 26k tokens)
```
The key comes from `MODEL_API_KEY` (in `.env`, which is gitignored) and is never printed. On failure the script prints Meta's HTTP status, the sanitized error and what to fix:
- `401`/`403`: bad key.
- `404`: model or endpoint wrong.
- `400` about `response_format`: try `META_RESPONSE_FORMAT=json_object`.

Behind an HTTP proxy, run with `NODE_USE_ENV_PROXY=1`. In a Claude Code session whose network secret injects the key, add `META_AUTH=injected` (development only; refused on hosts).

## How it works
Full diagrams: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

- **Checkpoints are snapshots, not CRDT updates.** Each stores the full source, a server-assigned sequence number (deterministic order even when two people checkpoint at once), a SHA-256 hash, the author and a label. Checkpointing bumps a counter in the shared `Y.Map`, so every peer refetches the timeline.
- **Regression localization = bisect, then verify.** Bisection assumes outcomes are monotonic. A backward linear scan from the head then confirms the boundary exactly for "the failure that persists to the latest checkpoint". Disagreement is flagged as non-monotonic, and **Full scan** tests everything. Results are cached by content hash. Infrastructure errors abort the search; compile, runtime and timeout errors count as failing but are labelled. The report names the first *observed* failing checkpoint; it never claims a line-level cause.
- **Analysis:** the prompt contains the passing→failing diff, the **full suite with pass/fail status**, failing inputs, how the tests work (including the trusted driver for async scenarios), and the current code.
  - Output is constrained by Meta's strict `json_schema`.
  - The server then validates it: every edit's `find` must occur exactly once, edits can't overlap, and in restricted mode a token screen applies.
  - Invalid output gets one corrective retry.
- **Verification is bound to exact code.** `verify` takes a server-issued `analysisId`, applies the edits to a copy, and runs the real tests. **Apply** is allowed only if the live document still equals the verified source, re-checked on click. It writes a minimal edit into the shared `Y.Text` and checkpoints the result. Nothing is applied automatically.
- **"Tests passed" means the predefined tests ran and passed on the patched copy.** The UI says that this doesn't prove the patch correct for every input.

## Execution safety
Test runs never happen in the server process. Each one is a fresh Node 22 child process with:
- the permission model: no file writes, subprocesses or worker threads, and reads limited to the harness;
- an **empty environment**, so no API keys;
- code generation from strings disabled, a 64 MB heap, capped output, per-case and wall-clock timeouts, then `SIGKILL`.

At startup the server checks that these restrictions actually hold and **disables execution if they don't**.

**That is not a sandbox: outbound network from test processes is not blocked**, and `vm` isn't a security boundary. So the public server runs in **restricted mode** (the default):
- it executes only code whose hash is on an allowlist: the built-in scenario checkpoints, plus patches it generated and verified itself;
- visitors can type and checkpoint anything, but their code never runs;
- the model only sees server-owned code, so prompt injection is impossible;
- model edits are screened for escape-style tokens as defense in depth;
- an optional access code, origin allowlist, per-IP limits and a daily AI cap protect the server and API credits.

`EXECUTION_MODE=local` runs anything, for your own machine only, and the server refuses it on Railway or Render. Real isolation (a container with no network, or a microVM) is the main future-work item.

## Configuration
| Variable | Purpose |
|---|---|
| `MODEL_API_KEY` | Meta Model API key (server only; never a `VITE_` variable). |
| `META_BASE_URL` / `META_MODEL` | Default `https://api.meta.ai/v1` / `muse-spark-1.3`. |
| `META_RESPONSE_FORMAT` | `json_schema` (default), `json_object`, or `none`. |
| `EXECUTION_MODE` | `restricted` (default) or `local` (dev machines only). |
| `DEBUGGER_ACCESS_CODE` | Optional code required for writes, test runs and AI calls. |
| `AI_DAILY_LIMIT` | Model calls per UTC day across all users (default 200). |
| `REVISIONS_DIR` | Checkpoint storage. Defaults: `$RAILWAY_VOLUME_MOUNT_PATH/revisions` with a Railway volume; the OS temp dir on a host without one (Render Free: temporary); `./data/revisions` locally. |
| `TEST_CONCURRENCY` | Test processes at once (default 2; `1` on Render Free). |
| `HOST` / `PORT` | Bind address and port (defaults `0.0.0.0` / `4444`; Render sets `PORT`). |
| `TEST_TIMEOUT_MS` | Wall-clock limit per test run (default 8000). |
| `ALLOWED_ORIGINS`, `MAX_CONNECTIONS_PER_IP`, `GEMINI_API_KEY`, … | See `server/index.js`. |

## Testing
```bash
npm test             # 91 tests (node:test): revisions, runner (incl. async + isolation), regression,
                     # schema/validation, patches, Meta client errors, security policy, HTTP pipeline
npm run lint && npm run build
npm run benchmark    # localization on generated histories → docs/BENCHMARK.md
npm run smoke:meta   # real Meta API, end to end
node e2e/deployed-api.mjs   # against a running server: security checks first, then the real pipeline
```
Automated tests use a **scripted model**. The real model runs only through `smoke:meta`, `eval:meta`, the e2e scripts, and the UI.

## Deploying
Render Free (server, $0) + Vercel (frontend): see **[DEPLOY.md](DEPLOY.md)** for exact settings, environment variables, the measured memory use, and how to verify the deployment with `e2e/`. Railway with a volume is the paid alternative that keeps checkpoints.

## Limitations
- Two predefined challenges. The public demo never runs visitor-written code (local mode does).
- The runner is constrained, not sandboxed (network open). Real isolation is future work.
- Regression reports and analyses are per-viewer. Code, chat, checkpoints and the active challenge are shared.
- Checkpoint storage is a JSON file per room on a single instance. On Render Free it's temporary: history disappears on restart, redeploy or spin-down, and users reload a demo scenario.
- The evaluation is 10 trials on two seeded bugs with generous context: evidence of reliability, not of general debugging ability.

## Project layout
```
server/debugger.js         debugger REST routes, access code, rate limits, AI daily cap
server/execution-policy.js what may execute: hash allowlist (restricted) vs local; edit screen
server/runner.js           compile + constrained child process, isolation self-check
server/runner-harness.cjs  inside the child: vm context, async cases, trusted scenario drivers
server/regression.js       bisect + backward verification, non-monotonic detection
server/meta.js             Meta Model API client (json_schema, fallback, typed errors, usage)
server/analysis.js         prompt, ANALYSIS_SCHEMA, response validation
server/patches.js          find/replace validation and application
server/revisions.js        checkpoint store (snapshots, sequence numbers, SHA-256, room cap)
server/challenges.js       cart-total (TS) and search-race (JS, async) with tests and demo histories
shared/                    diff, patch-safety (the apply rule), matching
src/hooks/useDebugger.ts   debugger state; CRDT-based timeline invalidation and shared challenge
src/components/            TimelinePanel, TimeTravelView, DiffView, DebuggerPanel + the editor UI
scripts/                   smoke-meta, eval-meta, benchmark
e2e/                       deployed API check + browser flows
docs/                      HACKATHON, ARCHITECTURE, EVALUATION, BENCHMARK
```

## Collaboration features
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
