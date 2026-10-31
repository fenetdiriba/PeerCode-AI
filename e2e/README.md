# End-to-end checks

Run these against a deployed server (or a local one). The API check comes first: its security checks must pass before it spends any API credits.

| Script | What it checks |
|---|---|
| `deployed-api.mjs` | `/health` posture (restricted mode, isolation self-check, Meta configured, volume), foreign-origin rejection, access-code gating, that client code is never executed; then the real pipeline on both challenges (locate → Muse Spark → verify → apply → re-test). |
| `browser-security.cjs` | In a real browser: a visitor's own checkpoint is saved but never executed. |
| `browser-flow-cart.cjs` | Two browsers: demo, time travel, refresh persistence, locate, real analysis, verification, conflict + undo, apply, re-test. |
| `browser-flow-search.cjs` | Same for the async search challenge, including the shared challenge switch. |

```bash
SERVER_URL=https://<railway-domain> FRONTEND_ORIGIN=https://<vercel-domain> PEERCODE_ACCESS_CODE=<code-if-set> node e2e/deployed-api.mjs --expect-volume
```
```bash
BASE_URL=https://<vercel-domain> PEERCODE_ACCESS_CODE=<code-if-set> node e2e/browser-flow-cart.cjs
```
The browser scripts need Playwright with Chromium (`npx playwright install chromium`). Access codes are read from the environment and never printed. `--no-ai` on the API check skips the paid part.
