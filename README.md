# PeerCodeAI: Time-Travel Debugger

> **Find the moment your code broke. Understand why. Fix it with proof.**

A real-time collaborative code editor with a debugger that:
1. finds the change that broke the tests;
2. asks **Meta Muse Spark** why;
3. verifies the proposed fix against real tests;
4. applies it only if nobody has edited the code since.

**Live demo:** [peer-code-ai.vercel.app](https://peer-code-ai.vercel.app) · **Video (74 s):** [youtu.be/v9Y7SIhG-mw](https://youtu.be/v9Y7SIhG-mw) · Built for the Meta Global AI Developer Hackathon (Indie Track)

## How it works
```
Checkpoints ─► Locate regression ─► Explain (Muse Spark) ─► Verify on a copy ─► Apply to the shared doc
 (snapshots)   real tests, bisect     diff + failing tests      real tests          only if unchanged
               + verification scan    → root cause + patch                          since verification
```
1. **Checkpoints:** snapshots of the shared Yjs document, ordered by the server. Click one to time-travel through a read-only diff.
2. **Locate regression (deterministic):** real tests run over the history. Bisection plus a backward verification scan report the *first observed failing* checkpoint and the diff that introduced it.
3. **Explain (Muse Spark, `muse-spark-1.3`):** the model receives the diff, the full test suite with pass/fail status, the failing inputs and outputs, and the current code. It answers in **strict `json_schema` structured output**: what failed, what changed, the root cause, its uncertainty, and minimal find/replace edits.
4. **Verify:** the server validates the edits (each must match the code exactly once), applies them to an isolated copy, and runs the predefined tests.
5. **Apply:** allowed only if the live collaborative document still equals the verified code. A collaborator's newer edits block it. The applied checkpoint is then re-tested on its own.

**Two built-in scenarios:**
- a TypeScript cart-total regression;
- a JavaScript **async stale-response race**: after an innocent-looking refactor, clearing the search box no longer cancels an in-flight request. It's tested deterministically with deferred promises, with no timers.

## Results
| Evidence | Result |
|---|---|
| Real Muse Spark runs (2 scenarios, 15 trials each, two days) | **30/30**: regression localized, valid structured answer on the first attempt, root cause named, patch passed all predefined tests, applied checkpoint re-tested green ([EVALUATION](docs/EVALUATION.md), raw data in `docs/eval/`) |
| Localization algorithm on generated histories (8–64 checkpoints, incl. non-monotonic) | **64/64** correct ([BENCHMARK](docs/BENCHMARK.md)) |
| Automated tests | **94** passing (`npm test`) |

These are two seeded bugs with generous context: evidence that the pipeline is reliable, not proof of general debugging ability.

## Safety and limitations
- **The public server never runs visitor-written code.** It executes only the built-in scenario code, plus model patches of that code. Patches are screened for dangerous constructs, then run in a restricted Node child process: no file writes, subprocesses, workers, environment variables or string `eval`, all checked at startup. **This isn't a full sandbox: outbound network isn't blocked.**
- **Visitor text never reaches the model prompt:** analysis only accepts the built-in scenario code. API keys stay on the server, and AI calls are rate-limited with a daily cap.
- **Scope:** the public demo runs the two built-in scenarios. To debug your own code, run it locally with `EXECUTION_MODE=local`.
- **Free hosting:** the Render Free server sleeps when idle (the first load can take about a minute), and checkpoints are temporary; click **Load demo scenario** to rebuild them.

## Run locally
```bash
npm install
cp .env.example .env        # add MODEL_API_KEY (Meta Model API); EXECUTION_MODE=local to test your own code
npm run dev:all             # server :4444 + app :3000
```
Open `http://localhost:3000` → **Create a room** → open the same link in a second browser → **Debugger** → **Load demo scenario**.

```bash
npm test && npm run lint && npm run build
```
```bash
npm run smoke:meta -- --challenge=all     # real Meta API, end to end
```
```bash
node e2e/deployed-api.mjs                 # against a running server: security checks first, then the pipeline
```

## Stack
- **Frontend:** React 19, TypeScript, Monaco, Tailwind.
- **Collaboration:** Yjs CRDT over WebRTC, with a WebSocket relay fallback.
- **Server:** Node 22: debugger API, test runner, signaling, relay.
- **AI and hosting:** Meta Model API (Muse Spark). Deployed on Vercel (frontend) and Render Free (server).
- **Also in the editor:** live cursors and presence, chat, skill-based matchmaking, an in-browser JS/TS runner, and optional Gemini code hints.

## Docs
[Architecture](docs/ARCHITECTURE.md) · [Evaluation](docs/EVALUATION.md) · [Benchmark](docs/BENCHMARK.md) · [Deploy](DEPLOY.md) · [Submission kit](docs/HACKATHON.md) · [Task log](TASKS.md) (the [original plan](IMPLEMENTATION_PLAN.md) is kept for history)
