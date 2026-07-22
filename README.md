# PeerCode AI - Next.js 14 Scaffold

## Create the project and install dependencies

```bash
npx create-next-app@latest peercode-ai --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*"
cd peercode-ai
npm install next@14.2.35 react@18.3.1 react-dom@18.3.1
```

## Folder structure

```text
peercode-ai/
├── app/
│   ├── room/
│   │   └── [id]/
│   │       └── page.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── .eslintrc.json
├── next-env.d.ts
├── next.config.mjs
├── package.json
├── postcss.config.js
├── tailwind.config.ts
└── tsconfig.json
```

## Full file contents

### /app/layout.tsx

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PeerCode AI",
  description: "Real-time collaborative code editor"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-gray-100 antialiased">
        <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-6 py-10">
          {children}
        </main>
      </body>
    </html>
  );
}
```

### /app/page.tsx

```tsx
"use client";

import { useRouter } from "next/navigation";

function generateRoomId(length = 6): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

export default function HomePage() {
  const router = useRouter();

  const handleCreateRoom = () => {
    const roomId = generateRoomId();
    router.push(`/room/${roomId}`);
  };

  return (
    <section className="w-full rounded-2xl border border-white/10 bg-surface p-10 text-center shadow-xl shadow-black/30">
      <h1 className="text-3xl font-bold tracking-tight">PeerCode AI</h1>
      <p className="mt-3 text-sm text-gray-400">Create a room and start collaborating in real time.</p>
      <button
        type="button"
        onClick={handleCreateRoom}
        className="mt-8 rounded-lg bg-indigo-500 px-5 py-2.5 font-medium text-white transition hover:bg-indigo-400"
      >
        Create Room
      </button>
    </section>
  );
}
```

### /app/room/[id]/page.tsx

```tsx
type RoomPageProps = {
  params: {
    id: string;
  };
};

export default function RoomPage({ params }: RoomPageProps) {
  return (
    <section className="w-full rounded-2xl border border-white/10 bg-surface p-10 text-center">
      <h1 className="text-2xl font-semibold">Room</h1>
      <p className="mt-4 text-lg text-gray-300">
        Room ID: <span className="font-mono font-bold text-white">{params.id}</span>
      </p>
    </section>
  );
}
```

### /app/globals.css

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: dark;
}

body {
  margin: 0;
  background-color: #0d0d0d;
  color: #e5e7eb;
}
```

### /tailwind.config.ts

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        background: "#0d0d0d",
        surface: "#1a1a1a"
      }
    }
  },
  plugins: []
};

export default config;
```

### /postcss.config.js

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};
```

### /next.config.mjs

```js
/** @type {import("next").NextConfig} */
const nextConfig = {};

export default nextConfig;
```

### /tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### /.eslintrc.json

```json
{
  "extends": ["next/core-web-vitals", "next/typescript"]
}
```

### /next-env.d.ts

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.
```

### /package.json

```json
{
  "name": "peercode-ai",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "14.2.35",
    "react": "18.3.1",
    "react-dom": "18.3.1"
  },
  "devDependencies": {
    "@types/node": "^22.14.0",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.21",
    "eslint": "^8.57.0",
    "eslint-config-next": "14.2.35",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.13",
    "typescript": "^5.8.2"
  }
}
```
