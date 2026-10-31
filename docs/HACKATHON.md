# PeerCodeAI: Time-Travel Debugger (submission kit)

## One line
**Find the moment your code broke. Understand why. Fix it with proof.**

## Short description (about 50 words)
PeerCodeAI is a real-time collaborative code editor that debugs regressions in the code two people write together. It replays the shared history to find the first checkpoint that broke the tests. Meta's Muse Spark explains the cause and proposes a minimal patch. The patch is applied only after real tests pass and nobody has edited the code since.

## Longer description
When two people edit the same file, "it worked an hour ago" is hard to act on. PeerCodeAI records explicit checkpoints of a Yjs-synced document and runs predefined tests against them. Bisection, followed by a verification scan, finds the first observed failing checkpoint. The editor shows the exact diff that introduced the failure.

Muse Spark (`muse-spark-1.3`, strict `json_schema` output) receives that diff, the full test suite with pass/fail status, the failing inputs and the current code. It returns a root cause, an uncertainty note and find/replace edits. The server validates the edits, applies them to an isolated copy, and runs the real tests.

Only a verified patch can be applied, and only if the live document still matches the code it was verified against. If a collaborator typed in the meantime, apply is blocked. When it lands, it goes through the CRDT for everyone and becomes a new checkpoint.

Two challenges ship: a TypeScript cart-total regression, and a JavaScript typeahead store where an innocent-looking refactor lets a stale in-flight request overwrite the cleared state. That one is tested deterministically with deferred promises and no timers.

## Why it's different from a generic AI code assistant
| Generic assistant | PeerCodeAI |
|---|---|
| You describe the bug | The system finds *when* it appeared by running real tests over recorded history |
| Explains the code you paste | Explains the **diff that introduced the failure**, with the failing inputs and full test status |
| Suggests code; you hope it works | Every patch is **verified by real tests on an isolated copy** before it can be applied |
| Writes into your file | Applies only if the **live collaborative document still equals the verified source**; never overwrites a collaborator |
| Free-form text | **Schema-constrained** output, validated server-side (edits must apply exactly once) |
| Runs whatever you send | The public server **never executes visitor-written code** (hash allowlist, self-checked runner) |

## Measured results (real API, not mocked)
10 trials, 5 per challenge (see [EVALUATION.md](EVALUATION.md)):
- regression localized 10/10;
- valid schema-constrained answer on the first attempt 10/10, no fallbacks;
- root cause named 10/10;
- patch passed every predefined test 10/10, and applied checkpoints re-tested green 10/10;
- median model latency 8.5 s (cart) and 7.0 s (async search);
- about 2–3.5k tokens per analysis.

Caveat: these are two seeded bugs with generous context, so this shows reliability, not general debugging ability.

## 90-second demo script
Setup beforehand:
- two browser windows side by side, same room;
- Debugger view on, challenge set to **Typeahead search: stale responses**;
- the access code already entered;
- *Load demo scenario* clicked.

**Have a fallback ready:** a screen recording of the same run, in case the live API is slow (the observed maximum was 14 s).

| Time | Do | Say |
|---|---|---|
| 0:00–0:10 | Show both windows; type a comment in the right one; delete it | "Two developers share one editor. It's a Yjs CRDT over WebRTC, and every keystroke merges." |
| 0:10–0:22 | Point at the timeline: 5 checkpoints, two authors | "Each checkpoint is a snapshot. Somewhere in here, the typeahead started showing results for an empty search box." |
| 0:22–0:35 | Click **Locate regression** | "It runs the real tests over the history: bisect, then a verification scan. Checkpoint #3, 'Extract runSearch helper', is the first failure. The diff looks harmless: the counter increment is still there, it just moved." |
| 0:35–0:55 | Click **Analyze & generate fix**; read the root cause | "Muse Spark gets the diff, the full test suite and the failing scenario: type 'rea', clear, the old response lands. It says the blank-query path no longer bumps `latestRequest`, so the stale request passes the check. It proposes one line." |
| 0:55–1:05 | Badges go **Candidate → Verification running → Tests passed 8/8** | "We don't trust it: the patch runs against the real tests on an isolated copy. 8 of 8. The UI is explicit that this means *these* tests pass, not that the patch is perfect." |
| 1:05–1:20 | Type in the right window; **Apply** greys out with the conflict message; undo | "My partner edited the file after verification, so apply is blocked: the proof was about different code. Undo, and it's allowed again." |
| 1:20–1:30 | **Apply verified patch**; both windows update; new checkpoint goes green | "The fix lands through the CRDT for both of us and becomes checkpoint #6, 8/8. Found the moment it broke, understood why, fixed it with proof." |

## Technical highlights for judges
- **Deterministic fault localization:** bisect plus a backward verification scan; flags non-monotonic histories; results cached by content hash. 64/64 correct on generated histories ([BENCHMARK.md](BENCHMARK.md)).
- **Structured model output:** Meta strict `json_schema`, then server validation (edits must apply exactly once), one corrective retry, and typed API errors with the key redacted.
- **Proof-carrying apply:** the verification is bound to the exact source; the CRDT-aware minimal edit is re-checked at click time.
- **Deterministic async tests:** deferred promises plus microtask flushing reproduce a race condition with no timers.
- **Security boundary:** the hash-allowlist execution policy; a runner self-check at startup (no fs writes, subprocesses, workers, env or eval); access code, origin allowlist and daily AI cap. The README says plainly that outbound network from the runner is not blocked.

## Honest limitations
- Two predefined challenges; the public demo doesn't run visitor-written code (local mode does).
- The runner is constrained, not sandboxed: outbound network isn't blocked. Real container or microVM isolation is future work.
- Regression reports and analyses are per-viewer. Code, chat, checkpoints and the active challenge are shared.
- The demo server runs on Render Free: checkpoints are temporary and the first request after idling wakes it (about 30–60 s). Open `/health` a minute before demoing, then **Load demo scenario**.
