import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Pencil, RotateCcw, Search, Users } from 'lucide-react';
import { SKILL_LANGUAGES, SKILL_TOPICS } from '../../shared/matching.js';
import { Match, useMatchmaking } from '../hooks/useMatchmaking';
import { getLanguage } from '../lib/languages';
import { UserProfile } from '../types';
import Logo from './Logo';
import SkillChips from './SkillChips';

interface MatchViewProps {
  profile: UserProfile;
  onEditProfile: () => void;
  onMatched: (match: Match) => void;
  onBack: () => void;
}

const REDIRECT_SECONDS = 3;
const LEVEL_LABEL = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

function useSecondsSince(since: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (since === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [since]);
  return since === null ? 0 : Math.max(0, Math.floor((now - since) / 1000));
}

function Searching({ since, queueSize, onCancel }: { since: number; queueSize: number; onCancel: () => void }) {
  const seconds = useSecondsSince(since);
  const others = Math.max(0, queueSize - 1);
  return (
    <div className="flex flex-col items-center py-6 text-center">
      <div className="relative flex h-32 w-32 items-center justify-center">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="absolute inset-0 rounded-full border border-blue-400/50"
            initial={{ scale: 0.4, opacity: 0.8 }}
            animate={{ scale: 1.25, opacity: 0 }}
            transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.8, ease: 'easeOut' }}
          />
        ))}
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600/20 ring-1 ring-blue-500/40">
          <Search className="h-6 w-6 text-blue-300" />
        </span>
      </div>
      <p className="mt-6 text-base font-medium text-white">Looking for a partner…</p>
      <p className="mt-1 font-mono text-xs text-brand-text-muted">
        {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')} ·{' '}
        {others === 0 ? 'no one else in the queue yet' : `${others} other${others === 1 ? '' : 's'} in the queue`}
      </p>
      <p className="mt-3 max-w-xs text-xs leading-relaxed text-neutral-500">
        {seconds < 10
          ? 'Holding out for a close skill match first.'
          : 'Widening the search the longer you wait, so you won’t be stuck.'}
      </p>
      <button onClick={onCancel} className="mt-6 text-sm text-brand-text-muted hover:text-white">
        Cancel
      </button>
    </div>
  );
}

function Matched({ match, onGo }: { match: Match; onGo: () => void }) {
  const [left, setLeft] = useState(REDIRECT_SECONDS);
  const onGoRef = useRef(onGo);
  onGoRef.current = onGo;
  useEffect(() => {
    if (left <= 0) {
      onGoRef.current();
      return;
    }
    const id = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);

  const pct = Math.round(match.score * 100);
  const { partner, shared } = match;

  return (
    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="py-2 text-center">
      <p className="text-xs font-semibold tracking-wider text-emerald-400 uppercase">Partner found</p>
      <p className="mt-3 text-5xl font-bold tracking-tight text-white">{pct}%</p>
      <p className="mt-1 text-sm text-brand-text-muted">skill match with</p>
      <p className="mt-2 text-xl font-semibold text-white">{partner.name}</p>
      <p className="text-xs text-neutral-500">{LEVEL_LABEL[partner.level]}</p>

      <div className="mt-6 space-y-3 text-left">
        <div>
          <p className="mb-1.5 text-[11px] font-medium text-brand-text-muted">Their languages (shared in green)</p>
          <SkillChips options={SKILL_LANGUAGES} selected={partner.languages} highlight={shared.languages} />
        </div>
        <div>
          <p className="mb-1.5 text-[11px] font-medium text-brand-text-muted">Their topics (shared in green)</p>
          <SkillChips options={SKILL_TOPICS} selected={partner.topics} highlight={shared.topics} />
        </div>
      </div>

      <p className="mt-6 text-sm text-brand-text-muted">
        Opening a {getLanguage(match.language).label} room in {Math.max(left, 0)}…
      </p>
      <button
        onClick={onGo}
        className="mt-3 h-10 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
      >
        Join now
      </button>
    </motion.div>
  );
}

export default function MatchView({ profile, onEditProfile, onMatched, onBack }: MatchViewProps) {
  const { state, start, cancel } = useMatchmaking(profile);
  const skills = profile.skills;
  const busy = state.phase === 'connecting' || state.phase === 'searching';

  return (
    <div className="geometric-grid min-h-dvh">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-brand-text-muted hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <Logo />
      </nav>

      <main className="mx-auto w-full max-w-md px-4 pb-16 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-white">Find a practice partner</h1>
        <p className="mt-1 text-sm text-brand-text-muted">
          We pair you with whoever’s waiting whose skills are closest to yours, measured by cosine similarity.
        </p>

        <section className="mt-6 rounded-xl border border-brand-border bg-brand-surface/70 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-black"
                style={{ backgroundColor: profile.color }}
              >
                {profile.name.charAt(0).toUpperCase()}
              </span>
              <div>
                <p className="text-sm font-semibold text-white">{profile.name}</p>
                <p className="text-xs text-neutral-500">{skills ? LEVEL_LABEL[skills.level] : 'No skill profile yet'}</p>
              </div>
            </div>
            <button
              onClick={onEditProfile}
              disabled={busy}
              className="flex items-center gap-1 text-xs text-brand-text-muted hover:text-white disabled:opacity-40"
            >
              <Pencil className="h-3 w-3" /> Edit
            </button>
          </div>
          {skills ? (
            <div className="mt-4 space-y-2">
              <SkillChips options={SKILL_LANGUAGES} selected={skills.languages} />
              <SkillChips options={SKILL_TOPICS} selected={skills.topics} />
            </div>
          ) : (
            <p className="mt-4 text-sm text-brand-text-muted">Tell us what you know and what you want to practice.</p>
          )}
        </section>

        <section className="mt-4 rounded-xl border border-brand-border bg-brand-surface/70 p-5">
          <AnimatePresence mode="wait">
            {state.phase === 'searching' ? (
              <Searching key="searching" since={state.since} queueSize={state.queueSize} onCancel={cancel} />
            ) : state.phase === 'matched' ? (
              <Matched key="matched" match={state.match} onGo={() => onMatched(state.match)} />
            ) : (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                {state.phase === 'error' && (
                  <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                    {state.message}
                  </p>
                )}
                <button
                  onClick={skills ? start : onEditProfile}
                  disabled={state.phase === 'connecting'}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
                >
                  {state.phase === 'error' ? <RotateCcw className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                  {!skills
                    ? 'Set up your skill profile'
                    : state.phase === 'connecting'
                      ? 'Connecting…'
                      : state.phase === 'error'
                        ? 'Try again'
                        : 'Find partner'}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>
    </div>
  );
}
