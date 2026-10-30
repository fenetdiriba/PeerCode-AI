import { FormEvent, useState } from 'react';
import { Bookmark, FlaskConical, History, Loader2, Play, RotateCcw } from 'lucide-react';
import { DebuggerState, RunSummary } from '../hooks/useDebugger';

const STATUS_STYLE: Record<RunSummary['status'], string> = {
  passed: 'bg-emerald-400',
  failed: 'bg-rose-500',
  error: 'bg-amber-400',
};

function statusText(r: RunSummary | undefined) {
  if (!r) return 'not tested';
  if (r.status === 'error') return r.errorKind ?? 'error';
  return `${r.passed}/${r.total} passed`;
}

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Left rail: every checkpoint in order. Selecting one opens it read-only (time travel). */
export default function TimelinePanel({ dbg }: { dbg: DebuggerState }) {
  const [label, setLabel] = useState('');
  const { revisions, runs, report, view, busy } = dbg;
  const selectedId = view.kind === 'revision' ? view.revisionId : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    dbg.checkpoint(label.trim());
    setLabel('');
  };

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-brand-border bg-[#111111]">
      <div className="flex items-center gap-2 border-b border-brand-border px-3 py-2.5">
        <History className="h-4 w-4 text-sky-400" />
        <span className="text-xs font-semibold tracking-wider text-neutral-300 uppercase">Timeline</span>
        <span className="ml-auto font-mono text-[11px] text-brand-text-muted">{revisions.length}</span>
      </div>

      <form onSubmit={submit} className="flex gap-1.5 border-b border-brand-border p-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Checkpoint label"
          maxLength={120}
          className="min-w-0 flex-1 rounded-md border border-brand-border bg-brand-bg px-2 py-1 text-xs text-brand-text outline-none placeholder:text-neutral-600 focus:border-sky-500/60"
          aria-label="Checkpoint label"
        />
        <button
          type="submit"
          disabled={busy !== null || !dbg.challenge}
          className="flex items-center gap-1 rounded-md bg-sky-600 px-2 py-1 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
          title="Save the live code as a checkpoint"
        >
          {busy === 'checkpoint' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bookmark className="h-3.5 w-3.5" />}
          Save
        </button>
      </form>

      <ol className="min-h-0 flex-1 overflow-y-auto py-1">
        {revisions.length === 0 && (
          <li className="px-3 py-4 text-xs leading-relaxed text-brand-text-muted">
            No checkpoints yet. Save one above, or load the demo scenario to replay a two-developer history with a hidden regression.
          </li>
        )}
        {revisions.map((rev) => {
          const r = runs[rev.id];
          const isFirstFail = report?.firstFailingRevisionId === rev.id;
          const isLastPass = report?.lastPassingRevisionId === rev.id;
          return (
            <li key={rev.id} className="group relative">
              <button
                onClick={() => dbg.setView({ kind: 'revision', revisionId: rev.id, compareTo: 'previous' })}
                className={`flex w-full gap-2.5 px-3 py-2 text-left transition-colors hover:bg-white/5 ${selectedId === rev.id ? 'bg-sky-500/10' : ''} ${isFirstFail ? 'ring-1 ring-rose-500/60 ring-inset' : ''}`}
              >
                <div className="flex flex-col items-center pt-1">
                  <span className={`h-2.5 w-2.5 rounded-full ${r ? STATUS_STYLE[r.status] : 'border border-neutral-600'}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-mono text-[11px] text-brand-text-muted">#{rev.sequenceNumber}</span>
                    <span className="truncate text-xs font-medium text-neutral-100">{rev.label || 'Checkpoint'}</span>
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-brand-text-muted">
                    {rev.author || 'unknown'} · {time(rev.createdAt)}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px]">
                    <span className={r?.status === 'passed' ? 'text-emerald-400' : r?.status === 'failed' ? 'text-rose-400' : r ? 'text-amber-300' : 'text-neutral-500'}>
                      {statusText(r)}
                    </span>
                    {isLastPass && <span className="rounded bg-emerald-500/15 px-1 text-emerald-300">last pass</span>}
                    {isFirstFail && <span className="rounded bg-rose-500/20 px-1 text-rose-300">first fail</span>}
                  </div>
                </div>
              </button>
              <button
                onClick={() => dbg.testRevision(rev.id)}
                disabled={busy !== null}
                className="absolute top-2 right-2 rounded p-1 text-brand-text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/10 hover:text-white focus:opacity-100 disabled:opacity-30"
                title="Run tests on this checkpoint"
                aria-label={`Run tests on checkpoint ${rev.sequenceNumber}`}
              >
                {busy === `test:${rev.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="space-y-1.5 border-t border-brand-border p-2">
        <button
          onClick={() => {
            if (revisions.length === 0 || window.confirm('Replace this room’s timeline and code with the demo scenario? Everyone in the room will see it.')) dbg.loadDemo();
          }}
          disabled={busy !== null || !dbg.challenge}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-violet-500/40 bg-violet-600/15 px-2 py-1.5 text-xs font-semibold text-violet-200 hover:bg-violet-600/30 disabled:opacity-50"
        >
          {busy === 'demo' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />}
          Load demo scenario
        </button>
        <button
          onClick={dbg.insertStarter}
          disabled={busy !== null || !dbg.challenge}
          className="flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-brand-text-muted hover:bg-white/5 hover:text-white disabled:opacity-50"
          title="Put the challenge's working starter code into the editor"
        >
          <RotateCcw className="h-3 w-3" />
          Reset editor to starter code
        </button>
      </div>
    </aside>
  );
}
