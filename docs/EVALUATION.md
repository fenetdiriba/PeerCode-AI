# Muse Spark evaluation (real API)

> **Combined: 30 real trials (15 per challenge, two runs on different days): 30/30 localized, 30/30 valid on the first attempt (0 fallbacks), 30/30 root cause named, 30/30 patches passed every predefined test and re-tested green after apply.** Run 2 is summarized at the end.

**Date:** 2026-10-31 · **Model:** `muse-spark-1.3` via `https://api.meta.ai/v1/chat/completions` · **Structured output:** strict `json_schema` · **Server mode:** restricted (the public default)
**Raw data:** [`docs/eval/meta-eval-2026-10-31T01-26-09.json`](eval/meta-eval-2026-10-31T01-26-09.json): every trial, model output, token count and request id.
**Reproduce:** `npm run eval:meta -- --runs=5` (needs `MODEL_API_KEY`; costs about 26k tokens).

## Method
For each challenge, 5 independent trials, run one after another. Each trial uses a fresh room on an in-process server and the same pipeline as the UI:
1. save the 5 scripted checkpoints;
2. locate the regression (bisect + verify);
3. call `analyze` (real Muse Spark, temperature 0.1);
4. verify the returned patch by `analysisId` on an isolated copy;
5. checkpoint the verified code ("apply") and re-test it.

- **Localization correct:** first failing = checkpoint #3 and last passing = #2 (the ground truth by construction).
- **Root-cause rubric:** a keyword check, not a quality judgment. Cart: mentions quantity and its removal or multiplication. Search: mentions the request counter and the clear/blank path. I also read all 10 explanations by hand (below).
- **Latency:** server-side, request sent to model response parsed. The UI adds well under a second.

## Results
| | Shopping cart (TS) | Typeahead stale response (JS, async) |
|---|---|---|
| Trials | 5 | 5 |
| Regression localized correctly | 5/5 | 5/5 |
| Valid structured answer on the 1st attempt | 5/5 | 5/5 |
| `json_schema` → `json_object` fallbacks | 0 | 0 |
| Named the actual root cause (rubric + manual) | 5/5 | 5/5 |
| Patch passed all predefined tests | 5/5 (5/5 tests) | 5/5 (8/8 tests) |
| Applied checkpoint re-tested green | 5/5 | 5/5 |
| Model latency (median, min–max) | 8.5 s (6.2–9.3 s) | 7.0 s (5.9–14.2 s) |
| Tokens per analysis (median) | 2,146 (884 reasoning) | 3,009 (854 reasoning) |
| Tokens total | 10,609 | 15,766 |

Other real runs the same day: four two-browser UI runs (cart 6.2 s / 2,300 tokens and 7.6 s / 2,230; search 8.3 s / 3,073 and 9.3 s / 3,125) and two smoke runs. All succeeded. They're not part of the table because they weren't produced by the scripted method.

## Manual review of the explanations
- **Root causes:** all 10 are correct and specific.
  - *Cart:* "the 'Simplify reducer' change dropped the `* item.quantity` factor".
  - *Search:* "the blank-query early return no longer increments `latestRequest`, so stale responses pass the requestId check". That is the actual mechanism: the extracted `runSearch` helper took the counter with it.
- **Patches:** all minimal, and identical within each challenge across all 5 trials:
  - cart: restore `* item.quantity` (+1/−1 lines);
  - search: add `++latestRequest;` to the blank-query branch (+1 line).
- **Uncertainty notes:** accurate. Each "not covered" claim checks out against the suite: negative quantities, NaN, float rounding; `retry()` and `subscribe` interactions. Earlier, the prompt listed only failing tests, and the model twice wrongly claimed the empty cart wasn't tested. Since the prompt lists the full suite, that hasn't recurred in these 10 trials.
- **Overconfidence:** cart trials #4 and #5 say "No uncertainty about root cause/fix". The verification supports that here, but it's the wrong tone for a debugging assistant. The UI shows the verification result next to it, and the verification is the actual evidence.

## What this does and doesn't show
- **It shows:**
  - the integration is reliable on these two scenarios: 10/10 schema-valid on the first attempt, no fallbacks, every patch verified;
  - the verify-before-apply pipeline works end to end with real model output.
- **It doesn't show general debugging ability:**
  - Both bugs are seeded and the prompt is generous: the passing→failing diff, the failing inputs and outputs, and (for search) the test-driver source.
  - Identical answers across trials mean these scenarios don't stress the model.
  - 5 trials per challenge is a small sample.
- **A harder test** would be untested interactions (e.g. `retry()` racing with a clear), bugs whose diff spans several hunks, or prompts without the driver source.

## Failures observed
None among the 10 trials. Across all real runs today:
- no API errors, schema rejections, invalid outputs, retries or verification failures;
- the slowest analysis took 14.2 s.

## Run 2 (2026-11-04): 10 more trials per challenge
Same method and pipeline. **Raw data:** [`docs/eval/meta-eval-2026-11-04T04-20-15.json`](eval/meta-eval-2026-11-04T04-20-15.json).

| | Shopping cart (TS) | Typeahead stale response (JS, async) |
|---|---|---|
| Regression localized correctly | 10/10 | 10/10 |
| Valid structured answer on the 1st attempt / fallbacks | 10/10 / 0 | 10/10 / 0 |
| Named the actual root cause | 10/10 | 10/10 |
| Patch passed all predefined tests; applied checkpoint re-tested green | 10/10 | 10/10 |
| Model latency (median, min–max) | 7.6 s (6.4–9.6 s) | 10.9 s (8.5–15.7 s) |
| Tokens per analysis (median) / total | 2,131 (845 reasoning) / 21,929 | 3,255 (1,044 reasoning) / 32,273 |

Manual review:
- No uncertainty note claimed a covered case was untested.
- None said "no uncertainty".
- Patches were consistent: `* item.quantity` restored for the cart; `++latestRequest` or `latestRequest++` (equivalent here) in the blank-query branch for search.
- Search latency was higher than in run 1 (median 10.9 s vs 7.0 s), so plan the live demo around about 10–15 s.

**Cost:** at Meta's published `muse-spark-1.3` prices ($1.25 per 1M input, $4.25 per 1M output tokens), run 2's 54k tokens cost roughly $0.15.
