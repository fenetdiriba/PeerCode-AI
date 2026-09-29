import { FormEvent, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2, Sparkles, X } from 'lucide-react';
import { minimalReplacement, requestAiEdit } from '../lib/ai';
import { monaco } from '../lib/monaco';
import { LanguageId } from '../types';

interface AiPromptProps {
  editor: monaco.editor.IStandaloneCodeEditor;
  language: LanguageId;
  open: boolean;
  onClose: () => void;
}

const EXAMPLES = ['fix the bug', 'add input validation', 'make this O(n)', 'add comments', 'write a binary search'];

type Target = { kind: 'selection'; lines: [number, number] } | { kind: 'file'; empty: boolean };

function currentTarget(editor: monaco.editor.IStandaloneCodeEditor): Target {
  const sel = editor.getSelection();
  if (sel && !sel.isEmpty()) {
    // A selection ending at column 1 of the next line doesn't really include that line.
    const endLine = sel.endColumn === 1 && sel.endLineNumber > sel.startLineNumber ? sel.endLineNumber - 1 : sel.endLineNumber;
    return { kind: 'selection', lines: [sel.startLineNumber, endLine] };
  }
  return { kind: 'file', empty: (editor.getModel()?.getValueLength() ?? 0) === 0 };
}

/**
 * Ctrl/Cmd+K prompt bar. Sends the file (and selection) to the AI endpoint and applies the
 * result as a normal editor edit: it syncs to your partner through Yjs and Ctrl+Z undoes it.
 */
export default function AiPrompt({ editor, language, open, onClose }: AiPromptProps) {
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [target, setTarget] = useState<Target>({ kind: 'file', empty: false });
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pendingDecorations = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);

  useEffect(() => {
    if (!open) return;
    setTarget(currentTarget(editor));
    setError(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open, editor]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(id);
  }, [notice]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const close = () => {
    abortRef.current?.abort();
    onClose();
    editor.focus();
  };

  const flash = (range: monaco.IRange) => {
    const deco = editor.createDecorationsCollection([
      { range, options: { className: 'ai-applied', isWholeLine: false, stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges } },
    ]);
    editor.revealRangeInCenterIfOutsideViewport(range);
    setTimeout(() => deco.clear(), 1800);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const model = editor.getModel();
    if (!model || busy || !instruction.trim()) return;

    const code = model.getValue();
    const sel = editor.getSelection();
    const hasSelection = Boolean(sel && !sel.isEmpty());
    const selection = hasSelection && sel ? { start: model.getOffsetAt(sel.getStartPosition()), end: model.getOffsetAt(sel.getEndPosition()) } : null;
    const versionAtRequest = model.getAlternativeVersionId();

    // Track the selected range while waiting: a partner may edit elsewhere and shift it.
    pendingDecorations.current = editor.createDecorationsCollection(
      hasSelection && sel ? [{ range: sel, options: { className: 'ai-pending', stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges } }] : [],
    );

    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError(null);
    try {
      const result = await requestAiEdit({ code, language, instruction, selection }, controller.signal);
      if (editor.getModel() !== model) throw new Error('You switched files before the AI finished.');

      let range: monaco.IRange;
      let text: string;
      if (result.mode === 'selection' && selection) {
        const tracked = pendingDecorations.current?.getRange(0);
        if (!tracked || model.getValueInRange(tracked) !== code.slice(selection.start, selection.end)) {
          throw new Error('The selected code changed while the AI was working. Try again.');
        }
        range = tracked;
        text = result.text;
        // If the selection starts after the line's indentation, the model usually repeats that
        // indentation in its reply; drop it so the line doesn't end up double-indented.
        const indent = model.getValueInRange(new monaco.Range(tracked.startLineNumber, 1, tracked.startLineNumber, tracked.startColumn));
        if (indent && /^\s+$/.test(indent) && text.startsWith(indent)) text = text.slice(indent.length);
      } else {
        if (model.getAlternativeVersionId() !== versionAtRequest) {
          throw new Error('The file changed while the AI was working. Try again so your partner’s edits aren’t lost.');
        }
        const r = minimalReplacement(code, result.text);
        if (r.start === r.end && !r.text) {
          setNotice('The AI didn’t suggest any changes.');
          onClose();
          return;
        }
        const start = model.getPositionAt(r.start);
        const end = model.getPositionAt(r.end);
        range = new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column);
        text = r.text;
      }

      editor.pushUndoStop();
      editor.executeEdits('peercode-ai', [{ range, text, forceMoveMarkers: true }]);
      editor.pushUndoStop();

      const startPos = { lineNumber: range.startLineNumber, column: range.startColumn };
      const endPos = model.getPositionAt(model.getOffsetAt(startPos) + text.length);
      flash(new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column));
      setNotice('AI edit applied. Ctrl/Cmd+Z to undo.');
      setInstruction('');
      onClose();
      editor.focus();
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError((err as Error).message);
    } finally {
      pendingDecorations.current?.clear();
      pendingDecorations.current = null;
      abortRef.current = null;
      setBusy(false);
    }
  };

  const targetLabel =
    target.kind === 'selection'
      ? target.lines[0] === target.lines[1]
        ? `Editing line ${target.lines[0]}`
        : `Editing lines ${target.lines[0]}–${target.lines[1]}`
      : target.empty
        ? 'Writing new code'
        : 'Editing the whole file (select code to edit just that part)';

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.form
            onSubmit={submit}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute top-3 left-1/2 z-30 w-[min(40rem,calc(100%-1.5rem))] -translate-x-1/2 rounded-xl border border-violet-500/40 bg-brand-surface p-2 shadow-2xl shadow-black/60"
          >
            <div className="flex items-center gap-2">
              {busy ? (
                <Loader2 className="ml-1 h-4 w-4 shrink-0 animate-spin text-violet-300" />
              ) : (
                <Sparkles className="ml-1 h-4 w-4 shrink-0 text-violet-300" />
              )}
              <input
                ref={inputRef}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && close()}
                disabled={busy}
                maxLength={500}
                placeholder={`Ask AI to ${EXAMPLES[0]}, ${EXAMPLES[1]}, ${EXAMPLES[4]}…`}
                aria-label="Ask AI to edit code"
                className="h-9 min-w-0 flex-1 bg-transparent text-sm text-white placeholder-neutral-500 outline-none disabled:opacity-60"
              />
              {busy ? (
                <button type="button" onClick={() => abortRef.current?.abort()} className="rounded-md px-2 py-1 text-xs text-brand-text-muted hover:text-white">
                  Cancel
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!instruction.trim()}
                  className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-40"
                >
                  Generate
                </button>
              )}
              <button type="button" onClick={close} className="p-1 text-brand-text-muted hover:text-white" aria-label="Close AI prompt">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center justify-between gap-2 px-1 pt-1.5 text-[11px]">
              <span className="truncate text-neutral-500">{busy ? 'Thinking…' : targetLabel}</span>
              <span className="hidden shrink-0 text-neutral-600 sm:inline">Enter to send · Esc to close</span>
            </div>
            {error && <p className="mx-1 mt-1.5 rounded-md bg-rose-500/10 px-2 py-1.5 text-xs text-rose-300">{error}</p>}
          </motion.form>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {notice && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="pointer-events-none absolute bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-lg border border-violet-500/30 bg-brand-surface px-3 py-2 text-xs text-violet-200 shadow-xl"
          >
            {notice}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
