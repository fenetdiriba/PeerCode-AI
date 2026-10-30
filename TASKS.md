# TASKS

Legend: `[x]` done and verified · `[~]` implemented, not fully verified · `[ ]` not started · `[!]` blocked

## Phase 0: Audit
- [x] Inspect repo, run tests/lint/build (30/30 tests, lint clean, build ok)
- [x] IMPLEMENTATION_PLAN.md, TASKS.md

## Phase 1: Foundation
- [x] Fix the cold-cache `npm run dev` crash in rooms (Monaco workers vs Vite optimizer)
- [x] Verify two-browser collaboration (Playwright, two isolated contexts, direct WebRTC)

## Phase 2: Revisions
- [ ] Server revision store (JSON file per room, sequence numbers, SHA-256 hash)
- [ ] REST: list/create/get revisions
- [ ] Timeline UI + read-only time-travel diff (never writes the live doc)
- [ ] Tests: creation, reconstruction, ordering, persistence across reload

## Phase 3: Regression detection
- [ ] Challenge fixtures (cart total, TypeScript, data-driven tests)
- [ ] Constrained runner (child process, permission model, timeout, empty env)
- [ ] Result parsing: passed / failed / error(compile|runtime|timeout|infrastructure)
- [ ] Bisect + backward linear verification, non-monotonic flag
- [ ] UI: run tests per revision, locate regression, show diff
- [ ] Tests: parsing, detection, non-monotonic

## Phase 4: Meta Muse Spark
- [!] Verify the API wire format against https://dev.meta.ai/docs (host blocked from the dev container)
- [ ] `server/meta.js` client (configurable, key server-side only)
- [ ] Prompt + strict response schema validation
- [ ] Errors: missing key, 401, 429, 5xx, timeout, invalid output
- [ ] Tests (mocked transport) + `npm run smoke:meta` manual real-API check

## Phase 5: Patch verification
- [ ] Validate and apply `{find, replace}` edits to an isolated copy
- [ ] Verify endpoint (runs real tests)
- [ ] Conflict detection via content hash; explicit, user-controlled apply
- [ ] Tests: apply, conflicts, end-to-end pipeline (mocked model)

## Phase 6: Demo + docs
- [ ] One-click demo scenario (creates real checkpoints)
- [ ] README: setup, demo, architecture, trade-offs, limitations
- [ ] Measured results (fixture accuracy, runs per localization, latency)
