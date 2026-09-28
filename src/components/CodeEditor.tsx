import { useEffect, useRef, useState } from 'react';
import { MonacoBinding } from 'y-monaco';
import { FileCode2 } from 'lucide-react';
import { monaco } from '../lib/monaco';
import { RoomSession } from '../lib/collab';
import { getLanguage, STARTER_CODE } from '../lib/languages';
import { LanguageId, RoomPeer } from '../types';

interface CodeEditorProps {
  session: RoomSession;
  language: LanguageId;
  peers: RoomPeer[];
  onRun: () => void;
  onCursorChange: (pos: { line: number; column: number }) => void;
}

/** Escape a string for use inside a CSS `content: "..."` value. */
const cssString = (s: string) => `"${s.replace(/[\\"]/g, '\\$&').replace(/[\n\r]/g, ' ')}"`;

export default function CodeEditor({ session, language, peers, onRun, onCursorChange }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [isEmpty, setIsEmpty] = useState(false);

  // Keep the latest callbacks in refs so the editor commands never go stale.
  const onRunRef = useRef(onRun);
  const onCursorRef = useRef(onCursorChange);
  onRunRef.current = onRun;
  onCursorRef.current = onCursorChange;

  useEffect(() => {
    if (!containerRef.current) return;
    const ed = monaco.editor.create(containerRef.current, {
      model: null,
      theme: 'peercode-dark',
      fontSize: 14,
      fontFamily: '"JetBrains Mono", ui-monospace, Menlo, monospace',
      fontLigatures: true,
      minimap: { enabled: false },
      automaticLayout: true,
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      renderLineHighlight: 'all',
      padding: { top: 16, bottom: 16 },
      tabSize: 2,
    });
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => onRunRef.current());
    const sub = ed.onDidChangeCursorPosition((e) =>
      onCursorRef.current({ line: e.position.lineNumber, column: e.position.column }),
    );
    setEditor(ed);
    return () => {
      sub.dispose();
      ed.dispose();
    };
  }, []);

  // Bind the shared Y.Text for the active language to a fresh Monaco model.
  // y-monaco translates Monaco edits into Yjs operations and applies remote ones back,
  // and publishes our selection through awareness so peers can render our cursor.
  useEffect(() => {
    if (!editor) return;
    const ytext = session.getCode(language);
    const model = monaco.editor.createModel('', getLanguage(language).monacoId);
    model.updateOptions({ tabSize: language === 'python' || language === 'java' || language === 'cpp' ? 4 : 2 });
    editor.setModel(model);
    const binding = new MonacoBinding(ytext, model, new Set([editor]), session.provider.awareness);

    const onText = () => setIsEmpty(ytext.length === 0);
    ytext.observe(onText);
    onText();

    return () => {
      ytext.unobserve(onText);
      binding.destroy();
      editor.setModel(null);
      model.dispose();
    };
  }, [editor, session, language]);

  const insertStarter = () => {
    const ytext = session.getCode(language);
    session.doc.transact(() => {
      if (ytext.length === 0) ytext.insert(0, STARTER_CODE[language]);
    });
    editor?.focus();
  };

  // y-monaco tags remote selections with per-client classes; color them per peer.
  const remoteCursorCss = peers
    .filter((p) => !p.isLocal)
    .map(
      (p) => `
.yRemoteSelection-${p.clientId} { background-color: ${p.color}33; }
.yRemoteSelectionHead-${p.clientId} { border-color: ${p.color}; }
.yRemoteSelectionHead-${p.clientId}::after { content: ${cssString(p.name)}; background-color: ${p.color}; }`,
    )
    .join('\n');

  return (
    <div className="relative h-full w-full">
      <style>{remoteCursorCss}</style>
      <div ref={containerRef} className="absolute inset-0" />
      {isEmpty && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 rounded-xl border border-brand-border bg-brand-surface/90 px-6 py-5 text-center shadow-2xl backdrop-blur">
            <FileCode2 className="h-6 w-6 text-blue-400" />
            <div>
              <p className="text-sm font-medium text-white">This {getLanguage(language).label} file is empty</p>
              <p className="mt-1 text-xs text-brand-text-muted">Start typing, or drop in a warm-up problem.</p>
            </div>
            <button
              onClick={insertStarter}
              className="pointer-events-auto rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-500"
            >
              Insert Two Sum starter
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
