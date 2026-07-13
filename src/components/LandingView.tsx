import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Code2, ArrowRight, Keyboard, Users, Shield, Sparkles, AlertCircle, FileCode, Cpu, ArrowDown, LogIn, Plus } from 'lucide-react';

interface LandingViewProps {
  onCreateRoom: (id: string) => void;
  onJoinRoom: (id: string) => void;
  onOpenScaffold: () => void;
}

export default function LandingView({ onCreateRoom, onJoinRoom, onOpenScaffold }: LandingViewProps) {
  const [roomId, setRoomId] = useState('');
  const [joinError, setJoinError] = useState('');

  const generateRoomId = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < 6; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  };

  const handleCreateClick = () => {
    const newId = generateRoomId();
    onCreateRoom(newId);
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = roomId.trim().toLowerCase();
    if (cleanId.length < 4) {
      setJoinError('Room ID must be at least 4 characters');
      return;
    }
    onJoinRoom(cleanId);
  };

  return (
    <div className="w-full min-h-screen bg-[#0d0d0d] text-gray-100 flex flex-col selection:bg-blue-500/30 selection:text-white">
      {/* Top Navigation */}
      <nav className="h-16 border-b border-white/10 px-6 lg:px-8 flex items-center justify-between shrink-0 bg-[#0d0d0d]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-bold text-xl text-white">P</div>
          <span className="text-xl font-bold tracking-tight text-white">
            PeerCode <span className="text-blue-500">AI</span>
          </span>
        </div>
        
        {/* Nav Links & Action */}
        <div className="flex items-center gap-4 lg:gap-8 text-sm font-medium text-gray-400">
          <a href="#scaffold-section" className="hover:text-white transition-colors hidden md:inline">Features</a>
          <button 
            onClick={onOpenScaffold}
            className="hover:text-white transition-colors flex items-center gap-1 text-xs"
          >
            <FileCode className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">Scaffold Specs</span>
          </button>
          
          <div className="text-xs font-mono text-gray-500 bg-[#121212] px-3 py-1.5 rounded border border-white/5">
            v1.0.4 stable
          </div>
          
          <button 
            onClick={onOpenScaffold}
            className="px-4 py-2 bg-white/5 border border-white/10 rounded-md hover:bg-white/10 text-white transition-all text-xs font-semibold cursor-pointer flex items-center gap-1.5"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Setup Guide</span>
          </button>
        </div>
      </nav>

      {/* Main content Area Grid */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2">
        {/* Left Column: Hero & Action form */}
        <div className="flex flex-col justify-center px-6 sm:px-12 lg:px-16 py-12 lg:py-0 space-y-8 border-b lg:border-b-0 lg:border-r border-white/5 bg-gradient-to-br from-[#0d0d0d] to-[#121212] text-left">
          <div className="space-y-4">
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold uppercase tracking-wider w-fit"
            >
              Next.js 14 + AI Powered Sandbox
            </motion.div>
            
            <motion.h1
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.1] tracking-tight text-white"
            >
              Write code <br />
              <span className="text-blue-500">Together.</span>
            </motion.h1>
            
            <motion.p
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-base sm:text-lg text-gray-400 max-w-md leading-relaxed font-light"
            >
              The ultra-fast, collaborative code editor with real-time AI pair programming. Create a private dynamic sandbox room in seconds.
            </motion.p>
          </div>

          {/* Action form aligned perfectly */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col space-y-4 max-w-lg"
          >
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Create New Room Button */}
              <button
                onClick={handleCreateClick}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 px-6 rounded-lg shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer"
              >
                <Plus className="w-5 h-5" />
                <span>Create New Room</span>
              </button>

              {/* Join Active Sandbox Form */}
              <form onSubmit={handleJoinSubmit} className="flex-1 flex">
                <input
                  type="text"
                  placeholder="Enter Room ID"
                  value={roomId}
                  onChange={(e) => {
                    setRoomId(e.target.value);
                    if (joinError) setJoinError('');
                  }}
                  maxLength={12}
                  className="w-full bg-[#1a1a1a] border border-white/10 rounded-l-lg px-4 text-sm text-white focus:outline-none focus:border-blue-500 transition-all uppercase tracking-wider font-mono placeholder-gray-600"
                />
                <button
                  type="submit"
                  disabled={!roomId.trim()}
                  className="bg-[#1a1a1a] border-y border-r border-white/10 rounded-r-lg px-5 hover:bg-white/5 text-sm font-semibold text-white transition-colors disabled:opacity-40 cursor-pointer"
                >
                  Join
                </button>
              </form>
            </div>

            {joinError && (
              <div className="flex items-center gap-1.5 text-xs text-rose-400">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{joinError}</span>
              </div>
            )}

            {/* Simulated Live Metadata stats */}
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> 
                1,248 Rooms active now
              </span>
              <span className="text-gray-700">|</span>
              <span>Latency: 14ms avg.</span>
            </div>
          </motion.div>

          {/* Highlights grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-8 border-t border-white/5">
            <div>
              <div className="text-xs font-semibold text-neutral-400 tracking-wider uppercase mb-1">Ultra-Low Latency</div>
              <p className="text-xs text-gray-500">Instantly sync code strokes and selections between users.</p>
            </div>
            <div>
              <div className="text-xs font-semibold text-neutral-400 tracking-wider uppercase mb-1">Dynamic Routing</div>
              <p className="text-xs text-gray-500">Share instant custom URLs using Next.js App Router dynamic paths.</p>
            </div>
            <div>
              <div className="text-xs font-semibold text-neutral-400 tracking-wider uppercase mb-1">AI Peer Copilot</div>
              <p className="text-xs text-gray-500">Receive on-demand linting checks and code optimizations.</p>
            </div>
          </div>
        </div>

        {/* Right Column: Visual Mockup */}
        <div className="relative bg-[#080808] flex items-center justify-center p-6 sm:p-12 overflow-hidden geometric-grid">
          {/* Code Window Mockup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="w-full max-w-[480px] bg-[#1a1a1a] rounded-xl border border-white/10 shadow-2xl overflow-hidden text-left relative z-10"
          >
            {/* Topbar of Mockup */}
            <div className="bg-[#252525] px-4 py-2.5 flex items-center justify-between border-b border-white/5">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/40"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/40"></div>
                  <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/40"></div>
                </div>
                <div className="ml-4 text-xs text-gray-500 font-mono">app/room/[id]/page.tsx</div>
              </div>
              <span className="text-[9px] text-blue-400 font-mono uppercase bg-blue-950/40 border border-blue-900/60 px-1.5 py-0.2 rounded">App Router</span>
            </div>

            {/* Code lines */}
            <div className="p-6 font-mono text-xs sm:text-sm leading-6 bg-[#121212]">
              <div className="flex gap-4">
                <span className="text-gray-600 text-right w-4">1</span>
                <span><span className="text-blue-400">import</span> <span className="text-white">{"{ Editor }"}</span> <span className="text-blue-400">from</span> <span className="text-emerald-400">"@peercode/ai"</span>;</span>
              </div>
              <div className="flex gap-4">
                <span className="text-gray-600 text-right w-4">2</span>
                <span>&nbsp;</span>
              </div>
              <div className="flex gap-4">
                <span className="text-gray-600 text-right w-4">3</span>
                <span><span className="text-blue-400">export default function</span> <span className="text-yellow-400">Room</span>() {"{"}</span>
              </div>
              <div className="flex gap-4">
                <span className="text-gray-600 text-right w-4">4</span>
                <span><span className="pl-4 text-blue-400">return</span> (</span>
              </div>
              <div className="flex gap-4 relative bg-blue-500/10 py-0.5 border-l-2 border-blue-500">
                <span className="text-gray-600 text-right w-4 pl-1">5</span>
                <span><span className="pl-8 text-white">&lt;<span className="text-blue-400">Editor</span> mode=<span className="text-emerald-400">"realtime"</span> /&gt;</span></span>
                <div className="absolute -right-2 top-0.5 bg-blue-500 text-[9px] px-1.5 py-0.2 rounded uppercase font-bold text-white shadow-md">Alex</div>
              </div>
              <div className="flex gap-4">
                <span className="text-gray-600 text-right w-4">6</span>
                <span><span className="pl-4 text-white">);</span></span>
              </div>
              <div className="flex gap-4">
                <span className="text-gray-600 text-right w-4">7</span>
                <span><span className="text-white">{"}"}</span></span>
              </div>
            </div>
          </motion.div>

          {/* Floating Terminal Tip */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="absolute bottom-6 right-6 lg:bottom-12 lg:right-12 bg-[#1a1a1a] border border-white/10 rounded-lg p-4 shadow-xl max-w-[260px] text-left z-10"
          >
            <div className="text-[9px] text-gray-500 font-bold mb-2 tracking-widest uppercase">Quick CLI Setup</div>
            <div className="bg-black/40 rounded p-2 font-mono text-xs text-blue-300 border border-white/5 select-all">
              npx peercode-ai init
            </div>
          </motion.div>
        </div>
      </main>

      {/* Bottom Status Bar */}
      <footer className="h-10 bg-[#121212] border-t border-white/5 px-6 lg:px-8 flex items-center justify-between text-[11px] text-gray-500 font-medium">
        <div className="flex gap-6">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> 
            System Operational
          </span>
          <span>v1.0.4-stable</span>
        </div>
        <div className="flex gap-6">
          <span className="hover:text-white cursor-pointer transition-colors">Terms of Service</span>
          <span className="hover:text-white cursor-pointer transition-colors">Privacy Policy</span>
          <span className="text-white">© 2026 PeerCode AI Inc.</span>
        </div>
      </footer>
    </div>
  );
}

