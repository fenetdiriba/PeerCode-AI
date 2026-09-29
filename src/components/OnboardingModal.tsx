import { FormEvent, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { SKILL_LANGUAGES, SKILL_LEVELS, SKILL_TOPICS } from '../../shared/matching.js';
import { sanitizeName } from '../lib/identity';
import { SkillLanguage, SkillLevel, SkillTopic, UserProfile } from '../types';
import SkillChips from './SkillChips';

interface OnboardingModalProps {
  profile: UserProfile;
  onSave: (profile: UserProfile) => void;
  onClose: () => void;
}

const LEVEL_LABELS: Record<SkillLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

export default function OnboardingModal({ profile, onSave, onClose }: OnboardingModalProps) {
  const [name, setName] = useState(profile.name);
  const [languages, setLanguages] = useState<SkillLanguage[]>(profile.skills?.languages ?? []);
  const [topics, setTopics] = useState<SkillTopic[]>(profile.skills?.topics ?? []);
  const [level, setLevel] = useState<SkillLevel>(profile.skills?.level ?? 'intermediate');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const cleanName = sanitizeName(name);
  const valid = cleanName.length > 0 && languages.length > 0 && topics.length > 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onSave({ ...profile, name: cleanName, skills: { languages, topics, level } });
  };

  const levelIndex = SKILL_LEVELS.indexOf(level);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        className="relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-brand-border bg-brand-surface p-6 shadow-2xl sm:rounded-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-brand-text-muted hover:text-white"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 id="onboarding-title" className="text-lg font-semibold text-white">
          Your skill profile
        </h2>
        <p className="mt-1 text-sm text-brand-text-muted">
          We use this to pair you with someone practicing the same things. It stays in your browser until you search.
        </p>

        <label className="mt-6 block">
          <span className="mb-1.5 block text-xs font-medium text-brand-text-muted">Display name</span>
          <input
            value={name}
            maxLength={24}
            onChange={(e) => setName(e.target.value)}
            className="h-10 w-full rounded-lg border border-brand-border bg-brand-bg px-3 text-sm text-white outline-none focus:border-blue-500/60"
          />
        </label>

        <fieldset className="mt-5">
          <legend className="mb-2 text-xs font-medium text-brand-text-muted">Languages you know</legend>
          <SkillChips options={SKILL_LANGUAGES} selected={languages} onToggle={(l) => setLanguages((s) => toggle(s, l))} />
        </fieldset>

        <fieldset className="mt-5">
          <legend className="mb-2 text-xs font-medium text-brand-text-muted">Topics you want to practice</legend>
          <SkillChips options={SKILL_TOPICS} selected={topics} onToggle={(t) => setTopics((s) => toggle(s, t))} />
        </fieldset>

        <fieldset className="mt-5">
          <legend className="mb-2 text-xs font-medium text-brand-text-muted">
            Experience level: <span className="text-white">{LEVEL_LABELS[level]}</span>
          </legend>
          <input
            type="range"
            min={0}
            max={2}
            step={1}
            value={levelIndex}
            onChange={(e) => setLevel(SKILL_LEVELS[Number(e.target.value)])}
            aria-valuetext={LEVEL_LABELS[level]}
            className="w-full accent-blue-500"
          />
          <div className="mt-1 flex justify-between text-[11px] text-neutral-500">
            {SKILL_LEVELS.map((l) => (
              <span key={l}>{LEVEL_LABELS[l]}</span>
            ))}
          </div>
        </fieldset>

        <div className="mt-7 flex items-center justify-between gap-3">
          <button type="button" onClick={onClose} className="text-sm text-brand-text-muted hover:text-white">
            Skip for now
          </button>
          <button
            type="submit"
            disabled={!valid}
            className="h-10 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save profile
          </button>
        </div>
        {!valid && (
          <p className="mt-3 text-right text-xs text-neutral-500">Pick at least one language and one topic.</p>
        )}
      </motion.form>
    </div>
  );
}
