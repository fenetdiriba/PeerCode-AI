import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Pencil } from 'lucide-react';
import { sanitizeName } from '../lib/identity';
import { RoomPeer } from '../types';

interface PresencePanelProps {
  peers: RoomPeer[];
  onRename: (name: string) => void;
}

function joinedLabel(joinedAt: number, now: number) {
  const seconds = Math.max(0, Math.floor((now - joinedAt) / 1000));
  if (seconds < 30) return 'just joined';
  if (seconds < 3600) return `${Math.max(1, Math.floor(seconds / 60))}m in room`;
  return `${Math.floor(seconds / 3600)}h in room`;
}

export default function PresencePanel({ peers, onRename }: PresencePanelProps) {
  const [now, setNow] = useState(Date.now());
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  const commit = () => {
    const name = sanitizeName(draft);
    if (name) onRename(name);
    setEditing(false);
  };

  return (
    <section className="border-b border-brand-border p-4">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-brand-text-muted">
        In this room ({peers.length})
      </h2>
      <ul className="space-y-1">
        <AnimatePresence initial={false}>
          {peers.map((peer) => (
            <motion.li
              key={peer.clientId}
              layout
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.2 }}
              className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]"
            >
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-black"
                style={{ backgroundColor: peer.color }}
              >
                {peer.name.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                {peer.isLocal && editing ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      commit();
                    }}
                    className="flex items-center gap-1"
                  >
                    <input
                      autoFocus
                      value={draft}
                      maxLength={24}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={commit}
                      onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
                      className="w-full rounded border border-blue-500/50 bg-brand-bg px-1.5 py-0.5 text-xs text-white outline-none"
                    />
                    <button type="submit" className="text-emerald-400" aria-label="Save name">
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm text-brand-text">{peer.name}</span>
                    {peer.isLocal && (
                      <>
                        <span className="rounded bg-white/5 px-1.5 text-[10px] font-medium text-brand-text-muted">You</span>
                        <button
                          onClick={() => {
                            setDraft(peer.name);
                            setEditing(true);
                          }}
                          className="text-brand-text-muted opacity-0 transition-opacity hover:text-white group-hover:opacity-100 focus:opacity-100"
                          aria-label="Edit your name"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      </>
                    )}
                  </div>
                )}
                <span className="text-[11px] text-neutral-500">{joinedLabel(peer.joinedAt, now)}</span>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {peers.length <= 1 && (
        <p className="mt-3 rounded-lg border border-dashed border-brand-border px-3 py-2.5 text-xs leading-relaxed text-brand-text-muted">
          Waiting for a partner. Share the room link, or open it in a second tab to see sync in action.
        </p>
      )}
    </section>
  );
}
