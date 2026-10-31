// A visitor's own checkpoint must be stored but never executed on a restricted server.
// Usage: BASE_URL=https://your-app.vercel.app [PEERCODE_ACCESS_CODE=...] node e2e/<file>.cjs
// Requires Playwright with Chromium (npx playwright install chromium). Expects a server in
// restricted mode (the default). The access code is put in localStorage, never printed.
// Browser check against a restricted server: a visitor's own code is never executed.
const { chromium } = require('playwright');
const assert = require('assert');
(async () => {
  const browser = await chromium.launch(); const p = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const BASE = (process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
  await p.addInitScript((code) => code && localStorage.setItem('peercode.accessCode', code), process.env.PEERCODE_ACCESS_CODE || '');
  await p.goto(`${BASE}/#/room/sec${Date.now().toString(36)}`); await p.waitForSelector('.monaco-editor');
  await p.waitForTimeout(1500);
  await p.click('main .monaco-editor .view-lines'); await p.keyboard.press('Control+a');
  await p.keyboard.type('function calculateTotal(items) { return 0; } // visitor code');
  await p.getByLabel('Checkpoint label').fill('my own code'); await p.getByRole('button', { name: 'Save' }).click();
  const item = p.locator('aside ol li').first(); await item.waitFor();
  await item.hover(); await item.getByRole('button', { name: /Run tests on checkpoint/ }).click();
  const alert = p.getByRole('alert').filter({ hasText: 'Checkpoint' }); await alert.waitFor({ timeout: 10000 });
  const text = await alert.innerText(); console.log('   alert:', text.replace(/\s+/g, ' ').slice(0, 160));
  assert.match(text, /won.t run it/);
  console.log('✓ visitor-written checkpoint is stored but not executed'); await browser.close();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
