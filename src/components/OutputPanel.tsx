import { Loader2, Terminal, X } from 'lucide-react';
import { RunResult } from '../types';

interface OutputPanelProps {
  result: RunResult | null;
  running: boolean;
  notice: string | null;
  onClose: () => void;
}

const LINE_COLORS = {
  log: 'text-neutral-200',
  error: 'text-rose-400',
  info: 'text-neutral-500',
};

export default function OutputPanel({ result, running, notice, onClose }: OutputPanelProps) {
  return (
    <div className="flex h-48 shrink-0 flex-col border-t border-brand-border bg-[#0a0a0a]">
      <div className="flex h-9 items-center justify-between border-b border-brand-border px-4">
        <div className="flex items-center gap-2 text-xs text-brand-text-muted">
          <Terminal className="h-3.5 w-3.5 text-blue-400" />
          <span className="font-semibold uppercase tracking-wider text-neutral-300">Output</span>
          {running && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {result && !running && <span className="font-mono text-neutral-500">finished in {result.durationMs}ms</span>}
        </div>
        <button onClick={onClose} className="text-brand-text-muted hover:text-white" aria-label="Close output">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 font-mono text-[13px] leading-relaxed">
        {notice && <div className="text-amber-300/90">{notice}</div>}
        {result?.lines.map((line, i) => (
          <div key={i} className={`whitespace-pre-wrap ${LINE_COLORS[line.kind]}`}>
            {line.text}
          </div>
        ))}
        {result && result.lines.length === 0 && <div className="text-neutral-500">(no output)</div>}
        {!result && !notice && !running && (
          <div className="text-neutral-600">Press Run or Ctrl/Cmd + Enter to execute the current file.</div>
        )}
      </div>
    </div>
  );
}
