// Two-browser flow, async search challenge: challenge switch sync, demo, locate, real Muse Spark
// analysis, verification, conflict, undo, apply, re-test.
// Usage: BASE_URL=https://your-app.vercel.app [PEERCODE_ACCESS_CODE=...] node e2e/<file>.cjs
// Requires Playwright with Chromium (npx playwright install chromium). Expects a server in
// restricted mode (the default). The access code is put in localStorage, never printed.
// Two-browser flow on the search-race challenge against the REAL Meta API (server in real mode).
const { chromium } = require('playwright');
const assert = require('assert');
(async () => {
  const browser = await chromium.launch();
  const BASE = (process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
  const url = `${BASE}/#/room/race${Date.now().toString(36)}`;
  const mk = async () => { const c = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage(); await p.addInitScript((code) => code && localStorage.setItem('peercode.accessCode', code), process.env.PEERCODE_ACCESS_CODE || ''); p.on('pageerror', (e) => console.log('PAGEERROR', e.message)); p.on('dialog', (d) => d.accept()); return p; };
  const a = await mk(), b = await mk();
  await a.goto(url); await b.goto(url);
  for (const p of [a, b]) await p.waitForSelector('.monaco-editor', { timeout: 30000 });
  await a.waitForTimeout(2000);
  const step = (s) => console.log('✓', s);
  const editorText = async (p) => (await p.locator('main .monaco-editor .view-lines').first().innerText()).replace(/ /g, ' ');

  await a.getByLabel('Challenge').selectOption('search-race');
  await b.waitForFunction(() => document.querySelector('select[aria-label="Challenge"]')?.value === 'search-race', null, { timeout: 10000 });
  step('challenge switch syncs to B through the Y.Doc');

  await a.getByRole('button', { name: 'Load demo scenario' }).click();
  await a.getByText('Loaded 5 checkpoints').waitFor({ timeout: 20000 });
  await b.locator('aside ol li').nth(4).waitFor({ timeout: 10000 });
  await b.waitForTimeout(800);
  await b.click('main .monaco-editor .view-lines'); await b.keyboard.press('Control+End'); await b.waitForTimeout(300);
  assert.match(await editorText(b), /resultCount/); step('B sees 5 search checkpoints and the latest JavaScript code');

  await a.getByRole('button', { name: 'Locate regression' }).click();
  await a.getByText(/is the first observed failing checkpoint/).waitFor({ timeout: 20000 });
  const rep = await a.locator('section').filter({ hasText: 'Locate regression' }).innerText();
  assert.match(rep, /#3 Extract runSearch helper/); assert.match(rep, /clearing the input discards an in-flight search/);
  step('regression located at #3 "Extract runSearch helper"');

  await a.getByRole('button', { name: 'Analyze & generate fix' }).click();
  await a.getByText('Tests passed', { exact: true }).waitFor({ timeout: 120000 });
  const modelLine = await a.getByText(/^model: /).innerText();
  assert.match(modelLine, /^model: muse-spark-1\.3 /); console.log('   ', modelLine.replace(/\s+/g, ' '));
  const panel = await a.locator('section').filter({ hasText: 'Probable root cause' }).innerText();
  console.log('    ' + panel.split('\n').filter((l, i, arr) => arr[i - 1] === 'PROBABLE ROOT CAUSE').join(''));
  await a.screenshot({ path: (process.env.SCREENSHOT_DIR || '.') + '/race-verified.png' });
  step('REAL Muse Spark patch verified 8/8 on an isolated copy');

  await b.click('main .monaco-editor .view-lines'); await b.keyboard.press('Control+End'); await b.keyboard.type('// B: reviewing');
  await a.getByText(/live code changed after this patch was verified/).waitFor({ timeout: 10000 });
  assert.equal(await a.getByRole('button', { name: 'Apply verified patch' }).isDisabled(), true); step('B\'s edit blocks apply (conflict)');
  // Restricted (public) mode: edited code can't be re-verified; the collaborator undoes instead.
  assert.match(await a.locator('section').filter({ hasText: 'Review & apply' }).innerText(), /Undo the edits/);
  for (let i = 0; i < 6; i++) {
    const enabled = await a.evaluate(() => { const x = [...document.querySelectorAll('button')].find((y) => y.textContent.includes('Apply verified patch')); return x && !x.disabled; });
    if (enabled) break;
    await b.keyboard.press('Control+z'); await b.waitForTimeout(400);
  }
  await a.waitForFunction(() => { const x = [...document.querySelectorAll('button')].find((y) => y.textContent.includes('Apply verified patch')); return x && !x.disabled; }, null, { timeout: 10000 });
  step('restricted mode: no re-verify of edited code; B undid the edit and apply re-enabled');
  await a.getByRole('button', { name: 'Apply verified patch' }).click();
  await a.getByText(/Patch applied and checkpointed/).waitFor({ timeout: 15000 });
  await b.waitForTimeout(1000);
  const bText = await editorText(b);
  assert.match(bText, /\+\+latestRequest;/); // DOM line order isn't visual order in Monaco; content check only
  step('patch applied through the shared doc');
  const last = a.locator('aside ol li').nth(5);
  await last.hover(); await last.getByRole('button', { name: /Run tests on checkpoint 6/ }).click();
  await last.getByText('8/8 passed').waitFor({ timeout: 15000 }); step('checkpoint #6 passes 8/8');
  await a.screenshot({ path: (process.env.SCREENSHOT_DIR || '.') + '/race-applied.png' });
  await browser.close(); console.log('ALL GOOD');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
