import { FormEvent, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, GitMerge, MousePointer2, Network, Play, Sparkles, Users, Mic } from 'lucide-react';
import { parseRoomInput, sanitizeName } from '../lib/identity';
import { UserProfile } from '../types';
import Logo from './Logo';

interface LandingViewProps {
  profile: UserProfile;
  onProfileChange: (profile: UserProfile) => void;
  onCreateRoom: () => void;
  onJoinRoom: (roomId: string) => void;
}

const FEATURES = [
  {
    icon: GitMerge,
    title: 'Conflict-free sync',
    body: 'Every keystroke is a Yjs CRDT operation. Type at the same time on the same line and both edits survive, merged identically for everyone.',
  },
  {
    icon: Network,
    title: 'Browser to browser',
    body: 'WebRTC data channels carry the code straight between peers. The signaling server only makes the introduction.',
  },
  {
    icon: MousePointer2,
    title: 'Live cursors and presence',
    body: "See your partner's cursor, selection and name as they type, plus who's in the room and a synced chat.",
  },
  {
    icon: Play,
    title: 'Run it right there',
    body: 'JavaScript and TypeScript run in a sandboxed worker in your browser, with a timeout so infinite loops never hang the tab.',
  },
];

const ROADMAP = [
  { icon: Mic, label: 'Voice chat' },
  { icon: Users, label: 'Skill-based matchmaking' },
  { icon: Sparkles, label: 'AI code hints' },
];

function EditorPreview() {
  return (
    <div className="overflow-hidden rounded-xl border border-brand-border bg-[#0d0d0d] shadow-2xl shadow-blue-950/30">
      <div className="flex items-center justify-between border-b border-brand-border bg-[#111111] px-3 py-2">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-neutral-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-neutral-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-neutral-700" />
        </div>
        <span className="font-mono text-[11px] text-brand-text-muted">
          room <span className="text-blue-400">k3x9qa</span>
        </span>
        <div className="flex -space-x-1.5">
          <span className="h-5 w-5 rounded-full border-2 border-[#111111] bg-[#60a5fa]" />
          <span className="h-5 w-5 rounded-full border-2 border-[#111111] bg-[#f472b6]" />
        </div>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-6 text-neutral-300">
        <span className="text-neutral-600">1 </span> <span className="text-sky-400">function</span>{' '}
        <span className="text-amber-200">twoSum</span>(nums, target) {'{'}
        {'\n'}
        <span className="text-neutral-600">2 </span>   <span className="text-sky-400">const</span> seen ={' '}
        <span className="text-sky-400">new</span> <span className="text-emerald-300">Map</span>();
        <span className="relative inline-block h-4 w-0 border-l-2 border-[#f472b6] align-middle">
          <span className="absolute -top-4 left-0 rounded-sm bg-[#f472b6] px-1 font-sans text-[9px] font-semibold whitespace-nowrap text-black">
            Maya
          </span>
        </span>
        {'\n'}
        <span className="text-neutral-600">3 </span>   <span className="text-sky-400">for</span> (
        <span className="text-sky-400">let</span> i = <span className="text-orange-300">0</span>; i {'<'} nums.length; i++) {'{'}
        {'\n'}
        <span className="text-neutral-600">4 </span>     <span className="bg-[#60a5fa33]">
          <span className="text-sky-400">const</span> need = target - nums[i];
        </span>
        <span className="relative inline-block h-4 w-0 border-l-2 border-[#60a5fa] align-middle">
          <span className="absolute -top-4 left-0 rounded-sm bg-[#60a5fa] px-1 font-sans text-[9px] font-semibold whitespace-nowrap text-black">
            You
          </span>
        </span>
        {'\n'}
        <span className="text-neutral-600">5 </span>     <span className="text-sky-400">if</span> (seen.has(need)){' '}
        <span className="text-sky-400">return</span> [seen.get(need), i];
        {'\n'}
        <span className="text-neutral-600">6 </span>     seen.set(nums[i], i);
        {'\n'}
        <span className="text-neutral-600">7 </span>   {'}'}
        {'\n'}
        <span className="text-neutral-600">8 </span> {'}'}
      </pre>
      <div className="flex items-center gap-2 border-t border-brand-border bg-[#0a0a0a] px-3 py-1 font-mono text-[10px] text-brand-text-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Connected to 1 peer
      </div>
    </div>
  );
}

export default function LandingView({ profile, onProfileChange, onCreateRoom, onJoinRoom }: LandingViewProps) {
  const [name, setName] = useState(profile.name);
  const [joinInput, setJoinInput] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);

  const saveName = () => {
    const clean = sanitizeName(name);
    if (clean && clean !== profile.name) onProfileChange({ ...profile, name: clean });
    if (!clean) setName(profile.name);
  };

  const create = () => {
    saveName();
    onCreateRoom();
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    const id = parseRoomInput(joinInput);
    if (!id) {
      setJoinError('Enter a room code (letters and numbers) or paste a room link.');
      return;
    }
    saveName();
    onJoinRoom(id);
  };

  return (
    <div className="geometric-grid min-h-dvh">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo size="lg" />
        <a
          href="https://github.com/fenetdiriba/peercode-ai"
          target="_blank"
          rel="noreferrer"
          className="text-sm text-brand-text-muted transition-colors hover:text-white"
        >
          GitHub
        </a>
      </nav>

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="grid items-center gap-12 py-12 lg:grid-cols-2 lg:py-20">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-500/25 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-300">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
              Peer-to-peer. No server in the data path.
            </span>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Practice interviews with a partner, in one shared editor.
            </h1>
            <p className="mt-4 max-w-lg text-base leading-relaxed text-brand-text-muted">
              Spin up a room, send the link, and code together in real time with live cursors, chat, and a built-in
              runner. No accounts, no installs.
            </p>

            <div className="mt-8 max-w-md space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-brand-text-muted">Your display name</span>
                <div className="flex items-center gap-2 rounded-lg border border-brand-border bg-brand-surface px-3 focus-within:border-blue-500/60">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: profile.color }} />
                  <input
                    value={name}
                    maxLength={24}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={saveName}
                    className="h-11 w-full bg-transparent text-sm text-white outline-none"
                  />
                </div>
              </label>

              <button
                onClick={create}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
              >
                Create a room <ArrowRight className="h-4 w-4" />
              </button>

              <div className="flex items-center gap-3 text-xs text-neutral-600">
                <span className="h-px flex-1 bg-brand-border" /> or join one <span className="h-px flex-1 bg-brand-border" />
              </div>

              <form onSubmit={join}>
                <div className="flex gap-2">
                  <input
                    value={joinInput}
                    onChange={(e) => {
                      setJoinInput(e.target.value);
                      setJoinError(null);
                    }}
                    placeholder="Room code or link"
                    aria-label="Room code or link"
                    className="h-11 min-w-0 flex-1 rounded-lg border border-brand-border bg-brand-surface px-3 font-mono text-sm text-white placeholder-neutral-600 outline-none focus:border-blue-500/60"
                  />
                  <button
                    type="submit"
                    className="h-11 rounded-lg border border-brand-border bg-brand-surface-light px-4 text-sm font-medium text-white transition-colors hover:bg-neutral-700"
                  >
                    Join
                  </button>
                </div>
                {joinError && <p className="mt-2 text-xs text-rose-400">{joinError}</p>}
              </form>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="min-w-0"
          >
            <EditorPreview />
          </motion.div>
        </section>

        <section className="grid gap-4 pb-12 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border border-brand-border bg-brand-surface/60 p-5">
              <Icon className="h-5 w-5 text-blue-400" />
              <h3 className="mt-3 text-sm font-semibold text-white">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-brand-text-muted">{body}</p>
            </div>
          ))}
        </section>

        <section className="flex flex-wrap items-center gap-3 border-t border-brand-border py-8 text-sm text-brand-text-muted">
          <span className="font-medium text-neutral-400">Coming next:</span>
          {ROADMAP.map(({ icon: Icon, label }) => (
            <span key={label} className="inline-flex items-center gap-1.5 rounded-full border border-brand-border px-3 py-1 text-xs">
              <Icon className="h-3.5 w-3.5" /> {label}
            </span>
          ))}
        </section>
      </main>
    </div>
  );
}
