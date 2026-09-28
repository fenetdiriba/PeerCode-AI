// Monaco is loaded from the local `monaco-editor` package (not a CDN) so that
// y-monaco, which imports monaco directly, shares the exact same instance.
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === 'typescript' || label === 'javascript') return new TsWorker();
    return new EditorWorker();
  },
};

monaco.editor.defineTheme('peercode-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#0d0d0d',
    'editor.lineHighlightBackground': '#161616',
    'editorLineNumber.foreground': '#3f3f46',
    'editorLineNumber.activeForeground': '#a1a1aa',
    'editorCursor.foreground': '#60a5fa',
    'editor.selectionBackground': '#3b82f633',
    'editorIndentGuide.background1': '#1f1f1f',
    'editorWidget.background': '#141414',
    'editorWidget.border': '#262626',
  },
});

export { monaco };
