# PeerCode AI

Real-time collaborative code editor built for interview prep. Two people share a room and edit code together, browser-to-browser, with no server in the data path.

## Status

Real-time sync, live cursors, presence, chat, and an in-browser runner all work. Next up: voice chat, matchmaking, and AI hints.

## Features

- **Rooms by link.** Create a room, share the URL (`/#/room/abc123`), and anyone with it joins the same session. No accounts.
- **Conflict-free sync.** Code is a Yjs `Y.Text` CRDT, bound to Monaco with `y-monaco`. Concurrent edits from any number of peers merge to the same result on every client.
- **Peer-to-peer.** `y-webrtc` sends updates over WebRTC data channels. The signaling server only introduces peers. Tabs in the same browser also sync over BroadcastChannel.
- **Live cursors and presence.** Each peer's name, color, cursor, and selection are shared through Yjs awareness (temporary state that's never stored). A side panel shows who's in the room.
- **Shared room state.** The active language and the chat live in the same Y.Doc, so they sync like the code does. Each language has its own file.
- **Run code.** JavaScript and TypeScript run in a throwaway Web Worker with a 5s timeout (TypeScript is compiled with sucrase). Shortcut: Ctrl/Cmd + Enter.
- **Connection status.** Green means connected to peers, yellow means online with no peers yet, red means offline. Offline edits merge when you reconnect.

## Tech stack

- Vite + React 19, TypeScript, Tailwind CSS v4, Motion
- Monaco Editor (the VS Code editor, loaded from the local `monaco-editor` package)
- Yjs + y-webrtc + y-monaco for CRDT sync, awareness, and cursors
- Node.js + `ws` signaling server (`server/signaling.js`)

## Running locally

```bash
npm install
npm run dev:all      # signaling server on :4444 + app on :3000
```

Open `http://localhost:3000`, create a room, and open the same link in another browser or another tab.

To run the two processes separately, use `npm run signal` and `npm run dev`. To point at a different signaling server, set `VITE_SIGNALING_URLS` (comma-separated) in `.env`. See `.env.example`.

## How it works

```
 Browser A                          Browser B
 Monaco <-> y-monaco <-> Y.Doc  <== WebRTC data channel ==>  Y.Doc <-> y-monaco <-> Monaco
                           \                                  /
                            \--- signaling (ws :4444) -------/   only for the initial handshake
```

Yjs gives every inserted character a unique ID (client ID + logical clock), so when two peers type at once, both inserts are kept and ordered the same way everywhere. There's no last-write-wins. Awareness is a separate channel for temporary per-peer state (name, color, cursor) that is broadcast but never saved.

## Project layout

```
server/signaling.js        y-webrtc compatible signaling server
src/App.tsx                hash routing + profile
src/hooks/useRoom.ts       room lifecycle: doc, provider, awareness, chat, language
src/lib/collab.ts          Y.Doc + WebrtcProvider setup
src/lib/runner.ts          sandboxed JS/TS execution in a Web Worker
src/lib/monaco.ts          Monaco workers + theme
src/components/            LandingView, RoomView, CodeEditor, PresencePanel, ChatPanel, OutputPanel, StatusBar
```

## Roadmap

- [x] Project scaffold + Monaco editor + room routing
- [x] Real-time sync via Yjs + y-webrtc
- [x] Live cursors, presence panel, synced chat
- [x] In-browser JS/TS runner
- [ ] Voice chat (Daily.co)
- [ ] Skill-based matchmaking (cosine similarity)
- [ ] AI code hints via Gemini
- [ ] Python runner (Pyodide)
- [ ] Deploy (static frontend + signaling server)
