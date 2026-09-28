import { Terminal } from 'lucide-react';
import { ConnectionStatus } from '../types';

interface StatusBarProps {
  status: ConnectionStatus;
  remoteCount: number;
  languageLabel: string;
  cursor: { line: number; column: number };
  onToggleOutput: () => void;
}

const STATUS = {
  connected: { dot: 'bg-emerald-400', label: (n: number) => `Connected to ${n} peer${n === 1 ? '' : 's'}` },
  waiting: { dot: 'bg-amber-400', label: () => 'Online, waiting for peers' },
  disconnected: { dot: 'bg-rose-500', label: () => 'Offline, edits will sync on reconnect' },
} as const;

export default function StatusBar({ status, remoteCount, languageLabel, cursor, onToggleOutput }: StatusBarProps) {
  const s = STATUS[status];
  return (
    <footer className="flex h-6 shrink-0 items-center justify-between border-t border-brand-border bg-[#0a0a0a] px-3 font-mono text-[11px] whitespace-nowrap text-brand-text-muted">
      <div className="flex items-center gap-4">
        <span className="flex min-w-0 items-center gap-1.5 truncate" title="Green: peers connected. Yellow: signaling server reachable, no peers yet. Red: offline.">
          <span className={`h-2 w-2 rounded-full ${s.dot} ${status === 'connected' ? 'animate-pulse' : ''}`} />
          {s.label(remoteCount)}
        </span>
        <span className="hidden sm:inline text-neutral-600">Yjs CRDT · WebRTC P2P</span>
      </div>
      <div className="flex items-center gap-4">
        <button onClick={onToggleOutput} className="flex items-center gap-1 hover:text-white">
          <Terminal className="h-3 w-3" /> Output
        </button>
        <span className="hidden sm:inline">
          Ln {cursor.line}, Col {cursor.column}
        </span>
        <span className="hidden sm:inline">{languageLabel}</span>
      </div>
    </footer>
  );
}
