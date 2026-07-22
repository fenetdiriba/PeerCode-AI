import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Code2, ArrowLeft, Users, Terminal, Sparkles, Share2, Check, 
  Play, RotateCcw, MessageSquare, Send, UserCheck, Code, Settings,
  AlertCircle, HelpCircle, FileJson, Layers, CheckCircle2, Copy
} from 'lucide-react';
import Editor from '@monaco-editor/react';
import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { MonacoBinding } from 'y-monaco';
import type { Awareness } from 'y-protocols/awareness';
import type * as Monaco from 'monaco-editor';
import { Peer, ChatMessage, CodeFile } from '../types';

interface EditorViewProps {
  roomId: string;
  onGoBack: () => void;
  onOpenScaffold: () => void;
}

const BOILERPLATE_CODES: Record<string, Record<string, string>> = {
  typescript: {
    'index.ts': `// PeerCode AI Collaborative Sandbox
// Try clicking "Simulate Peer Collaboration" above!

interface UserProfile {
  id: string;
  username: string;
  role: 'developer' | 'architect';
  isActive: boolean;
}

function processActiveDeveloper(user: UserProfile): string {
  if (user.isActive) {
    return \`⚡ Developer \${user.username} is coding on Room: \${user.id}\`;
  }
  return \`💤 User \${user.username} is offline.\`;
}

// Sample Test Instance
const activePeer: UserProfile = {
  id: "peercode-sandbox",
  username: "solomon",
  role: "developer",
  isActive: true
};

console.log(processActiveDeveloper(activePeer));`,
    'utils.ts': `export function randomId(length: number = 6): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}`
  },
  html: {
    'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>PeerCode AI Sandbox</title>
  <style>
    body {
      background-color: #0d0d0d;
      color: #3b82f6;
      font-family: sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
    }
  </style>
</head>
<body>
  <h1>Hello from PeerCode AI Space!</h1>
</body>
</html>`
  },
  python: {
    'main.py': `# PeerCode AI - Python Sandbox
import random

def generate_room_code(length=6):
    chars = "abcdefghijklmnopqrstuvwxyz0123456789"
    return "".join(random.choice(chars) for _ in range(length))

if __name__ == "__main__":
    room = generate_room_code()
    print(f"🚀 Sandbox initialized on room: {room.upper()}")`
  }
};

export default function EditorView({ roomId, onGoBack, onOpenScaffold }: EditorViewProps) {
  const [selectedLanguage, setSelectedLanguage] = useState<'typescript' | 'html' | 'python'>('typescript');
  const [activeFile, setActiveFile] = useState('index.ts');
  const [logs, setLogs] = useState<Array<{ text: string; type: 'system' | 'success' | 'error' | 'user' }>>([
    { text: '[system] collaborative secure session channel configured successfully', type: 'system' },
    { text: `[system] join active sandbox on room ID: ${roomId.toUpperCase()}`, type: 'success' }
  ]);
  
  // Real-time peer list
  const [peers, setPeers] = useState<Peer[]>([]);
  
  // Real-time Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { id: 'm1', sender: 'System', text: `Welcome to room ${roomId}! Invite your team by sharing this URL.`, timestamp: 'Just now', isSystem: true }
  ]);
  const [newMsg, setNewMsg] = useState('');
  const chatBottomRef = useRef<HTMLDivElement>(null);
  
  const [copiedLink, setCopiedLink] = useState(false);
  const [isAIReviewing, setIsAIReviewing] = useState(false);
  const yDocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebrtcProvider | null>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);
  const peerIdsRef = useRef<Set<number>>(new Set());
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorChangeListenerRef = useRef<Monaco.IDisposable | null>(null);

  const getLanguageId = (language: 'typescript' | 'html' | 'python') => {
    if (language === 'typescript') return 'typescript';
    if (language === 'html') return 'html';
    return 'python';
  };

  const getPeerColor = (clientId: number) => {
    const palette = ['bg-blue-500', 'bg-emerald-500', 'bg-purple-600', 'bg-amber-500', 'bg-rose-500'];
    return palette[Math.abs(clientId) % palette.length];
  };

  const syncPeersFromAwareness = useCallback((awareness: Awareness) => {
    const syncedPeers: Peer[] = Array.from(awareness.getStates().entries()).map(([clientId, state]) => {
      const user = state.user as { name?: string; avatarColor?: string } | undefined;
      return {
        id: String(clientId),
        name: user?.name || `Peer ${clientId}`,
        avatarColor: user?.avatarColor || getPeerColor(clientId),
        isTyping: Boolean(state.typing)
      };
    });
    setPeers(syncedPeers);
  }, []);

  const getYText = useCallback((language: 'typescript' | 'html' | 'python', fileName: string) => {
    const doc = yDocRef.current;
    if (!doc) return null;

    const textKey = `${roomId}:${language}:${fileName}`;
    const yText = doc.getText(textKey);
    if (yText.length === 0) {
      const initial = BOILERPLATE_CODES[language][fileName] || '';
      if (initial) {
        doc.transact(() => {
          yText.insert(0, initial);
        });
      }
    }
    return yText;
  }, [roomId]);

  const bindMonacoModel = useCallback(() => {
    const provider = providerRef.current;
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!provider || !editor || !monaco) return;

    const languageId = getLanguageId(selectedLanguage);
    const modelUri = monaco.Uri.parse(`inmemory://peercode/${roomId}/${selectedLanguage}/${activeFile}`);
    let model = monaco.editor.getModel(modelUri);

    if (!model) {
      model = monaco.editor.createModel('', languageId, modelUri);
    } else {
      monaco.editor.setModelLanguage(model, languageId);
    }

    editor.setModel(model);
    bindingRef.current?.destroy();

    const yText = getYText(selectedLanguage, activeFile);
    if (yText) {
      bindingRef.current = new MonacoBinding(yText, model, new Set([editor]), provider.awareness);
    }
  }, [activeFile, getYText, roomId, selectedLanguage]);

  // Synchronize boilerplate code when language changes
  useEffect(() => {
    const firstFile = Object.keys(BOILERPLATE_CODES[selectedLanguage])[0];
    setActiveFile(firstFile);
  }, [selectedLanguage]);

  useEffect(() => {
    const doc = new Y.Doc();
    const provider = new WebrtcProvider(roomId, doc, {
      signaling: ['wss://signaling.yjs.dev']
    });

    yDocRef.current = doc;
    providerRef.current = provider;

    const awareness = provider.awareness;
    awareness.setLocalStateField('user', {
      name: 'You (Owner)',
      avatarColor: 'bg-blue-500'
    });
    awareness.setLocalStateField('typing', false);

    peerIdsRef.current = new Set<number>([awareness.clientID]);

    const handleAwarenessUpdate = ({ added, removed }: { added: number[]; removed: number[] }) => {
      added
        .filter((clientId) => clientId !== awareness.clientID && !peerIdsRef.current.has(clientId))
        .forEach((clientId) => {
          peerIdsRef.current.add(clientId);
          console.log(`[peer] connected: ${clientId}`);
        });

      removed
        .filter((clientId) => clientId !== awareness.clientID)
        .forEach((clientId) => {
          peerIdsRef.current.delete(clientId);
          console.log(`[peer] disconnected: ${clientId}`);
        });

      syncPeersFromAwareness(awareness);
    };

    awareness.on('update', handleAwarenessUpdate);
    syncPeersFromAwareness(awareness);

    return () => {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }
      editorChangeListenerRef.current?.dispose();
      bindingRef.current?.destroy();
      awareness.off('update', handleAwarenessUpdate);
      provider.destroy();
      doc.destroy();
      providerRef.current = null;
      yDocRef.current = null;
    };
  }, [roomId, syncPeersFromAwareness]);

  useEffect(() => {
    bindMonacoModel();
  }, [bindMonacoModel]);

  // Keep chat scrolled
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleEditorMount = (editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    bindMonacoModel();

    editorChangeListenerRef.current?.dispose();
    editorChangeListenerRef.current = editor.onDidChangeModelContent(() => {
      const awareness = providerRef.current?.awareness;
      if (!awareness) return;

      awareness.setLocalStateField('typing', true);
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }
      typingTimerRef.current = setTimeout(() => {
        awareness.setLocalStateField('typing', false);
      }, 800);
    });
  };

  const getActiveCode = () => {
    const yText = getYText(selectedLanguage, activeFile);
    return yText ? yText.toString() : '';
  };

  const executeCode = () => {
    setLogs(prev => [...prev, { text: `[runner] compiling and executing ${activeFile}...`, type: 'system' }]);
    
    setTimeout(() => {
      const code = getActiveCode();
      
      if (selectedLanguage === 'typescript') {
        if (code.includes('processActiveDeveloper') && code.includes('console.log')) {
          setLogs(prev => [
            ...prev,
            { text: '✔ Types compiled successfully in 12ms', type: 'success' },
            { text: '⚡ Developer solomon is coding on Room: peercode-sandbox', type: 'user' }
          ]);
        } else {
          setLogs(prev => [
            ...prev,
            { text: '✔ Sandbox parsed successfully (no errors)', type: 'success' },
            { text: 'Output: Code executed with return code 0', type: 'user' }
          ]);
        }
      } else if (selectedLanguage === 'python') {
        setLogs(prev => [
          ...prev,
          { text: '✔ Python Interpreter v3.11.2 online', type: 'success' },
          { text: '🚀 Sandbox initialized on room: ' + roomId.toUpperCase(), type: 'user' }
        ]);
      } else {
        setLogs(prev => [
          ...prev,
          { text: '✔ Dom parser active', type: 'success' },
          { text: 'Rendered output inside isolated iframe context.', type: 'user' }
        ]);
      }
    }, 450);
  };

  // Chat Submission
  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMsg.trim()) return;
    
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      sender: 'You',
      text: newMsg,
      timestamp: 'Just now'
    };
    
    setChatMessages(prev => [...prev, userMessage]);
    setNewMsg('');

    // Trigger responsive reaction from AI Bot if tagged or asked
    if (newMsg.toLowerCase().includes('ai') || newMsg.toLowerCase().includes('bot') || newMsg.toLowerCase().includes('help')) {
      setTimeout(() => {
        const aiMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          sender: 'PeerCode AI Bot',
          text: `Hey! I'm your AI pairing copilot. If you need assistance, click the "Ask AI Review" button to scan your active code workspace or chat with me.`,
          timestamp: 'Just now'
        };
        setChatMessages(prev => [...prev, aiMessage]);
      }, 1000);
    }
  };

  // AI Review Trigger
  const triggerAIReview = () => {
    setIsAIReviewing(true);
    setLogs(prev => [...prev, { text: '[ai] PeerCode AI analyzing active workspace architecture...', type: 'system' }]);
    
    setTimeout(() => {
      setIsAIReviewing(false);
      const code = getActiveCode();
      let reviewResult = '';
      
      if (code.includes('any')) {
        reviewResult = '⚠️ AI Review: Detected usage of "any" type. Consider using strict interfaces or generic parameters to preserve type safety.';
      } else if (code.includes('reduce')) {
        reviewResult = '✔ AI Review: Array.reduce function looks highly optimized. Suggested adding error bounds for empty input arrays.';
      } else {
        reviewResult = '✔ AI Review: Your workspace code is clean and perfectly typed. No critical anti-patterns or optimization issues found.';
      }

      setLogs(prev => [
        ...prev,
        { text: reviewResult, type: 'system' },
        { text: '💡 [ai] Code suggestions injected. Ready for deployment.', type: 'success' }
      ]);
    }, 1200);
  };

  return (
    <div className="w-full h-screen bg-brand-bg text-brand-text flex flex-col overflow-hidden selection:bg-blue-500/20">
      {/* Editor Header Navigation */}
      <header className="h-14 border-b border-brand-border bg-brand-surface px-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <button 
            onClick={onGoBack}
            className="p-1.5 hover:bg-neutral-800 rounded-lg text-brand-text-muted hover:text-white transition-colors cursor-pointer"
            title="Return to Landing"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600/15 border border-blue-500/30 flex items-center justify-center">
              <Code2 className="w-4 h-4 text-blue-400" />
            </div>
            <span className="font-bold text-xs tracking-tight hidden sm:inline text-white">
              PeerCode<span className="text-blue-500">.AI</span>
            </span>
          </div>

          <span className="text-neutral-700 font-light">/</span>

          {/* Connected Room Code */}
          <div className="flex items-center gap-2 px-2.5 py-1 bg-brand-bg border border-brand-border rounded-lg shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[10px] font-mono text-brand-text-muted uppercase tracking-wider hidden xs:inline">Room:</span>
            <span className="text-xs font-mono font-bold text-blue-400 uppercase tracking-wide">{roomId}</span>
          </div>
        </div>

        {/* Toolbar Center / Right */}
        <div className="flex items-center gap-2">
          {/* Quick toggle to view the real Next.js code */}
          <button
            onClick={onOpenScaffold}
            className="hidden md:flex items-center gap-1.5 h-8 px-3 text-xs bg-neutral-900 hover:bg-neutral-800 border border-brand-border text-brand-text rounded-lg font-medium transition-colors cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5 text-blue-400" />
            <span>Show Next.js 14 Code</span>
          </button>

          {/* Share Action */}
          <button
            onClick={handleCopyLink}
            className="h-8 px-3 text-xs bg-neutral-900 hover:bg-neutral-800 border border-brand-border text-brand-text rounded-lg font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            {copiedLink ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied Link</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5" />
                <span>Share Code</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Workspace Inner Layout Split Screen */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        {/* Leftmost Sidebar: Active files and collaborative presence (Col span 3) */}
        <aside className="lg:col-span-3 border-r border-brand-border bg-brand-surface flex flex-col overflow-y-auto">
          {/* Workspace info & selector */}
          <div className="p-4 border-b border-brand-border">
            <label className="text-[10px] font-mono font-bold text-neutral-500 tracking-wider block uppercase mb-1.5">Programming Language</label>
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value as any)}
              className="w-full bg-brand-bg border border-brand-border rounded-lg text-xs py-2 px-3 focus:outline-none focus:border-blue-500 text-brand-text"
            >
              <option value="typescript">TypeScript (.ts)</option>
              <option value="python">Python (.py)</option>
              <option value="html">HTML Canvas (.html)</option>
            </select>
          </div>

          {/* Files List tree */}
          <div className="p-4 border-b border-brand-border flex-1">
            <span className="text-[10px] font-mono font-bold text-neutral-500 tracking-wider block uppercase mb-3">Workspace Files</span>
            <div className="space-y-1">
              {Object.keys(BOILERPLATE_CODES[selectedLanguage]).map((file) => {
                const isActive = file === activeFile;
                return (
                  <button
                    key={file}
                    onClick={() => setActiveFile(file)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-mono transition-all text-left ${
                      isActive
                        ? 'bg-blue-600/10 border border-blue-500/25 text-blue-400'
                        : 'text-brand-text-muted hover:text-white hover:bg-neutral-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Code className="w-3.5 h-3.5" />
                      <span>{file}</span>
                    </div>
                    {isActive && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Collaborative Peers Card */}
          <div className="p-4 bg-brand-bg/40">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-mono font-bold text-neutral-500 tracking-wider uppercase">Active Peers ({peers.length})</span>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-900/60 px-1.5 py-0.2 rounded">Live Sync</span>
            </div>
            
            <div className="space-y-2">
              {peers.map((peer) => (
                <div key={peer.id} className="flex items-center justify-between p-2 rounded-lg bg-brand-surface-light border border-brand-border/40">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-7 h-7 rounded-lg ${peer.avatarColor} text-white text-xs font-bold flex items-center justify-center`}>
                      {peer.name.charAt(0)}
                    </div>
                    <div>
                      <span className="text-xs font-medium text-brand-text block">{peer.name}</span>
                      <span className="text-[9px] text-brand-text-muted font-mono">
                        {peer.isTyping ? '⚡ Typing...' : 'Idle'}
                      </span>
                    </div>
                  </div>
                  
                  {peer.isTyping && (
                    <span className="flex h-2 w-2 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Center Canvas: Interactive Code Editor (Col span 6) */}
        <main className="lg:col-span-6 flex flex-col border-r border-brand-border bg-brand-bg h-full overflow-hidden">
          {/* Editor Sub-header controls */}
          <div className="h-10 bg-brand-surface px-4 border-b border-brand-border flex items-center justify-between text-xs text-brand-text-muted">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-medium text-white">{activeFile}</span>
              <span className="text-neutral-700">|</span>
              <span className="text-[10px] font-mono text-brand-text-muted uppercase">{selectedLanguage} Sandbox</span>
            </div>
            
            {/* Interactive Workspace Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={triggerAIReview}
                disabled={isAIReviewing}
                className="px-2.5 py-1 bg-purple-600/10 hover:bg-purple-600/20 disabled:opacity-40 border border-purple-500/20 text-purple-400 hover:text-purple-300 text-[10px] rounded font-medium transition-all"
                title="Request PeerCode AI to run an code check on this code block"
              >
                {isAIReviewing ? 'AI Reviewing...' : 'Ask AI Review'}
              </button>
            </div>
          </div>

          {/* High-fidelity Monaco Editor workspace block */}
          <div className="flex-1 flex flex-col font-mono text-xs text-brand-text bg-[#090909] relative">
            <div className="flex-1 w-full relative">
              <Editor
                height="100%"
                width="100%"
                language={selectedLanguage === 'typescript' ? 'typescript' : selectedLanguage === 'html' ? 'html' : 'python'}
                theme="vs-dark"
                onMount={handleEditorMount}
                options={{
                  fontSize: 13,
                  fontFamily: "JetBrains Mono, Menlo, Monaco, monospace",
                  minimap: { enabled: false },
                  wordWrap: "on",
                  automaticLayout: true,
                  cursorBlinking: "smooth",
                  scrollbar: {
                    vertical: "visible",
                    horizontal: "visible"
                  }
                }}
              />
            </div>
          </div>

          {/* Bottom Terminal Log panel */}
          <div className="h-44 border-t border-brand-border bg-brand-surface flex flex-col overflow-hidden">
            <div className="h-9 bg-[#161616] border-b border-brand-border px-4 flex items-center justify-between text-[11px] font-mono text-brand-text-muted">
              <div className="flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-blue-500" />
                <span className="font-bold uppercase tracking-wider text-neutral-300">Terminal Sandbox Logs</span>
              </div>

              <div className="flex items-center gap-2">
                <button 
                  onClick={executeCode}
                  className="px-2 py-0.5 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium text-[10px] transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Play className="w-2.5 h-2.5" />
                  Run
                </button>
                <button 
                  onClick={() => setLogs([])}
                  className="hover:text-white transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="flex-1 p-3 font-mono text-xs text-neutral-300 space-y-1 overflow-y-auto bg-[#0a0a0a]">
              {logs.map((log, index) => {
                let colorClass = 'text-brand-text-muted';
                if (log.type === 'success') colorClass = 'text-emerald-400';
                if (log.type === 'error') colorClass = 'text-rose-400';
                if (log.type === 'user') colorClass = 'text-blue-300';
                return (
                  <div key={index} className={colorClass}>
                    {log.text}
                  </div>
                );
              })}
              {logs.length === 0 && (
                <div className="text-neutral-600 italic">No output logs. Click "Run" or make changes to execute.</div>
              )}
            </div>
          </div>
        </main>

        {/* Right Sidebar: Real-time Live Chat workspace (Col span 3) */}
        <aside className="lg:col-span-3 border-l border-brand-border bg-brand-surface flex flex-col h-full overflow-hidden">
          <div className="p-4 border-b border-brand-border bg-[#161616] flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-blue-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">Live Room Chat</h3>
          </div>

          {/* Messages list container */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 flex flex-col bg-[#141414]">
            {chatMessages.map((msg) => (
              <div 
                key={msg.id} 
                className={`flex flex-col text-left max-w-[85%] rounded-lg p-2.5 text-xs ${
                  msg.isSystem 
                    ? 'bg-neutral-900 border border-brand-border/60 self-center text-center max-w-[95%] text-neutral-500 font-mono text-[10px]' 
                    : msg.sender === 'You'
                      ? 'bg-blue-600/15 border border-blue-500/20 text-brand-text self-end'
                      : 'bg-brand-surface-light border border-brand-border/40 text-brand-text self-start'
                }`}
              >
                {!msg.isSystem && (
                  <span className={`font-semibold mb-0.5 text-[10px] ${msg.sender === 'You' ? 'text-blue-400' : 'text-neutral-400'}`}>
                    {msg.sender}
                  </span>
                )}
                <p className="leading-relaxed whitespace-pre-wrap select-text">{msg.text}</p>
                {!msg.isSystem && (
                  <span className="text-[8px] text-neutral-600 text-right block mt-1">{msg.timestamp}</span>
                )}
              </div>
            ))}
            <div ref={chatBottomRef} />
          </div>

          {/* Send Input Message Box */}
          <form onSubmit={handleSendChat} className="p-3 border-t border-brand-border bg-[#161616] flex gap-1.5">
            <input
              type="text"
              placeholder="Type message..."
              value={newMsg}
              onChange={(e) => setNewMsg(e.target.value)}
              className="flex-1 px-3 py-1.5 bg-brand-bg border border-brand-border focus:border-blue-500 text-xs text-brand-text placeholder-neutral-600 rounded-lg focus:outline-none"
            />
            <button
              type="submit"
              disabled={!newMsg.trim()}
              className="p-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg transition-colors cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
}
