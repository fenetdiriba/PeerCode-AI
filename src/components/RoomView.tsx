import { useCallback, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  History,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Share2,
  Sparkles,
} from 'lucide-react';
import { useDebugger } from '../hooks/useDebugger';
import { useRoom } from '../hooks/useRoom';
import { takePendingRoomLanguage } from '../lib/identity';
import { getLanguage, LANGUAGES } from '../lib/languages';
import { runCode } from '../lib/runner';
import { LanguageId, RunResult, UserProfile } from '../types';
import ChatPanel from './ChatPanel';
import CodeEditor from './CodeEditor';
import DebuggerPanel from './DebuggerPanel';
import Logo from './Logo';
import OutputPanel from './OutputPanel';
import PresencePanel from './PresencePanel';
import StatusBar from './StatusBar';
import TimelinePanel from './TimelinePanel';
import TimeTravelView from './TimeTravelView';

interface RoomViewProps {
  roomId: string;
  profile: UserProfile;
  onProfileChange: (profile: UserProfile) => void;
  onLeave: () => void;
}

function useCopied() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (key: string, text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
    });
  };
  return { copied, copy };
}

export default function RoomView({ roomId, profile, onProfileChange, onLeave }: RoomViewProps) {
  const [initialLanguage] = useState(() => {
    const pending = takePendingRoomLanguage(roomId);
    return pending ? getLanguage(pending).id : undefined;
  });
  const { session, peers, remoteCount, status, connection, language, setLanguage, messages, sendMessage } = useRoom(
    roomId,
    profile,
    initialLanguage,
  );
  const [sidebarOpen, setSidebarOpen] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  const [outputOpen, setOutputOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [aiOpenSignal, setAiOpenSignal] = useState(0);
  const [debugMode, setDebugMode] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  const [sideTab, setSideTab] = useState<'debugger' | 'people'>('debugger');
  const { copied, copy } = useCopied();
  const dbg = useDebugger(roomId, session, profile.name, setLanguage);
  const showDebugger = debugMode && sidebarOpen && sideTab === 'debugger';

  const lang = getLanguage(language);

  const run = useCallback(async () => {
    if (!session || running) return;
    setOutputOpen(true);
    if (!lang.runnable) {
      setResult(null);
      setNotice(`Running ${lang.label} in the browser isn't supported yet. JavaScript and TypeScript run locally in a sandboxed worker.`);
      return;
    }
    setNotice(null);
    setRunning(true);
    try {
      setResult(await runCode(session.getCode(language).toString(), language));
    } finally {
      setRunning(false);
    }
  }, [session, running, lang, language]);

  const roomUrl = window.location.href;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="flex h-dvh flex-col overflow-hidden bg-brand-bg"
    >
      <header className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-brand-border bg-[#111111] px-3">
        <div className="flex min-w-0 items-center gap-2">
          <button
            onClick={onLeave}
            className="rounded-md p-1.5 text-brand-text-muted transition-colors hover:bg-white/5 hover:text-white"
            aria-label="Leave room"
            title="Leave room"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="hidden sm:inline">
            <Logo />
          </span>
        </div>

        <button
          onClick={() => copy('id', roomId)}
          className="flex items-center gap-2 rounded-md border border-brand-border bg-brand-bg px-2.5 py-1 font-mono text-xs transition-colors hover:border-blue-500/40"
          title="Copy room code"
        >
          <span className="text-brand-text-muted">room</span>
          <span className="font-semibold tracking-wider text-blue-400">{roomId}</span>
          {copied === 'id' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3 text-brand-text-muted" />}
        </button>

        <div className="flex items-center justify-end gap-2">
          <div className="relative hidden sm:block">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as LanguageId)}
              className="h-8 appearance-none rounded-md border border-brand-border bg-brand-bg pr-7 pl-2.5 text-xs text-brand-text outline-none hover:border-white/20 focus:border-blue-500/60"
              aria-label="Language"
            >
              {LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute top-1/2 right-2 h-3.5 w-3.5 -translate-y-1/2 text-brand-text-muted" />
          </div>
          <button
            onClick={() => {
              setDebugMode((d) => !d);
              setSidebarOpen(true);
              setSideTab('debugger');
            }}
            className={`flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold transition-colors ${debugMode ? 'border-sky-500/50 bg-sky-600/25 text-sky-100' : 'border-brand-border text-neutral-300 hover:bg-white/5'}`}
            title="Time-travel debugger: checkpoints, regression search, Meta AI fixes"
            aria-pressed={debugMode}
          >
            <History className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Debugger</span>
          </button>
          <button
            onClick={() => setAiOpenSignal((n) => n + 1)}
            className="flex h-8 items-center gap-1.5 rounded-md border border-violet-500/40 bg-violet-600/15 px-3 text-xs font-semibold text-violet-200 transition-colors hover:bg-violet-600/30"
            title="Ask AI to edit code (Ctrl/Cmd + K)"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Ask AI</span>
          </button>
          <button
            onClick={run}
            disabled={running}
            className="flex h-8 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-60"
            title="Run (Ctrl/Cmd + Enter)"
          >
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            <span className="hidden md:inline">Run</span>
          </button>
          <button
            onClick={() => copy('url', roomUrl)}
            className="flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-blue-500"
          >
            {copied === 'url' ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
            <span className="hidden md:inline">{copied === 'url' ? 'Link copied' : 'Share room'}</span>
          </button>
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="relative rounded-md p-1.5 text-brand-text-muted transition-colors hover:bg-white/5 hover:text-white"
            aria-label={sidebarOpen ? 'Hide people and chat' : 'Show people and chat'}
          >
            {sidebarOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            {!sidebarOpen && remoteCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-emerald-500 px-0.5 text-[9px] font-bold text-black">
                {remoteCount}
              </span>
            )}
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {debugMode && <TimelinePanel dbg={dbg} />}
        <main className="flex min-w-0 flex-1 flex-col">
          {debugMode && dbg.challenge && language !== dbg.challenge.language && dbg.view.kind === 'live' && (
            <div className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/[0.06] px-3 py-1.5 text-xs text-amber-200">
              The debugger checkpoints the {dbg.challenge.language === 'typescript' ? 'TypeScript' : dbg.challenge.language} file.
              <button onClick={() => setLanguage(dbg.challenge!.language)} className="rounded bg-amber-500/20 px-2 py-0.5 font-semibold hover:bg-amber-500/30">
                Switch to it
              </button>
            </div>
          )}
          {/* Language picker for small screens, where the navbar has no room for it */}
          <div className="flex items-center gap-2 border-b border-brand-border bg-[#111111] px-3 py-1.5 sm:hidden">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as LanguageId)}
              className="h-7 flex-1 rounded-md border border-brand-border bg-brand-bg px-2 text-xs text-brand-text"
              aria-label="Language"
            >
              {LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          {debugMode && dbg.view.kind !== 'live' && (
            <div className="min-h-0 flex-1">
              <TimeTravelView dbg={dbg} />
            </div>
          )}
          {/* The live editor stays mounted (hidden) during time travel, so its binding, cursor and undo history survive. */}
          <div className={`min-h-0 flex-1 ${debugMode && dbg.view.kind !== 'live' ? 'hidden' : ''}`}>
            {session && (
              <CodeEditor
                session={session}
                language={language}
                peers={peers}
                onRun={run}
                onCursorChange={setCursor}
                aiOpenSignal={aiOpenSignal}
              />
            )}
          </div>
          {outputOpen && (
            <OutputPanel result={result} running={running} notice={notice} onClose={() => setOutputOpen(false)} />
          )}
        </main>

        {sidebarOpen && (
          <aside
            className={`absolute inset-y-0 right-0 z-20 flex flex-col border-l border-brand-border bg-brand-surface shadow-2xl lg:static lg:shadow-none ${debugMode ? 'w-[22rem]' : 'w-72'}`}
          >
            {debugMode && (
              <div className="flex shrink-0 border-b border-brand-border text-xs" role="tablist">
                {(
                  [
                    ['debugger', 'Debugger'],
                    ['people', `People & chat${remoteCount ? ` (${remoteCount + 1})` : ''}`],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={sideTab === id}
                    onClick={() => setSideTab(id)}
                    className={`flex-1 px-3 py-2 font-semibold ${sideTab === id ? 'border-b-2 border-sky-400 text-white' : 'text-brand-text-muted hover:text-white'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {showDebugger ? (
              <DebuggerPanel dbg={dbg} />
            ) : (
              <>
                <PresencePanel peers={peers} onRename={(name) => onProfileChange({ ...profile, name })} />
                <ChatPanel messages={messages} localClientId={session?.doc.clientID ?? -1} onSend={sendMessage} />
              </>
            )}
          </aside>
        )}
      </div>

      <StatusBar
        status={status}
        connection={connection}
        remoteCount={remoteCount}
        languageLabel={lang.label}
        cursor={cursor}
        onToggleOutput={() => setOutputOpen((o) => !o)}
      />
    </motion.div>
  );
}
