import { ArrowLeft, Clock } from 'lucide-react';
import { diffStats } from '../../shared/diff.js';
import { DebuggerState } from '../hooks/useDebugger';
import DiffView from './DiffView';

/** Center pane while time-travelling or reviewing a patch. Read-only by construction. */
export default function TimeTravelView({ dbg }: { dbg: DebuggerState }) {
  const { view, revisions, liveCode, verification } = dbg;
  const back = (
    <button
      onClick={() => dbg.setView({ kind: 'live' })}
      className="ml-auto flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 font-semibold text-white hover:bg-blue-500"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Return to live editor
    </button>
  );

  if (view.kind === 'patch') {
    if (verification.status !== 'done') return null;
    const stats = diffStats(verification.sourceCode, verification.patchedCode);
    return (
      <DiffView
        key={dbg.challenge?.id}
        original={verification.sourceCode}
        modified={verification.patchedCode}
        language={dbg.challenge?.language ?? 'typescript'}
        header={
          <>
            <span className="rounded bg-violet-500/20 px-1.5 py-0.5 font-semibold text-violet-200">Patch review · read-only</span>
            <span className="text-neutral-300">code the patch was verified against → patched candidate</span>
            <span className="font-mono text-emerald-400">+{stats.added}</span>
            <span className="font-mono text-rose-400">−{stats.removed}</span>
            {back}
          </>
        }
      />
    );
  }

  if (view.kind !== 'revision') return null;
  const index = revisions.findIndex((r) => r.id === view.revisionId);
  const rev = revisions[index];
  if (!rev) return null;

  let baseLabel: string;
  let baseCode: string;
  if (view.compareTo === 'live') {
    baseLabel = 'live code';
    baseCode = liveCode;
  } else if (view.compareTo === 'previous') {
    const prev = revisions[index - 1];
    baseLabel = prev ? `#${prev.sequenceNumber} ${prev.label}` : '(empty, first checkpoint)';
    baseCode = prev?.sourceCode ?? '';
  } else {
    const other = revisions.find((r) => r.id === view.compareTo);
    baseLabel = other ? `#${other.sequenceNumber} ${other.label}` : '(missing)';
    baseCode = other?.sourceCode ?? '';
  }
  const stats = diffStats(baseCode, rev.sourceCode);

  return (
    <DiffView
      key={dbg.challenge?.id}
      original={baseCode}
      modified={rev.sourceCode}
      language={dbg.challenge?.language ?? 'typescript'}
      header={
        <>
          <span className="flex items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 font-semibold text-amber-200">
            <Clock className="h-3 w-3" />
            Time travel · read-only
          </span>
          <label className="flex items-center gap-1.5 text-neutral-400">
            compare
            <select
              value={view.compareTo}
              onChange={(e) => dbg.setView({ ...view, compareTo: e.target.value })}
              className="rounded border border-brand-border bg-brand-bg px-1.5 py-0.5 text-neutral-200"
              aria-label="Compare with"
            >
              <option value="previous">previous checkpoint</option>
              <option value="live">live code</option>
              {revisions
                .filter((r) => r.id !== rev.id)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    #{r.sequenceNumber} {r.label}
                  </option>
                ))}
            </select>
          </label>
          <span className="text-neutral-500">{baseLabel}</span>
          <span className="text-neutral-500">→</span>
          <span className="font-medium text-neutral-100">
            #{rev.sequenceNumber} {rev.label}
          </span>
          <span className="font-mono text-emerald-400">+{stats.added}</span>
          <span className="font-mono text-rose-400">−{stats.removed}</span>
          {back}
        </>
      }
    />
  );
}
