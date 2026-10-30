// Patches are lists of exact search/replace edits: { find, replace }.
// Each `find` must occur exactly once in the source, and edits must not overlap, so a patch
// either applies unambiguously or not at all. Edits are located in the original source and
// applied together, so the result doesn't depend on edit order.

export const MAX_EDITS = 8;
export const MAX_EDIT_CHARS = 4000;

/** @typedef {{ find: string, replace: string }} Edit */

/** @returns {{ ok: true, edits: Edit[] } | { ok: false, error: string }} */
export function validateEdits(edits) {
  if (!Array.isArray(edits) || edits.length === 0) return { ok: false, error: 'The patch has no edits.' };
  if (edits.length > MAX_EDITS) return { ok: false, error: `The patch has too many edits (max ${MAX_EDITS}).` };
  for (const [i, e] of edits.entries()) {
    if (!e || typeof e.find !== 'string' || typeof e.replace !== 'string') return { ok: false, error: `Edit ${i + 1} must have string "find" and "replace".` };
    if (!e.find) return { ok: false, error: `Edit ${i + 1} has an empty "find".` };
    if (e.find === e.replace) return { ok: false, error: `Edit ${i + 1} changes nothing.` };
    if (e.find.length > MAX_EDIT_CHARS || e.replace.length > MAX_EDIT_CHARS) return { ok: false, error: `Edit ${i + 1} is too large.` };
  }
  return { ok: true, edits: edits.map(({ find, replace }) => ({ find, replace })) };
}

/**
 * @param {string} source
 * @param {Edit[]} edits
 * @returns {{ ok: true, code: string } | { ok: false, error: string, editIndex: number }}
 */
export function applyEdits(source, edits) {
  const located = [];
  for (const [i, { find, replace }] of edits.entries()) {
    const at = source.indexOf(find);
    if (at === -1) return { ok: false, error: `Edit ${i + 1}: the text to replace was not found in the code.`, editIndex: i };
    if (source.indexOf(find, at + 1) !== -1) return { ok: false, error: `Edit ${i + 1}: the text to replace appears more than once, so the edit is ambiguous.`, editIndex: i };
    located.push({ start: at, end: at + find.length, replace, i });
  }
  located.sort((a, b) => a.start - b.start);
  for (let k = 1; k < located.length; k++) {
    if (located[k].start < located[k - 1].end) return { ok: false, error: `Edits ${located[k - 1].i + 1} and ${located[k].i + 1} overlap.`, editIndex: located[k].i };
  }
  let code = source;
  for (const { start, end, replace } of located.reverse()) code = code.slice(0, start) + replace + code.slice(end);
  return { ok: true, code };
}
