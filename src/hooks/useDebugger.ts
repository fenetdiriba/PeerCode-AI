import { useCallback, useEffect, useMemo, useState } from 'react';
import { applyDecision } from '../../shared/patch-safety.js';
import { minimalReplacement } from '../lib/ai';
import { RoomSession } from '../lib/collab';
import {
  AnalyzeResponse,
  ApiError,
  Challenge,
  CodeRevision,
  debuggerApi,
  RegressionReport,
  TestRun,
} from '../lib/debugger';
import { LanguageId } from '../types';

/** What the center pane shows. Time travel and patch review never touch the live document. */
export type CenterView =
  | { kind: 'live' }
  | { kind: 'revision'; revisionId: string; compareTo: 'previous' | 'live' | string }
  | { kind: 'patch' };

export type RunSummary = Pick<TestRun, 'status' | 'errorKind' | 'passed' | 'total'> & { run?: TestRun };

export type VerificationState =
  | { status: 'idle' }
  | { status: 'running'; sourceCode: string }
  | { status: 'done'; sourceCode: string; patchedCode: string; run: TestRun }
  | { status: 'error'; sourceCode: string; message: string };

const TIMELINE_KEY = 'timelineVersion';
/** The room's active debugging challenge, shared so collaborators work on the same one. */
const CHALLENGE_KEY = 'challengeId';

/**
 * State and actions for the time-travel debugger in one room. Checkpoints live on the server;
 * a counter in the shared Y.Doc tells collaborators when to refetch, so everyone's timeline
 * updates when anyone checkpoints.
 */
export function useDebugger(roomId: string, session: RoomSession | null, authorName: string, setLanguage: (l: LanguageId) => void) {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [ai, setAi] = useState<{ available: boolean; model: string } | null>(null);
  const [allRevisions, setAllRevisions] = useState<CodeRevision[]>([]);
  const [runs, setRuns] = useState<Record<string, RunSummary>>({});
  const [report, setReport] = useState<RegressionReport | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [verification, setVerification] = useState<VerificationState>({ status: 'idle' });
  const [view, setView] = useState<CenterView>({ kind: 'live' });
  const [busy, setBusy] = useState<null | 'checkpoint' | 'demo' | 'locate' | 'analyze' | 'apply' | `test:${string}`>(null);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [liveCode, setLiveCode] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);

  const challenge = useMemo(() => challenges.find((c) => c.id === challengeId) ?? challenges[0] ?? null, [challenges, challengeId]);
  // The timeline shows only the active challenge's checkpoints.
  const revisions = useMemo(() => allRevisions.filter((r) => r.challengeId === challenge?.id), [allRevisions, challenge]);
  const ytext = useMemo(() => (session && challenge ? session.getCode(challenge.language) : null), [session, challenge]);

  useEffect(() => {
    debuggerApi
      .challenges()
      .then(({ challenges, ai }) => {
        setChallenges(challenges);
        setAi(ai);
        setServerError(null);
      })
      .catch((e: Error) => setServerError(e.message));
  }, []);

  // Track the live code so conflict warnings react to collaborators' edits.
  useEffect(() => {
    if (!ytext) return;
    const update = () => setLiveCode(ytext.toString());
    ytext.observe(update);
    update();
    return () => ytext.unobserve(update);
  }, [ytext]);

  const refresh = useCallback(async () => {
    try {
      const { revisions } = await debuggerApi.listRevisions(roomId);
      setAllRevisions(revisions);
      setServerError(null);
    } catch (e) {
      setServerError((e as Error).message);
    }
  }, [roomId]);

  useEffect(() => {
    if (!session) return;
    const meta = session.meta;
    const onMeta = (e: { keysChanged: Set<string> }) => {
      if (e.keysChanged.has(TIMELINE_KEY)) refresh();
      if (e.keysChanged.has(CHALLENGE_KEY)) setChallengeId((meta.get(CHALLENGE_KEY) as string | undefined) ?? null);
    };
    meta.observe(onMeta);
    setChallengeId((meta.get(CHALLENGE_KEY) as string | undefined) ?? null);
    refresh();
    return () => meta.unobserve(onMeta);
  }, [session, refresh]);

  const announceTimelineChange = useCallback(() => {
    session?.meta.set(TIMELINE_KEY, ((session.meta.get(TIMELINE_KEY) as number) ?? 0) + 1);
  }, [session]);

  const fail = (e: unknown) => {
    const err = e as ApiError;
    setError({ message: err.message, code: err.code });
  };

  const replaceLive = useCallback(
    (next: string) => {
      if (!session || !ytext) return;
      const before = ytext.toString();
      const { start, end, text } = minimalReplacement(before, next);
      session.doc.transact(() => {
        if (end > start) ytext.delete(start, end - start);
        if (text) ytext.insert(start, text);
      });
    },
    [session, ytext],
  );

  /** Anything derived from the old timeline (report, analysis, verification) is now stale. */
  const resetPipeline = () => {
    setReport(null);
    setAnalysis(null);
    setVerification({ status: 'idle' });
  };

  useEffect(() => {
    resetPipeline();
    setView({ kind: 'live' });
    setError(null);
  }, [challenge?.id]);

  const selectChallenge = useCallback(
    (id: string) => {
      const next = challenges.find((c) => c.id === id);
      if (!session || !next) return;
      session.meta.set(CHALLENGE_KEY, id);
      setLanguage(next.language);
    },
    [session, challenges, setLanguage],
  );

  const checkpoint = useCallback(
    async (label: string) => {
      if (!challenge || !ytext) return;
      setBusy('checkpoint');
      setError(null);
      try {
        await debuggerApi.createRevision(roomId, { sourceCode: ytext.toString(), label: label || 'Checkpoint', author: authorName, challengeId: challenge.id });
        resetPipeline();
        announceTimelineChange();
        await refresh();
      } catch (e) {
        fail(e);
      } finally {
        setBusy(null);
      }
    },
    [challenge, ytext, roomId, authorName, announceTimelineChange, refresh],
  );

  /**
   * Replay the scripted two-developer history through the live editor, checkpointing each
   * step through the normal API. Nothing about the results is scripted: tests, localization
   * and analysis all run for real afterwards.
   */
  const loadDemo = useCallback(async () => {
    if (!challenge || !ytext) return;
    setBusy('demo');
    setError(null);
    setLanguage(challenge.language);
    try {
      await debuggerApi.clearRevisions(roomId, challenge.id);
      setRuns({});
      resetPipeline();
      setView({ kind: 'live' });
      for (const step of challenge.demoSteps) {
        replaceLive(step.code);
        await debuggerApi.createRevision(roomId, { sourceCode: step.code, label: step.label, author: step.author, challengeId: challenge.id });
      }
      announceTimelineChange();
      await refresh();
      setNotice(`Loaded ${challenge.demoSteps.length} checkpoints. Something broke along the way. Locate the regression.`);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }, [challenge, ytext, roomId, setLanguage, replaceLive, announceTimelineChange, refresh]);

  const insertStarter = useCallback(() => {
    if (!challenge) return;
    setLanguage(challenge.language);
    replaceLive(challenge.starterCode);
  }, [challenge, setLanguage, replaceLive]);

  const testRevision = useCallback(
    async (revisionId: string) => {
      setBusy(`test:${revisionId}`);
      setError(null);
      try {
        const { run } = await debuggerApi.testRevision(roomId, revisionId);
        setRuns((r) => ({ ...r, [revisionId]: { ...run, run } }));
      } catch (e) {
        fail(e);
      } finally {
        setBusy(null);
      }
    },
    [roomId],
  );

  const locate = useCallback(async (strategy: RegressionReport['strategy'] = 'bisect+verify') => {
    if (!challenge) return;
    setBusy('locate');
    setError(null);
    resetPipeline();
    try {
      const { report } = await debuggerApi.locateRegression(roomId, { challengeId: challenge.id, strategy });
      setReport(report);
      setRuns((prev) => {
        const next = { ...prev };
        for (const o of report.observations) next[o.revisionId] = { ...next[o.revisionId], ...o, run: next[o.revisionId]?.run };
        if (report.firstFailingRevisionId && report.firstFailingRun) {
          next[report.firstFailingRevisionId] = { ...report.firstFailingRun, run: report.firstFailingRun };
        }
        return next;
      });
      if (report.outcome === 'found' && report.firstFailingRevisionId && report.lastPassingRevisionId) {
        setView({ kind: 'revision', revisionId: report.firstFailingRevisionId, compareTo: report.lastPassingRevisionId });
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }, [roomId, challenge]);

  const verify = useCallback(
    async (edits: AnalyzeResponse['analysis']['edits'], sourceCode: string) => {
      if (!challenge) return;
      setVerification({ status: 'running', sourceCode });
      try {
        const res = await debuggerApi.verify({ challengeId: challenge.id, sourceCode, edits });
        setVerification({ status: 'done', sourceCode, patchedCode: res.patchedCode, run: res.run });
      } catch (e) {
        setVerification({ status: 'error', sourceCode, message: (e as Error).message });
      }
    },
    [challenge],
  );

  const analyze = useCallback(async () => {
    if (!report?.lastPassingRevisionId || !report.firstFailingRevisionId || !ytext) return;
    setBusy('analyze');
    setError(null);
    setAnalysis(null);
    setVerification({ status: 'idle' });
    const currentCode = ytext.toString();
    try {
      const res = await debuggerApi.analyze(roomId, {
        lastPassingId: report.lastPassingRevisionId,
        firstFailingId: report.firstFailingRevisionId,
        currentCode,
      });
      setAnalysis(res);
      setBusy(null);
      await verify(res.analysis.edits, currentCode);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }, [report, ytext, roomId, verify]);

  const reverifyLive = useCallback(() => {
    if (analysis && ytext) verify(analysis.analysis.edits, ytext.toString());
  }, [analysis, ytext, verify]);

  const decision = useMemo(
    () =>
      applyDecision({
        liveCode,
        sourceCode: verification.status === 'idle' ? '' : verification.sourceCode,
        runStatus: verification.status === 'done' ? verification.run.status : null,
      }),
    [liveCode, verification],
  );

  const apply = useCallback(async () => {
    if (verification.status !== 'done' || !ytext || !challenge) return;
    // Re-check at click time against the document itself, not React state.
    const check = applyDecision({ liveCode: ytext.toString(), sourceCode: verification.sourceCode, runStatus: verification.run.status });
    if ('message' in check) {
      setError({ message: check.message });
      return;
    }
    setBusy('apply');
    setError(null);
    try {
      replaceLive(verification.patchedCode);
      setView({ kind: 'live' });
      await debuggerApi.createRevision(roomId, {
        sourceCode: verification.patchedCode,
        label: `Apply verified patch (${analysis?.model ?? 'AI'})`,
        author: authorName,
        challengeId: challenge.id,
      });
      setAnalysis(null);
      setVerification({ status: 'idle' });
      setReport(null);
      announceTimelineChange();
      await refresh();
      setNotice('Patch applied and checkpointed. Run tests on the new checkpoint to confirm.');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }, [verification, ytext, challenge, replaceLive, roomId, analysis, authorName, announceTimelineChange, refresh]);

  return {
    challenge,
    challenges,
    selectChallenge,
    ai,
    serverError,
    revisions,
    runs,
    report,
    analysis,
    verification,
    decision,
    liveCode,
    view,
    setView,
    busy,
    error,
    notice,
    dismissError: () => setError(null),
    dismissNotice: () => setNotice(null),
    checkpoint,
    loadDemo,
    insertStarter,
    testRevision,
    locate,
    analyze,
    reverifyLive,
    apply,
  };
}

export type DebuggerState = ReturnType<typeof useDebugger>;
