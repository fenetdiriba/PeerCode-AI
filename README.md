# PeerCode AI

Real-time collaborative code editor built for interview prep. Two people share a room and edit code together, browser-to-browser over WebRTC, with a server relay as a fallback on networks that block direct connections.

## Status

Real-time sync, live cursors, presence, chat, an in-browser runner, and skill-based matchmaking all work. Next up: voice chat and AI hints.

## Features

- **Skill-based matchmaking.** Fill in a quick skill profile (languages, topics, level), hit *Find partner*, and get paired with the closest match in the queue. Both people land in the same new room, opened in a language they share.
- **Rooms by link.** Create a room, share the URL (`/#/room/abc123`), and anyone with it joins the same session. No accounts.
- **Conflict-free sync.** Code is a Yjs `Y.Text` CRDT, bound to Monaco with `y-monaco`. Concurrent edits from any number of peers merge to the same result on every client.
- **Peer-to-peer, with a fallback.** `y-webrtc` sends updates over WebRTC data channels, and the signaling server only introduces peers. Some networks (many mobile carriers, campus Wi-Fi) block direct connections, so each room also connects to a relay on the server that forwards Yjs updates between the people in that room. It never parses or stores them. Tabs in the same browser also sync over BroadcastChannel.
- **Live cursors and presence.** Each peer's name, color, cursor, and selection are shared through Yjs awareness (temporary state that's never stored). A side panel shows who's in the room.
- **Shared room state.** The active language and the chat live in the same Y.Doc, so they sync like the code does. Each language has its own file.
- **Run code.** JavaScript and TypeScript run in a throwaway Web Worker with a 5s timeout (TypeScript is compiled with sucrase). Shortcut: Ctrl/Cmd + Enter.
- **Connection status.** Green means connected to peers (and whether it's *direct* or *via server relay*), yellow means online with no peers yet, red means the server can't be reached. Click it for a details panel. Offline edits merge when you reconnect.

## Tech stack

- Vite + React 19, TypeScript, Tailwind CSS v4, Motion
- Monaco Editor (the VS Code editor, loaded from the local `monaco-editor` package)
- Yjs + y-webrtc + y-monaco for CRDT sync, awareness, and cursors
- Node.js + `ws` server for WebRTC signaling and the matchmaking queue (`server/`)

## Running locally

```bash
npm install
npm run dev:all      # server (signaling + matchmaking) on :4444, app on :3000
```

Open `http://localhost:3000`, create a room, and open the same link in another browser or another tab.

To run the two processes separately, use `npm run server` and `npm run dev`. To point the app at a different server, set `VITE_SERVER_URL` in `.env` (see `.env.example`).

To try matchmaking by yourself, open `/#/match` in two different browsers (or one normal window and one private window). Two tabs in the same browser share a profile, and you're never matched with yourself.

```bash
npm test             # matching math, matchmaking queue, relay (node:test)
npm run lint         # TypeScript
```

## Deploying

The frontend goes on Vercel and the Node server on Railway (or Render). Config for all three is in the repo. See **[DEPLOY.md](DEPLOY.md)** for the step-by-step checklist.

## How it works

```
 Browser A                          Browser B
 Monaco <-> y-monaco <-> Y.Doc  <== WebRTC data channel ==>  Y.Doc <-> y-monaco <-> Monaco
                          |  \                               /  |
                          |   \--- signaling (ws :4444) ----/   |   introduces peers
                          \------- relay (ws :4444/relay) ------/   fallback when direct is blocked
```

Yjs gives every inserted character a unique ID (client ID + logical clock), so when two peers type at once, both inserts are kept and ordered the same way everywhere. There's no last-write-wins. Awareness is a separate channel for temporary per-peer state (name, color, cursor) that is broadcast but never saved.

Both transports run at once. Yjs updates are idempotent, so receiving the same edit over WebRTC and the relay is harmless. Updates that arrived over WebRTC aren't echoed back out through the relay.

## How matchmaking works

Each profile becomes a 15-number vector: 7 one-hot language slots, 7 one-hot topic slots, and a level slot (beginner 0, intermediate 0.5, advanced 1). Two people's similarity is the cosine of the angle between their vectors, `a·b / (|a||b|)`. That's 1 for identical interests and 0 for nothing in common. Because it looks at direction, not length, ticking more boxes doesn't count against you.

The server keeps a queue in memory. Every second it scores every waiting pair, then pairs people greedily from the best score down. A pair has to clear a minimum score that starts at 0.75 and relaxes toward 0 over 30 seconds of waiting, so close matches come first and nobody waits forever. Matched users get a fresh room id, their partner's profile, the overlap, and a suggested editor language (the first shared language the editor supports).

The math lives in `shared/matching.js` and is used by both the server and the UI.

## Project layout

```
server/index.js            one port: signaling (any path) + matchmaking (/match) + relay (/relay/:room) + /health
server/relay.js            room relay fallback (forwards frames, stores nothing)
server/signaling.js        y-webrtc compatible signaling
server/matchmaking.js      in-memory matchmaking queue
shared/matching.js         profile vectors, cosine similarity, pairing (+ tests)
src/App.tsx                hash routing (#/, #/match, #/room/:id) + profile
src/hooks/useRoom.ts       room lifecycle: doc, provider, awareness, chat, language
src/hooks/useMatchmaking.ts  matchmaking WebSocket client
src/lib/config.ts          server URL / ICE config from env
src/lib/collab.ts          Y.Doc + WebrtcProvider + relay setup
src/lib/relay.ts           relay provider (Yjs sync + awareness over WebSocket)
src/lib/runner.ts          sandboxed JS/TS execution in a Web Worker
src/lib/monaco.ts          Monaco workers + theme
src/components/            LandingView, OnboardingModal, MatchView, RoomView, CodeEditor, PresencePanel, ChatPanel, OutputPanel, StatusBar
```

## Roadmap

- [x] Project scaffold + Monaco editor + room routing
- [x] Real-time sync via Yjs + y-webrtc
- [x] Live cursors, presence panel, synced chat
- [x] In-browser JS/TS runner
- [x] Skill-profile onboarding + cosine-similarity matchmaking
- [ ] Voice chat (Daily.co)
- [ ] AI code hints via Gemini
- [ ] Python runner (Pyodide)
- [x] Deploy config (Vercel + Railway/Render), see DEPLOY.md
- [ ] Live URL
