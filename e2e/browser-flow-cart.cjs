// Two-browser flow, shopping-cart challenge: demo, time travel, refresh persistence, locate,
// real Muse Spark analysis, verification, conflict, undo, apply, re-test.
// Usage: BASE_URL=https://your-app.vercel.app [PEERCODE_ACCESS_CODE=...] node e2e/<file>.cjs
// Requires Playwright with Chromium (npx playwright install chromium). Expects a server in
// restricted mode (the default). The access code is put in localStorage, never printed.
const { chromium } = require('playwright');
const assert = require('assert');
(async () => {
  const browser = await chromium.launch();
  const room = 'flow' + Date.now().toString(36);
  const BASE = (process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
  const url = `${BASE}/#/room/${room}`;
  const mk = async () => { const c = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage(); await p.addInitScript((code) => code && localStorage.setItem('peercode.accessCode', code), process.env.PEERCODE_ACCESS_CODE || ''); p.on('pageerror', (e) => console.log('PAGEERROR', e.message)); p.on('dialog', (d) => d.accept()); return p; };
  const a = await mk(), b = await mk();
  await a.goto(url); await b.goto(url);
  for (const p of [a, b]) await p.waitForSelector('.monaco-editor', { timeout: 30000 });
  await a.waitForTimeout(2000);
  const step = (s) => console.log('✓', s);
  const liveText = (p) => p.evaluate(() => { const m = window.monaco; return null; });
  const editorText = async (p) => (await p.locator('main .monaco-editor .view-lines').first().innerText()).replace(/\u00a0/g, ' ');

  await a.getByRole('button', { name: 'Load demo scenario' }).click();
  await a.getByText('Loaded 5 checkpoints').waitFor({ timeout: 20000 });
  await b.locator('aside ol li').nth(4).waitFor({ timeout: 10000 });
  assert.equal(await b.locator('aside ol li').count(), 5); step('demo loaded; B sees 5 checkpoints via Y.Doc invalidation');
  await b.waitForTimeout(800);
  assert.match(await editorText(b), /cartSummary/); step('B editor shows the latest demo code (CRDT sync)');

  await a.locator('aside ol li').first().locator('button').first().click();
  await a.getByText('Time travel · read-only').waitFor();
  await a.screenshot({ path: (process.env.SCREENSHOT_DIR || '.') + '/1-timetravel.png' });
  assert.match(await editorText(b), /cartSummary/); step('time travel on A leaves the live doc untouched');
  await a.getByRole('button', { name: 'Return to live editor' }).click();

  await a.reload(); await a.waitForSelector('.monaco-editor'); await a.locator('aside ol li').nth(4).waitFor({ timeout: 10000 });
  step('checkpoints persist across refresh');

  await a.getByRole('button', { name: 'Locate regression' }).click();
  await a.getByText(/is the first observed failing checkpoint/).waitFor({ timeout: 20000 });
  const reportText = await a.locator('section').filter({ hasText: 'Locate regression' }).innerText();
  assert.match(reportText, /#3 Simplify reducer/); assert.match(reportText, /#2 Add formatPrice helper/);
  console.log('   ', reportText.split('\n').filter((l) => /fresh run|first observed/.test(l)).join(' | '));
  await a.screenshot({ path: (process.env.SCREENSHOT_DIR || '.') + '/2-regression.png' }); step('regression located at #3, diff view open');

  await a.getByRole('button', { name: 'Analyze & generate fix' }).click();
  await a.getByText('Tests passed', { exact: true }).waitFor({ timeout: 90000 });
  const modelLine = await a.getByText(/^model: /).innerText();
  assert.match(modelLine, /^model: muse-spark-1\.3 /); console.log('   ', modelLine);
  console.log('    root cause (UI):', await a.locator('section').filter({ hasText: 'Probable root cause' }).locator('p').nth(2).innerText());
  await a.screenshot({ path: (process.env.SCREENSHOT_DIR || '.') + '/real-3-verified.png' }); step('REAL Muse Spark analysis → candidate → verification passed (5/5 real tests)');

  // Collaborator edits after verification → conflict.
  await b.click('main .monaco-editor .view-lines'); await b.keyboard.press('Control+End'); await b.keyboard.type('// B was here');
  await a.getByText(/live code changed after this patch was verified/).waitFor({ timeout: 10000 });
  assert.equal(await a.getByRole('button', { name: 'Apply verified patch' }).isDisabled(), true);
  await a.screenshot({ path: (process.env.SCREENSHOT_DIR || '.') + '/4-conflict.png' }); step('collaborator edit blocks apply (conflict detected)');

  // Restricted (public) mode: edited code can't be re-verified; the collaborator undoes instead.
  assert.match(await a.locator('section').filter({ hasText: 'Review & apply' }).innerText(), /Undo the edits/);
  for (let i = 0; i < 6; i++) {
    const enabled = await a.evaluate(() => { const x = [...document.querySelectorAll('button')].find((y) => y.textContent.includes('Apply verified patch')); return x && !x.disabled; });
    if (enabled) break;
    await b.keyboard.press('Control+z'); await b.waitForTimeout(400);
  }
  await a.waitForFunction(() => { const x = [...document.querySelectorAll('button')].find((y) => y.textContent.includes('Apply verified patch')); return x && !x.disabled; }, null, { timeout: 10000 });
  step('restricted mode: no re-verify of edited code; B undid the edit and apply re-enabled');

  await a.getByRole('button', { name: 'Review patch' }).click();
  await a.getByText('Patch review · read-only').waitFor();
  await a.getByRole('button', { name: 'Apply verified patch' }).click();
  await a.getByText(/applied as checkpoint #6, re-tested: 5\/5 passed/).waitFor({ timeout: 30000 });
  // The applied checkpoint carries its own re-test result without anyone clicking Run.
  await a.locator('aside ol li').nth(5).getByText('5/5 passed').waitFor({ timeout: 10000 });
  console.log('✓ applied checkpoint #6 auto re-tested: 5/5 (distinct from the verified copy)');
  await b.waitForTimeout(1000);
  const bText = await editorText(b);
  assert.match(bText, /item\.price \* item\.quantity/); step('patch applied for B too (through the shared Y.Doc)');
  await b.locator('aside ol li').nth(5).waitFor({ timeout: 10000 }); step('B sees checkpoint #6');

  const last = a.locator('aside ol li').nth(5);
  await last.hover(); await last.getByRole('button', { name: /Run tests on checkpoint 6/ }).click();
  await last.getByText('5/5 passed').waitFor({ timeout: 15000 }); step('checkpoint #6 passes 5/5 tests');
  await a.screenshot({ path: (process.env.SCREENSHOT_DIR || '.') + '/real-5-applied.png' });
  await browser.close(); console.log('ALL GOOD');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
