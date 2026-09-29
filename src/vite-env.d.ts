/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Comma-separated y-webrtc signaling server URLs. Defaults to ws://localhost:4444. */
  readonly VITE_SIGNALING_URLS?: string;
  /** Matchmaking WebSocket URL. Defaults to ws://localhost:4444/match. */
  readonly VITE_MATCHMAKING_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
