import { FormEvent, useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { ChatMessage } from '../types';

interface ChatPanelProps {
  messages: ChatMessage[];
  localClientId: number;
  onSend: (text: string) => void;
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

export default function ChatPanel({ messages, localClientId, onSend }: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    onSend(draft);
    setDraft('');
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <h2 className="px-4 pt-4 pb-2 text-[11px] font-semibold uppercase tracking-wider text-brand-text-muted">Chat</h2>
      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3">
        {messages.length === 0 && (
          <p className="text-xs text-neutral-500">No messages yet. Chat syncs peer-to-peer, just like the code.</p>
        )}
        {messages.map((m, i) => {
          const mine = m.clientId === localClientId;
          const grouped = i > 0 && messages[i - 1].clientId === m.clientId && m.ts - messages[i - 1].ts < 120000;
          return (
            <div key={m.id} className={grouped ? '-mt-2' : ''}>
              {!grouped && (
                <div className="mb-0.5 flex items-baseline gap-2">
                  <span className="text-xs font-semibold" style={{ color: m.color }}>
                    {mine ? 'You' : m.name}
                  </span>
                  <span className="text-[10px] text-neutral-600">{timeFormat.format(m.ts)}</span>
                </div>
              )}
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-brand-text">{m.text}</p>
            </div>
          );
        })}
      </div>
      <form onSubmit={submit} className="flex gap-2 border-t border-brand-border p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message your partner…"
          maxLength={2000}
          className="min-w-0 flex-1 rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-text placeholder-neutral-600 outline-none focus:border-blue-500/60"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="rounded-lg bg-blue-600 px-3 text-white transition-colors hover:bg-blue-500 disabled:opacity-40"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </section>
  );
}
