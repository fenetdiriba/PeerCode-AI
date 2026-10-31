import { ReactNode, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Crosshair,
  Eye,
  GitMerge,
  Loader2,
  RefreshCw,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';
import { DebuggerState } from '../hooks/useDebugger';
import { CaseResult, TestRun } from '../lib/debugger';

const fmt = (v: unknown) => (v === undefined ? 'undefined' : JSON.stringify(v));

function Section({ step, title, children, active }: { step: number; title: string; children: ReactNode; active: boolean }) {
  return (
    <section className={`border-b border-brand-border px-3 py-3 ${active ? '' : 'opacity-60'}`}>
      <h3 className="mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-wider text-neutral-400 uppercase">
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/10 font-mono text-[10px] text-neutral-200">{step}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Button({ onClick, disabled, busy, icon, children, tone = 'blue' }: {
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  icon: ReactNode;
  children: ReactNode;
  tone?: 'blue' | 'violet' | 'emerald' | 'neutral';
}) {
  const tones = {
    blue: 'bg-blue-600 hover:bg-blue-500 text-white',
    violet: 'bg-violet-600 hover:bg-violet-500 text-white',
    emerald: 'bg-emerald-600 hover:bg-emerald-500 text-white',
    neutral: 'border border-brand-border text-neutral-200 hover:bg-white/5',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${tones[tone]}`}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      {children}
    </button>
  );
}

function CaseList({ cases }: { cases: CaseResult[] }) {
  return (
    <ul className="space-y-1 font-mono text-[11px]">
      {cases.map((c) => (
        <li key={c.name} className="flex gap-1.5">
          {c.status === 'passed' ? (
            <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-400" />
          ) : (
            <XCircle className={`mt-px h-3.5 w-3.5 shrink-0 ${c.status === 'error' ? 'text-amber-400' : 'text-rose-400'}`} />
          )}
          <div className="min-w-0">
            <div className="text-neutral-200">{c.name}</div>
            {c.status !== 'passed' && (
              <div className="text-neutral-500">
                expected <span className="text-emerald-300">{fmt(c.expected)}</span>,{' '}
                {c.error ? <span className="text-amber-300">{c.error}</span> : <>got <span className="text-rose-300">{fmt(c.actual)}</span></>}
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function RunSummaryLine({ run }: { run: TestRun }) {
  if (run.status === 'error') {
    return (
      <p className="text-xs text-amber-300">
        {run.errorKind === 'timeout' ? 'Timed out' : run.errorKind === 'compile' ? 'Compile error' : run.errorKind === 'infrastructure' ? 'Test infrastructure error' : 'Run error'}
        {run.message ? `: ${run.message}` : ''}
      </p>
    );
  }
  return (
    <p className={`text-xs ${run.status === 'passed' ? 'text-emerald-300' : 'text-rose-300'}`}>
      {run.passed}/{run.total} tests passed · {run.durationMs}ms
    </p>
  );
}

const FLOW = ['Checkpoint', 'Locate', 'Explain', 'Verify', 'Apply'];

export default function DebuggerPanel({ dbg }: { dbg: DebuggerState }) {
  const { challenge, ai, report, analysis, verification, decision, busy, revisions } = dbg;
  const [showTests, setShowTests] = useState(false);
  const found = report?.outcome === 'found';
  const blocked = 'reason' in decision ? decision : null;
  const rev = (id: string | null) => revisions.find((r) => r.id === id);
  const stage = verification.status === 'done' ? 4 : analysis ? 3 : found ? 2 : revisions.length >= 2 ? 1 : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="border-b border-brand-border px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-1 text-[10px] font-medium">
          {FLOW.map((s, i) => (
            <span key={s} className="flex items-center gap-1">
              <span className={`rounded px-1.5 py-0.5 ${i <= stage ? 'bg-sky-500/20 text-sky-200' : 'bg-white/5 text-neutral-500'}`}>{s}</span>
              {i < FLOW.length - 1 && <ChevronRight className="h-3 w-3 text-neutral-600" />}
            </span>
          ))}
        </div>
      </div>

      {dbg.serverError && (
        <div className="m-3 rounded-md border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-200">Debugger server unavailable: {dbg.serverError}</div>
      )}
      {dbg.error && (
        <div className="m-3 flex gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-200" role="alert">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{dbg.error.message}</span>
          <button onClick={dbg.dismissError} aria-label="Dismiss"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}
      {dbg.notice && (
        <div className="m-3 flex gap-2 rounded-md border border-sky-500/40 bg-sky-500/10 p-2 text-xs text-sky-100">
          <span className="flex-1">{dbg.notice}</span>
          <button onClick={dbg.dismissNotice} aria-label="Dismiss"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {challenge && (
        <div className="border-b border-brand-border px-3 py-3">
          {dbg.challenges.length > 1 && (
            <select
              value={challenge.id}
              onChange={(e) => dbg.selectChallenge(e.target.value)}
              disabled={busy !== null}
              className="mb-2 w-full rounded-md border border-brand-border bg-brand-bg px-2 py-1 text-xs text-neutral-200"
              aria-label="Challenge"
            >
              {dbg.challenges.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.language === 'typescript' ? 'TypeScript' : 'JavaScript'})
                </option>
              ))}
            </select>
          )}
          <p className="text-sm font-semibold text-white">{challenge.title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-brand-text-muted">{challenge.description}</p>
          <button onClick={() => setShowTests((s) => !s)} className="mt-1.5 flex items-center gap-1 text-[11px] text-sky-300 hover:text-sky-200">
            {showTests ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {challenge.tests.length} predefined tests ({challenge.language === 'typescript' ? 'TypeScript' : 'JavaScript'} file)
          </button>
          {showTests && (
            <>
              <p className="mt-1.5 text-[11px] leading-relaxed text-neutral-500">{challenge.testNotes}</p>
              <ul className="mt-1.5 space-y-1 font-mono text-[11px] text-neutral-400">
                {challenge.tests.map((t) => (
                  <li key={t.name} className="break-words">
                    <span className="text-neutral-200">{t.name}</span>
                    <br />
                    {t.fn}({t.args.map(fmt).join(', ')}) → {fmt(t.expected)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <Section step={1} title="Locate regression" active>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button onClick={() => dbg.locate()} busy={busy === 'locate'} disabled={busy !== null || revisions.length < 2} icon={<Crosshair className="h-3.5 w-3.5" />}>
            Locate regression
          </Button>
          <button
            onClick={() => dbg.locate('linear')}
            disabled={busy !== null || revisions.length < 2}
            className="rounded-md px-2 py-1.5 text-[11px] text-brand-text-muted hover:bg-white/5 hover:text-white disabled:opacity-40"
            title="Test every checkpoint. Slower, but detects pass/fail flips that bisection can skip over."
          >
            Full scan
          </button>
        </div>
        {revisions.length < 2 && <p className="mt-1.5 text-[11px] text-brand-text-muted">Needs at least two checkpoints.</p>}
        {report && (
          <div className="mt-2.5 space-y-2 rounded-md border border-brand-border bg-black/30 p-2.5">
            <p className={`text-xs ${found ? 'text-neutral-100' : 'text-amber-200'}`}>{report.message}</p>
            {found && (
              <>
                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  <div className="rounded bg-emerald-500/10 p-1.5">
                    <div className="text-emerald-300">last passing</div>
                    <div className="truncate text-neutral-200">#{rev(report.lastPassingRevisionId)?.sequenceNumber} {rev(report.lastPassingRevisionId)?.label}</div>
                  </div>
                  <div className="rounded bg-rose-500/10 p-1.5">
                    <div className="text-rose-300">first observed failing</div>
                    <div className="truncate text-neutral-200">#{rev(report.firstFailingRevisionId)?.sequenceNumber} {rev(report.firstFailingRevisionId)?.label}</div>
                  </div>
                </div>
                <button
                  onClick={() => dbg.setView({ kind: 'revision', revisionId: report.firstFailingRevisionId!, compareTo: report.lastPassingRevisionId! })}
                  className="flex items-center gap-1 text-[11px] text-sky-300 hover:text-sky-200"
                >
                  <Eye className="h-3 w-3" /> Show the diff that introduced the failure
                </button>
                {report.nonMonotonic && (
                  <p className="text-[11px] text-amber-300">
                    Outcomes were not monotonic: some earlier checkpoints also failed. This is where the failure that persists to the latest checkpoint first appears.
                  </p>
                )}
                {report.firstFailingRun && <CaseList cases={report.firstFailingRun.cases.filter((c) => c.status !== 'passed')} />}
              </>
            )}
            <p className="font-mono text-[10px] text-neutral-500">
              {report.strategy} · tested {report.testsRun} of {report.revisionsInRange} checkpoints · {report.executedRuns} fresh run{report.executedRuns === 1 ? '' : 's'}
              {report.executedRuns < report.testsRun ? ' (rest cached by code hash)' : ''} · {report.durationMs}ms
            </p>
            {found && report.strategy === 'bisect+verify' && report.testsRun < report.revisionsInRange && (
              <p className="text-[10px] text-neutral-500">
                Bisection skipped {report.revisionsInRange - report.testsRun} earlier checkpoint{report.revisionsInRange - report.testsRun === 1 ? '' : 's'}, so a temporary failure there would go unnoticed. Use Full scan to test them all.
              </p>
            )}
            <p className="text-[10px] text-neutral-500">A failing test shows where behavior changed, not which line is at fault. The diff narrows it down.</p>
          </div>
        )}
      </Section>

      <Section step={2} title="Explain with Meta AI" active={found}>
        {ai && !ai.available && (
          <p className="mb-2 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-200">
            Meta AI analysis is unavailable: the server has no MODEL_API_KEY. Detection and verification still work.
          </p>
        )}
        <Button
          onClick={dbg.analyze}
          tone="violet"
          busy={busy === 'analyze'}
          disabled={!found || busy !== null || !ai?.available}
          icon={<Bot className="h-3.5 w-3.5" />}
        >
          Analyze & generate fix
        </Button>
        {busy === 'analyze' && <p className="mt-1.5 text-[11px] text-brand-text-muted">Asking {ai?.model}…</p>}
        {analysis && (
          <div className="mt-2.5 space-y-2 rounded-md border border-violet-500/30 bg-violet-500/[0.06] p-2.5 text-xs">
            <p className="font-mono text-[10px] text-violet-300">
              model: {analysis.model} · {analysis.latencyMs}ms · {analysis.usage.totalTokens} tokens · {analysis.responseFormat}
              {analysis.schemaFallback ? ' (schema rejected, fell back)' : ''}{analysis.attempts > 1 ? ` · ${analysis.attempts} attempts` : ''}
            </p>
            {(
              [
                ['What failed', analysis.analysis.failedBehavior],
                ['What changed', analysis.analysis.whatChanged],
                ['Probable root cause', analysis.analysis.probableRootCause],
                ['Why', analysis.analysis.explanation],
                ['Uncertainty', analysis.analysis.confidenceNotes],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <div className="text-[10px] font-semibold tracking-wider text-violet-300/80 uppercase">{k}</div>
                <p className="leading-relaxed text-neutral-200">{v}</p>
              </div>
            ))}
            <div>
              <div className="text-[10px] font-semibold tracking-wider text-violet-300/80 uppercase">Proposed patch</div>
              {analysis.analysis.edits.map((e, i) => (
                <pre key={i} className="mt-1 overflow-x-auto rounded bg-black/40 p-1.5 font-mono text-[11px] leading-relaxed">
                  {e.find.split('\n').map((l, j) => <div key={`f${j}`} className="text-rose-300">- {l}</div>)}
                  {e.replace.split('\n').map((l, j) => <div key={`r${j}`} className="text-emerald-300">+ {l}</div>)}
                </pre>
              ))}
            </div>
          </div>
        )}
      </Section>

      <Section step={3} title="Verify patch" active={Boolean(analysis)}>
        <VerificationStatus dbg={dbg} />
      </Section>

      <Section step={4} title="Review & apply" active={verification.status === 'done'}>
        <div className="flex flex-wrap gap-1.5">
          <Button onClick={() => dbg.setView({ kind: 'patch' })} tone="neutral" disabled={verification.status !== 'done'} icon={<Eye className="h-3.5 w-3.5" />}>
            Review patch
          </Button>
          <Button onClick={dbg.apply} tone="emerald" busy={busy === 'apply'} disabled={!decision.ok || busy !== null} icon={<GitMerge className="h-3.5 w-3.5" />}>
            Apply verified patch
          </Button>
        </div>
        {blocked && verification.status === 'done' && (
          <div className={`mt-2 rounded border p-2 text-[11px] ${blocked.reason === 'conflict' ? 'border-amber-500/40 bg-amber-500/10 text-amber-200' : 'border-brand-border text-brand-text-muted'}`}>
            {blocked.message}
            {blocked.reason === 'conflict' && (
              <div className="mt-1.5">
                <Button onClick={dbg.reverifyLive} tone="neutral" icon={<RefreshCw className="h-3.5 w-3.5" />}>
                  Re-verify against live code
                </Button>
              </div>
            )}
          </div>
        )}
        <p className="mt-2 text-[10px] text-neutral-500">Applying edits the shared document for everyone in the room and saves a new checkpoint. Nothing is applied automatically.</p>
      </Section>
    </div>
  );
}

function VerificationStatus({ dbg }: { dbg: DebuggerState }) {
  const { verification, analysis } = dbg;
  if (!analysis) return <p className="text-[11px] text-brand-text-muted">The candidate patch is applied to an isolated copy and the real tests run against it.</p>;

  const badge = (cls: string, icon: ReactNode, text: string) => (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold ${cls}`}>
      {icon}
      {text}
    </span>
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {badge('bg-violet-500/15 text-violet-200', <Bot className="h-3 w-3" />, 'Candidate generated')}
        {verification.status === 'running' && badge('bg-sky-500/15 text-sky-200', <Loader2 className="h-3 w-3 animate-spin" />, 'Verification running')}
        {verification.status === 'done' && verification.run.status === 'passed' && badge('bg-emerald-500/15 text-emerald-200', <ShieldCheck className="h-3 w-3" />, 'Tests passed')}
        {verification.status === 'done' && verification.run.status === 'failed' && badge('bg-rose-500/15 text-rose-200', <XCircle className="h-3 w-3" />, 'Tests failed')}
        {(verification.status === 'error' || (verification.status === 'done' && verification.run.status === 'error')) &&
          badge('bg-amber-500/15 text-amber-200', <AlertTriangle className="h-3 w-3" />, 'Verification error')}
      </div>
      {verification.status === 'error' && <p className="text-xs text-amber-300">{verification.message}</p>}
      {verification.status === 'done' && (
        <>
          <RunSummaryLine run={verification.run} />
          <CaseList cases={verification.run.cases} />
          {verification.run.status === 'passed' && (
            <p className="text-[10px] text-neutral-500">
              All {verification.run.total} predefined tests passed on the patched copy. That shows the patch fixes these cases, not that it is correct for every input.
            </p>
          )}
          {verification.run.status === 'failed' && <p className="text-[11px] text-rose-300">The proposed fix did not pass verification and can't be applied. Try analyzing again.</p>}
        </>
      )}
    </div>
  );
}
