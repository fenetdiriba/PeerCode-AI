import React, { useState, useEffect } from 'react';
import LandingView from './components/LandingView';
import EditorView from './components/EditorView';
import NextJsScaffoldViewer from './components/NextJsScaffoldViewer';
import { RouterState } from './types';
import { Code2, ArrowUpCircle, Info, Sparkles, Layers } from 'lucide-react';

export default function App() {
  const [router, setRouter] = useState<RouterState>({ view: 'landing', roomId: null });
  const [showScaffoldDrawer, setShowScaffoldDrawer] = useState(false);

  // Parse URL hash on mount for deep linking support (e.g., #/room/x83kso)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      const match = hash.match(/^#\/room\/([a-zA-Z0-9]+)$/);
      if (match && match[1]) {
        setRouter({ view: 'room', roomId: match[1] });
      } else {
        setRouter({ view: 'landing', roomId: null });
      }
    };

    // Run once on load
    handleHashChange();

    // Listen to route changes
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleCreateRoom = (newId: string) => {
    window.location.hash = `#/room/${newId}`;
  };

  const handleJoinRoom = (enteredId: string) => {
    window.location.hash = `#/room/${enteredId}`;
  };

  const handleGoBack = () => {
    window.location.hash = '';
  };

  return (
    <div className="min-h-screen bg-brand-bg text-brand-text flex flex-col relative">
      {/* Active Screen rendering */}
      {router.view === 'landing' ? (
        <div className="flex-1 flex flex-col">
          <LandingView 
            onCreateRoom={handleCreateRoom} 
            onJoinRoom={handleJoinRoom}
            onOpenScaffold={() => {
              setShowScaffoldDrawer(true);
              // Scroll to scaffold viewer for immediate focus
              const element = document.getElementById('scaffold-section');
              if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }}
          />

          {/* Integrated Code Scaffold Explorer right below the landing page */}
          <section id="scaffold-section" className="max-w-6xl w-full mx-auto px-6 pb-24 flex flex-col gap-6">
            <div className="flex flex-col text-left gap-1 mb-2">
              <div className="flex items-center gap-2 text-blue-400">
                <Layers className="w-5 h-5" />
                <h2 className="text-xl font-bold tracking-tight text-white">Full Next.js 14 codebase files</h2>
              </div>
              <p className="text-xs text-brand-text-muted leading-relaxed">
                We've prepared the exact Next.js 14 App Router, TypeScript, and Tailwind CSS files as requested. Inspect the file tree, setup commands, and copy production-ready template code with the tabs below.
              </p>
            </div>
            
            <div className="w-full">
              <NextJsScaffoldViewer />
            </div>
          </section>
        </div>
      ) : (
        <EditorView 
          roomId={router.roomId || 'demo'} 
          onGoBack={handleGoBack}
          onOpenScaffold={() => setShowScaffoldDrawer(true)}
        />
      )}

      {/* Slide-out Overlay Scaffold Drawer Panel (Floating Modal Helper for Easy Access) */}
      {showScaffoldDrawer && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-end transition-all">
          {/* Backdrop Closer */}
          <div className="absolute inset-0 cursor-pointer" onClick={() => setShowScaffoldDrawer(false)} />
          
          <div className="relative w-full max-w-4xl bg-brand-bg border-l border-brand-border h-full flex flex-col shadow-2xl z-10 animate-in slide-in-from-right duration-300">
            {/* Drawer Header */}
            <div className="px-6 py-4 bg-brand-surface border-b border-brand-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code2 className="w-5 h-5 text-blue-500" />
                <h3 className="font-bold text-sm tracking-tight text-white">Next.js 14 App Router Template Scaffold</h3>
              </div>
              <button 
                onClick={() => setShowScaffoldDrawer(false)}
                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                Close Drawer
              </button>
            </div>

            {/* Inner scrollable list */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl text-left mb-6">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wide">Developer Information</h4>
                    <p className="text-xs text-brand-text-muted mt-1 leading-relaxed">
                      Copy these files into your Next.js project to quickly implement PeerCode AI. This template includes a dark-themed global layout, a random 6-character room generator, and dynamically-routed rooms.
                    </p>
                  </div>
                </div>
              </div>

              <NextJsScaffoldViewer />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

