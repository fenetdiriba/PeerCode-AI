import React, { useState } from 'react';
import { FolderTree, Terminal, FileCode, Check, Copy, FileCode2, Code, Shield, Users, Sparkles } from 'lucide-react';

export default function NextJsScaffoldViewer() {
  const [copiedFile, setCopiedFile] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'commands' | 'structure' | 'layout' | 'page' | 'room' | 'tailwind' | 'package'>('commands');

  const copyToClipboard = (text: string, filename: string) => {
    navigator.clipboard.writeText(text);
    setCopiedFile(filename);
    setTimeout(() => setCopiedFile(null), 2000);
  };

  const codeFiles = {
    commands: {
      title: 'Setup Commands',
      icon: Terminal,
      language: 'bash',
      filename: 'terminal-commands.sh',
      content: `# 1. Create a new Next.js 14 project with Tailwind CSS and TypeScript
npx create-next-app@14.2.3 peercode-ai \\
  --typescript \\
  --tailwind \\
  --eslint \\
  --app \\
  --src-dir=false \\
  --import-alias="@/*" \\
  --use-npm

# 2. Navigate to the project directory
cd peercode-ai

# 3. Install icons and animations dependencies
npm install lucide-react framer-motion

# 4. Start the development server
npm run dev`
    },
    structure: {
      title: 'Folder Structure',
      icon: FolderTree,
      language: 'text',
      filename: 'project-structure.txt',
      content: `peercode-ai/
├── app/
│   ├── layout.tsx             # Root layout with dark theme & styling imports
│   ├── page.tsx               # Landing page with random room generator
│   ├── globals.css            # Tailwind CSS global styling configuration
│   └── room/
│       └── [id]/
│           └── page.tsx       # Dynamic room page with room ID routing
├── tailwind.config.ts         # Tailwind custom color theme definitions
├── package.json               # Next.js and dependencies manifest
├── tsconfig.json              # TypeScript compilation setup
└── next.config.mjs            # Next.js bundler specifications`
    },
    layout: {
      title: 'app/layout.tsx',
      icon: FileCode,
      language: 'typescript',
      filename: 'app/layout.tsx',
      content: `import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PeerCode AI - Collaborative Code Editor",
  description: "Real-time collaborative code editor with smart AI assistance.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={\`\${inter.className} bg-[#0d0d0d] text-[#eaeaea] antialiased\`}>
        {children}
      </body>
    </html>
  );
}`
    },
    page: {
      title: 'app/page.tsx',
      icon: Code,
      language: 'typescript',
      filename: 'app/page.tsx',
      content: `"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Code2, ArrowRight, Keyboard, Users2, Shield } from "lucide-react";

export default function Home() {
  const router = useRouter();
  const [roomId, setRoomId] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  // Generate a random 6-character room ID
  const handleCreateRoom = () => {
    setIsGenerating(true);
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let randomId = "";
    for (let i = 0; i < 6; i++) {
      randomId += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    // Simulate minor transition before redirecting to dynamic route
    setTimeout(() => {
      router.push(\`/room/\${randomId}\`);
    }, 400);
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomId.trim().length >= 4) {
      router.push(\`/room/\${roomId.trim().toLowerCase()}\`);
    }
  };

  return (
    <main className="min-h-screen bg-[#0d0d0d] text-[#eaeaea] flex flex-col justify-between p-6">
      {/* Upper Navigation Header */}
      <header className="max-w-6xl w-full mx-auto flex items-center justify-between py-4 border-b border-[#222]">
        <div className="flex items-center gap-2">
          <Code2 className="w-6 h-6 text-blue-500" />
          <span className="font-bold tracking-tight text-lg">
            PeerCode<span className="text-blue-500">.AI</span>
          </span>
        </div>
        <div className="text-xs font-mono text-[#888] bg-[#1a1a1a] px-3 py-1.5 rounded-full border border-[#2e2e2e]">
          v1.0.0 Stable
        </div>
      </header>

      {/* Hero Section Container */}
      <section className="max-w-4xl w-full mx-auto my-auto py-12 flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
          Now supporting Next.js 14 App Router
        </div>

        <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6 max-w-2xl bg-gradient-to-b from-white to-[#888] bg-clip-text text-transparent leading-tight">
          Collaborative Coding, Reimagined.
        </h1>
        
        <p className="text-sm md:text-base text-[#a0a0a0] max-w-lg mb-10 leading-relaxed">
          Create a private real-time sandbox room, invite peers, and pair-program in a high-performance environment with integrated developer tools.
        </p>

        {/* Action Controls Box */}
        <div className="w-full max-w-md p-6 bg-[#1a1a1a] border border-[#2e2e2e] rounded-xl shadow-2xl flex flex-col gap-4">
          <button
            onClick={handleCreateRoom}
            disabled={isGenerating}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-all duration-150 flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 active:scale-[0.98] disabled:opacity-50"
          >
            {isGenerating ? "Generating Room..." : "Create New Sandbox Room"}
            <ArrowRight className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-3 my-1">
            <hr className="flex-1 border-[#2e2e2e]" />
            <span className="text-xs font-mono text-[#555]">OR JOIN ACTIVE</span>
            <hr className="flex-1 border-[#2e2e2e]" />
          </div>

          <form onSubmit={handleJoinRoom} className="flex gap-2">
            <input
              type="text"
              placeholder="Enter 6-char Room ID (e.g. x83kso)"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              maxLength={12}
              className="flex-1 px-4 py-2.5 bg-[#0d0d0d] border border-[#2e2e2e] rounded-lg focus:outline-none focus:border-blue-500 text-sm font-mono placeholder-[#555]"
              required
            />
            <button
              type="submit"
              disabled={roomId.trim().length < 4}
              className="px-5 py-2.5 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 disabled:hover:bg-neutral-800 text-white font-medium text-sm rounded-lg transition-all"
            >
              Join
            </button>
          </form>
        </div>

        {/* Highlights Grid */}
        <div className="grid grid-cols-3 gap-6 mt-16 max-w-3xl w-full text-left">
          <div className="p-4 rounded-lg bg-[#141414] border border-[#222]">
            <Keyboard className="w-5 h-5 text-blue-500 mb-2" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1">Ultra-Low Latency</h3>
            <p className="text-xs text-[#888] leading-relaxed">Collaborative keystroke syncing powered by standard WebSockets.</p>
          </div>
          <div className="p-4 rounded-lg bg-[#141414] border border-[#222]">
            <Users2 className="w-5 h-5 text-emerald-500 mb-2" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1">Peer Awareness</h3>
            <p className="text-xs text-[#888] leading-relaxed">Follow co-author cursors, highlight regions, and live-chat easily.</p>
          </div>
          <div className="p-4 rounded-lg bg-[#141414] border border-[#222]">
            <Shield className="w-5 h-5 text-purple-500 mb-2" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1">Sandbox Isolations</h3>
            <p className="text-xs text-[#888] leading-relaxed">Secure development channels that respect user and peer isolation rules.</p>
          </div>
        </div>
      </section>

      {/* Footer Branding */}
      <footer className="max-w-6xl w-full mx-auto text-center py-6 border-t border-[#1a1a1a] text-xs text-[#555]">
        PeerCode AI © 2026 • Designed for Modern Developers
      </footer>
    </main>
  );
}`
    },
    room: {
      title: 'app/room/[id]/page.tsx',
      icon: FileCode2,
      language: 'typescript',
      filename: 'app/room/[id]/page.tsx',
      content: `"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Code2, ArrowLeft, Users, Terminal, Sparkles, Share2, Check, RefreshCw } from "lucide-react";
import dynamic from "next/dynamic";

// Dynamically import Monaco Editor to bypass Next.js SSR hydration checks and load only on client side
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-[#121212] text-neutral-400 font-mono text-xs">
      <RefreshCw className="w-4 h-4 animate-spin mr-2 text-blue-500" />
      Loading Monaco Environment...
    </div>
  ),
});

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.id as string;
  const [copied, setCopied] = useState(false);
  const [language, setLanguage] = useState("javascript");
  
  // Set default state with JavaScript boilerplate
  const [code, setCode] = useState(\`// Collaborative Sandbox: \\\${roomId}
function greetUser(name) {
  console.log("Ready to pair-program!");
  return "Hello, " + name + "! Welcome to PeerCode AI.";
}

console.log(greetUser("Developer"));\`);

  // State to track client-side mounting
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleCopyLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleLanguageChange = (newLang: string) => {
    setLanguage(newLang);
    if (newLang === "javascript") {
      setCode(\`// JavaScript Sandbox\\\\nfunction greet() {\\\\n  console.log("Hello from JS!");\\\\n}\\\\ngreet();\`);
    } else if (newLang === "typescript") {
      setCode(\`// TypeScript Sandbox\\\\ninterface Developer {\\\\n  name: string;\\\\n  role: string;\\\\n}\\\\nconst dev: Developer = { name: "Alex", role: "Architect" };\\\\nconsole.log(dev);\`);
    } else if (newLang === "python") {
      setCode(\`# Python Sandbox\\\\ndef greet(name):\\\\n    print(f"Hello, {name}!")\\\\n\\\\ngreet("Developer")\`);
    } else if (newLang === "java") {
      setCode(\`// Java Sandbox\\\\npublic class Main {\\\\n    public static void main(String[] args) {\\\\n        System.out.println("Hello from Java!");\\\\n    }\\\\n}\`);
    } else if (newLang === "cpp") {
      setCode(\`// C++ Sandbox\\\\n#include <iostream>\\\\nint main() {\\\\n    std::cout << "Hello from C++!" << std::endl;\\\\n    return 0;\\\\n}\`);
    }
  };

  if (!isClient) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] text-[#eaeaea] flex items-center justify-center font-mono text-xs">
        Bootstrapping secure workspace...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-[#eaeaea] flex flex-col">
      {/* Editor Room Header */}
      <header className="h-14 border-b border-[#222] bg-[#1a1a1a] px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => router.push("/")}
            className="p-1.5 hover:bg-[#262626] rounded-md transition-colors text-neutral-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          
          <div className="flex items-center gap-2">
            <Code2 className="w-5 h-5 text-blue-500" />
            <span className="font-bold text-sm tracking-tight hidden sm:inline">
              PeerCode<span className="text-blue-500">.AI</span>
            </span>
          </div>

          <span className="text-neutral-600">|</span>

          {/* Active Room Badge */}
          <div className="flex items-center gap-2 px-3 py-1 bg-neutral-900 border border-[#2e2e2e] rounded-md">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs font-mono text-neutral-300">Room:</span>
            <span className="text-xs font-mono font-bold text-blue-400 uppercase tracking-wide">\\\${roomId}</span>
          </div>
        </div>

        {/* Header Right Interactions */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-neutral-400 bg-neutral-900/50 border border-neutral-800 px-2.5 py-1 rounded-md">
            <Users className="w-3.5 h-3.5 text-blue-400" />
            <span className="font-medium">1 Online</span>
          </div>

          <button
            onClick={handleCopyLink}
            className="h-8 px-3 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-md font-medium transition-colors flex items-center gap-1.5 active:scale-95"
          >
            {copied ? "Copied" : "Share"}
          </button>
        </div>
      </header>

      {/* Editor Layout Split Screen */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 overflow-hidden h-[calc(100vh-3.5rem)]">
        {/* Code Input Section - Occupies about 70% height on mobile, 2/3 width on desktop */}
        <div className="lg:col-span-2 border-r border-[#222] flex flex-col h-[70vh] lg:h-full bg-[#121212]">
          <div className="h-10 border-b border-[#222] bg-[#161616] px-4 flex items-center justify-between text-xs text-neutral-400">
            <span className="font-mono text-xs">sandbox.js</span>
            
            {/* Language Selector Dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase text-neutral-500 font-bold font-mono">Language:</span>
              <select
                value={language}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className="bg-[#0d0d0d] border border-[#2e2e2e] text-neutral-300 rounded px-2.5 py-1 text-xs focus:outline-none focus:border-blue-500 font-mono"
              >
                <option value="javascript">JavaScript</option>
                <option value="typescript">TypeScript</option>
                <option value="python">Python</option>
                <option value="java">Java</option>
                <option value="cpp">C++</option>
              </select>
            </div>
          </div>
          
          {/* Monaco Editor Container (fills main content area) */}
          <div className="flex-1 relative overflow-hidden">
            <MonacoEditor
              height="100%"
              language={language}
              theme="vs-dark"
              value={code}
              onChange={(value) => setCode(value || "")}
              options={{
                fontSize: 14,
                fontFamily: "JetBrains Mono, Menlo, Monaco, monospace",
                minimap: { enabled: false },
                wordWrap: "on",
                automaticLayout: true,
                cursorBlinking: "smooth",
              }}
            />
          </div>
        </div>

        {/* Sidebar Diagnostics Panel */}
        <div className="bg-[#1a1a1a] flex flex-col h-full overflow-y-auto p-4 gap-4">
          <div className="flex items-center justify-between border-b border-[#2e2e2e] pb-2">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-500" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Environment Sandbox</h2>
            </div>
            <span className="text-[10px] text-emerald-400 font-mono bg-emerald-950/40 border border-emerald-900/60 px-2 py-0.5 rounded-full font-bold">Connected</span>
          </div>

          <div className="p-3 bg-neutral-900 border border-[#2e2e2e] rounded-lg">
            <h3 className="text-xs font-semibold text-neutral-300 mb-1 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              High-Fidelity Editor
            </h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Monaco Editor provides autocomplete, parameter hints, syntax highlighting, and code folding out of the box.
            </p>
          </div>

          <div className="flex-1 flex flex-col border border-[#2e2e2e] rounded-lg bg-[#0d0d0d] overflow-hidden min-h-[200px]">
            <div className="h-8 bg-neutral-900 border-b border-[#2e2e2e] px-3 flex items-center justify-between text-[11px] font-mono text-neutral-400">
              <span>SANDBOX TERMINAL OUTPUT</span>
            </div>
            <div className="flex-1 p-3 font-mono text-xs text-neutral-300 space-y-1.5 overflow-auto">
              <div className="text-emerald-400 font-medium font-mono">⚡ Ready to pair-program with Monaco!</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}"`
    },
    tailwind: {
      title: 'tailwind.config.ts',
      icon: Code,
      language: 'typescript',
      filename: 'tailwind.config.ts',
      content: `import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Precise dark theme colors specified by the user
        background: "#0d0d0d",
        surface: "#1a1a1a",
        editor: {
          bg: "#121212",
          line: "#181818",
          border: "#2e2e2e",
        },
      },
    },
  },
  plugins: [],
};

export default config;`
    },
    package: {
      title: 'package.json',
      icon: FileCode,
      language: 'json',
      filename: 'package.json',
      content: `{
  "name": "peercode-ai",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "14.2.3",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "lucide-react": "^0.379.0",
    "framer-motion": "^11.1.7",
    "@monaco-editor/react": "^4.6.0"
  },
  "devDependencies": {
    "@types/node": "^20.12.12",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.3",
    "typescript": "^5.4.5"
  }
}`
    }
  };

  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl overflow-hidden shadow-2xl flex flex-col h-full">
      {/* Scaffold Header */}
      <div className="px-5 py-4 bg-[#141414] border-b border-brand-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderTree className="w-5 h-5 text-blue-500" />
          <h2 className="font-semibold text-sm tracking-tight text-white flex items-center gap-1.5">
            Next.js 14 Code Scaffold Explorer
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-900/30 border border-blue-800/40 text-blue-400 font-bold uppercase">
              Production Ready
            </span>
          </h2>
        </div>
        <div className="text-xs text-brand-text-muted hidden sm:inline-flex items-center gap-1">
          <Shield className="w-3.5 h-3.5 text-emerald-500" /> Secure file reference
        </div>
      </div>

      {/* Tabs list */}
      <div className="bg-[#111] px-2 pt-2 border-b border-brand-border flex gap-1 overflow-x-auto">
        {(Object.keys(codeFiles) as Array<keyof typeof codeFiles>).map((key) => {
          const file = codeFiles[key];
          const IconComponent = file.icon;
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors border-t border-x border-transparent select-none whitespace-nowrap ${
                isActive
                  ? 'bg-brand-surface text-white border-brand-border border-b-brand-surface z-10'
                  : 'text-brand-text-muted hover:text-brand-text hover:bg-white/5'
              }`}
            >
              <IconComponent className={`w-3.5 h-3.5 ${isActive ? 'text-blue-500' : 'text-neutral-500'}`} />
              {file.title}
            </button>
          );
        })}
      </div>

      {/* Code Area */}
      <div className="flex-1 flex flex-col bg-brand-surface relative overflow-hidden min-h-[350px]">
        {/* Filename and copy action */}
        <div className="h-9 bg-[#1d1d1d] px-4 border-b border-brand-border flex items-center justify-between text-xs text-brand-text-muted">
          <span className="font-mono text-xs">{codeFiles[activeTab].filename}</span>
          <button
            onClick={() => copyToClipboard(codeFiles[activeTab].content, activeTab)}
            className="flex items-center gap-1 text-[11px] hover:text-white px-2 py-1 bg-neutral-800/50 hover:bg-neutral-800 border border-brand-border rounded transition-all active:scale-95"
            title="Copy source content"
          >
            {copiedFile === activeTab ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400 font-medium">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>Copy File</span>
              </>
            )}
          </button>
        </div>

        {/* Inner code print */}
        <div className="flex-1 overflow-auto p-5 font-mono text-xs text-neutral-300 leading-relaxed select-text bg-[#131313]">
          <pre className="whitespace-pre overflow-x-auto tab-size-4">
            {codeFiles[activeTab].content}
          </pre>
        </div>
      </div>
    </div>
  );
}
