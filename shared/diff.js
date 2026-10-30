// Line diff (LCS) used for regression reports and the AI prompt. Inputs are small source
// files, so the O(n·m) table is fine; very large inputs fall back to a whole-file replace.

const MAX_CELLS = 4_000_000;

/**
 * @param {string} before
 * @param {string} after
 * @returns {{ type: 'same' | 'add' | 'del', text: string, oldLine?: number, newLine?: number }[]}
 */
export function diffLines(before, after) {
  const a = before.split('\n');
  const b = after.split('\n');
  const n = a.length;
  const m = b.length;
  if (n * m > MAX_CELLS) {
    return [...a.map((text, i) => ({ type: 'del', text, oldLine: i + 1 })), ...b.map((text, j) => ({ type: 'add', text, newLine: j + 1 }))];
  }
  // lcs[i][j] = LCS length of a[i..] and b[j..]
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', text: a[i], oldLine: i + 1, newLine: j + 1 });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ type: 'del', text: a[i], oldLine: i + 1 });
      i++;
    } else {
      out.push({ type: 'add', text: b[j], newLine: j + 1 });
      j++;
    }
  }
  while (i < n) out.push({ type: 'del', text: a[i], oldLine: ++i });
  while (j < m) out.push({ type: 'add', text: b[j], newLine: ++j });
  return out;
}

/** Unified-style text with `context` unchanged lines around each change. */
export function unifiedDiff(before, after, context = 3) {
  const lines = diffLines(before, after);
  const keep = new Array(lines.length).fill(false);
  lines.forEach((l, k) => {
    if (l.type === 'same') return;
    for (let d = Math.max(0, k - context); d <= Math.min(lines.length - 1, k + context); d++) keep[d] = true;
  });
  const out = [];
  let skipped = false;
  lines.forEach((l, k) => {
    if (!keep[k]) {
      skipped = true;
      return;
    }
    if (skipped && out.length) out.push('@@');
    skipped = false;
    out.push(`${l.type === 'add' ? '+' : l.type === 'del' ? '-' : ' '} ${l.text}`);
  });
  return out.join('\n');
}

/** @returns {{ added: number, removed: number }} */
export function diffStats(before, after) {
  let added = 0;
  let removed = 0;
  for (const l of diffLines(before, after)) {
    if (l.type === 'add') added++;
    else if (l.type === 'del') removed++;
  }
  return { added, removed };
}
