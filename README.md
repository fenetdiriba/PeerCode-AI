# PeerCode AI

Real-time collaborative code editor built for interview prep. Two people share a room and edit code together, browser-to-browser, with no server in the data path.

## Status: Early development

Currently working on real-time sync. Core editor and room routing are in place; CRDT sync between peers is in progress.

## Tech stack

- Next.js 14 (App Router), TypeScript, Tailwind CSS
- Monaco Editor (the VS Code editor, in-browser)
- Yjs (CRDTs) + y-webrtc for peer-to-peer sync
- Node.js + Socket.io signaling server (WebRTC handshake only, no data ever touches it)
- Cosine similarity matchmaking on skill-profile vectors (planned)
- Google Gemini API for inline code hints (planned)

## How it works

Yjs assigns a unique ID to every character insertion, so when two peers edit at the same time, both changes are preserved and merged deterministically — no last-write-wins. WebRTC lets the browsers talk directly once a lightweight signaling server helps them find each other.

## Roadmap

- [x] Project scaffold + Monaco editor + room routing
- [ ] Real-time sync via Yjs + y-webrtc
- [ ] Live cursors and presence panel
- [ ] Skill-based matchmaking
- [ ] AI code hints via Gemini
- [ ] Deploy

## Running locally

\`\`\`bash
npm install
npm run dev
\`\`\`
