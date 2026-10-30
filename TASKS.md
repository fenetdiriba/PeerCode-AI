# TASKS

Legend: `[x]` done and verified · `[~]` implemented, not fully verified · `[ ]` not started · `[!]` blocked

## Phase 0: Audit
- [x] Inspect repo, run tests/lint/build (30/30 tests, lint clean, build ok at start)
- [x] IMPLEMENTATION_PLAN.md, TASKS.md

## Phase 1: Foundation
- [x] Fix the cold-cache `npm run dev` crash in rooms (Monaco workers vs Vite optimizer); prod build workers checked too
- [x] Verify two-browser collaboration (Playwright, two isolated contexts, direct WebRTC)

## Phase 2: Revisions
- [x] Server revision store (JSON file per room, sequence numbers, SHA-256, atomic writes)
- [x] REST: list / create / clear revisions
- [x] Timeline UI + read-only time-travel diff (never writes the live doc; verified in browser)
- [x] Collaborators see new checkpoints (Y.Doc counter → refetch; verified in browser)
- [x] Tests: creation, exact reconstruction, concurrent ordering, persistence across instances

## Phase 3: Regression detection
- [x] Challenge fixture (cart total, TypeScript, 5 data-driven tests, 5-step demo history)
- [x] Constrained runner (child process, permission model, empty env, heap cap, SIGKILL timeout)
- [x] Result classification: passed / failed / error (compile, runtime, timeout, crash, infrastructure)
- [x] Bisect + backward verification, non-monotonic flag, optional full linear scan
- [x] UI: per-checkpoint test runs, locate, last-pass / first-fail, failing cases, diff
- [x] Tests: parsing, detection, non-monotonic, infra errors, caching
- [x] Benchmark: 64/64 correct on generated histories (docs/BENCHMARK.md)

## Phase 4: Meta Muse Spark
- [!] **Verify the wire format against https://dev.meta.ai/docs.** The docs and API hosts were blocked (403) from the build container. Next step: `MODEL_API_KEY=... npm run smoke:meta` on a machine with access, then fix `buildRequest` / `readText` in server/meta.js if needed.
- [~] `server/meta.js` client (key server-side only, configurable base URL/model/JSON mode). Unit-tested with a mocked transport only.
- [x] Prompt + strict schema validation + one retry with the validation error
- [x] Errors: missing key (503), 401/403, 429, 5xx, 404/400, network, timeout, invalid shape, invalid output
- [x] `npm run smoke:meta` real-API script (fails cleanly without a key; not yet run with one)

## Phase 5: Patch verification
- [x] find/replace edits: unique match, no overlap, order-independent
- [x] Verify endpoint (real tests on an isolated patched copy)
- [x] Apply only if verified + passing + live == verified source (checked at click time); re-verify against live code
- [x] Tests: apply, conflicts, HTTP pipeline (scripted model), wrong patch reported as failing
- [x] Browser: conflict from the second browser blocks apply; re-verify, apply, both browsers updated, new checkpoint 5/5

## Phase 6: Demo + docs
- [x] One-click demo scenario (real checkpoints through the API; results not scripted)
- [x] README: status, setup, demo script, architecture, trade-offs, safety, limitations
- [x] Measured results with methodology (docs/BENCHMARK.md)
- [ ] Run the demo with the real Meta API and record the response (blocked on the item above)
- [ ] Redeploy server + frontend (Railway volume for REVISIONS_DIR; MODEL_API_KEY)
- [ ] Demo video / screenshots for the submission

## Next (if time allows, in priority order)
1. Real isolation for the runner (container with `--network none`, or a microVM)
2. A second challenge (e.g. an off-by-one in pagination) to show the fixtures aren't cart-specific
3. Share regression reports and analyses through the Y.Doc so both collaborators see them
