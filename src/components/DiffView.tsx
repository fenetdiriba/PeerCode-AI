import { ReactNode, useEffect, useRef, useState } from 'react';
import { monaco } from '../lib/monaco';

interface DiffViewProps {
  original: string;
  modified: string;
  language: string;
  /** Header content (labels, compare picker, actions). */
  header: ReactNode;
}

/**
 * Read-only Monaco diff editor with its own throwaway models. It is never bound to the
 * shared Y.Text, so time travel and patch review can't modify the live document.
 */
export default function DiffView({ original, modified, language, header }: DiffViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Held in state (not a ref) so the update effect always targets the live instance, including
  // under StrictMode's mount/unmount/mount.
  const [editor, setEditor] = useState<monaco.editor.IStandaloneDiffEditor | null>(null);

  // Models are created once and updated in place: disposing models while Monaco is still
  // computing a diff makes it throw ("no diff result available").
  useEffect(() => {
    if (!containerRef.current) return;
    const ed = monaco.editor.createDiffEditor(containerRef.current, {
      theme: 'peercode-dark',
      readOnly: true,
      originalEditable: false,
      automaticLayout: true,
      renderSideBySide: containerRef.current.clientWidth > 700,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 13,
      fontFamily: '"JetBrains Mono", ui-monospace, Menlo, monospace',
      renderOverviewRuler: false,
    });
    const originalModel = monaco.editor.createModel('', language);
    const modifiedModel = monaco.editor.createModel('', language);
    ed.setModel({ original: originalModel, modified: modifiedModel });
    setEditor(ed);
    return () => {
      ed.dispose();
      originalModel.dispose();
      modifiedModel.dispose();
    };
    // The language is fixed per mount; callers remount for a different one.
  }, []);

  useEffect(() => {
    const models = editor?.getModel();
    if (!models) return;
    if (models.original.getValue() !== original) models.original.setValue(original);
    if (models.modified.getValue() !== modified) models.modified.setValue(modified);
  }, [editor, original, modified]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-xs">{header}</div>
      <div ref={containerRef} className="min-h-0 flex-1" data-testid="diff-view" />
    </div>
  );
}
