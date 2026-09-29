import { useEffect, useRef, useState } from 'react';
import { Terminal } from 'lucide-react';
import { RELAY_URL, SIGNALING_URLS } from '../lib/config';
import { ConnectionDetails, ConnectionStatus } from '../types';

interface StatusBarProps {
  status: ConnectionStatus;
  connection: ConnectionDetails;
  remoteCount: number;
  languageLabel: string;
  cursor: { line: number; column: number };
  onToggleOutput: () => void;
}

const DOT = { connected: 'bg-emerald-400', waiting: 'bg-amber-400', disconnected: 'bg-rose-500' } as const;

function routeLabel(c: ConnectionDetails) {
  if (c.directPeers > 0) return 'direct';
  if (c.sameBrowserPeers > 0) return 'same browser';
  if (c.relayPeers > 0) return 'via server relay';
  return null;
}

function statusLabel(status: ConnectionStatus, remoteCount: number, c: ConnectionDetails) {
  if (status === 'connected') {
    const route = routeLabel(c);
    return `Connected to ${remoteCount} peer${remoteCount === 1 ? '' : 's'}${route ? ` · ${route}` : ''}`;
  }
  if (status === 'waiting') return 'Online, waiting for peers';
  return "Can't reach the server";
}

function Row({ ok, label, detail }: { ok: boolean | null; label: string; detail: string }) {
  const color = ok === null ? 'bg-neutral-500' : ok ? 'bg-emerald-400' : 'bg-rose-500';
  return (
    <div className="flex items-start gap-2 py-1.5">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${color}`} />
      <div className="min-w-0">
        <p className="text-neutral-200">{label}</p>
        <p className="break-all text-neutral-500">{detail}</p>
      </div>
    </div>
  );
}

function ConnectionPanel({ status, connection: c }: { status: ConnectionStatus; connection: ConnectionDetails }) {
  const serverOk = c.signaling || c.relay === 'connected';
  const hint =
    status === 'disconnected'
      ? 'The app can’t reach its server. On the deployed site, check that VITE_SERVER_URL on Vercel is the Railway URL (then redeploy), and that ALLOWED_ORIGINS on Railway includes this site’s address.'
      : status === 'waiting'
        ? 'You’re online. Share the room link. Your partner will show up here once they open it.'
        : c.directPeers === 0 && c.relayPeers > 0
          ? 'A direct connection wasn’t possible on this network (common on mobile data), so edits go through the server relay. It forwards them and never stores them.'
          : 'Edits go straight between browsers.';
  return (
    <div className="absolute bottom-7 left-2 z-30 w-[min(22rem,calc(100vw-1rem))] rounded-lg border border-brand-border bg-brand-surface p-3 font-sans text-xs whitespace-normal shadow-2xl">
      <p className="mb-1 text-[11px] font-semibold tracking-wider text-brand-text-muted uppercase">Connection</p>
      <Row ok={serverOk} label={serverOk ? 'Server reachable' : 'Server not reachable'} detail={SIGNALING_URLS.join(', ')} />
      <Row
        ok={c.directPeers > 0 ? true : null}
        label={`Direct (WebRTC): ${c.directPeers} peer${c.directPeers === 1 ? '' : 's'}`}
        detail={c.signaling ? 'Signaling connected' : 'Signaling not connected'}
      />
      <Row
        ok={c.relay === 'connected' ? true : c.relay === 'connecting' ? null : false}
        label={`Server relay: ${c.relay === 'connected' ? `${c.relayPeers} peer${c.relayPeers === 1 ? '' : 's'}` : c.relay}`}
        detail={RELAY_URL}
      />
      {c.sameBrowserPeers > 0 && (
        <Row ok label={`Same browser: ${c.sameBrowserPeers} tab${c.sameBrowserPeers === 1 ? '' : 's'}`} detail="BroadcastChannel" />
      )}
      <p className="mt-2 border-t border-brand-border pt-2 leading-relaxed text-brand-text-muted">{hint}</p>
    </div>
  );
}

export default function StatusBar({ status, connection, remoteCount, languageLabel, cursor, onToggleOutput }: StatusBarProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <footer className="relative flex h-6 shrink-0 items-center justify-between border-t border-brand-border bg-[#0a0a0a] px-3 font-mono text-[11px] whitespace-nowrap text-brand-text-muted">
      <div ref={ref} className="flex min-w-0 items-center gap-4">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 items-center gap-1.5 truncate hover:text-white"
          title="Connection details"
        >
          <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[status]} ${status === 'connected' ? 'animate-pulse' : ''}`} />
          <span className="truncate">{statusLabel(status, remoteCount, connection)}</span>
        </button>
        {open && <ConnectionPanel status={status} connection={connection} />}
        <span className="hidden text-neutral-600 lg:inline">Yjs CRDT · WebRTC P2P</span>
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
