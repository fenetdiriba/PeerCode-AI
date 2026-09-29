/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The PeerCode server (signaling + matchmaking), http(s) or ws(s). Defaults to ws://localhost:4444. */
  readonly VITE_SERVER_URL?: string;
  /** Optional STUN/TURN servers as a JSON array of RTCIceServer. */
  readonly VITE_ICE_SERVERS?: string;
  /** Override: comma-separated y-webrtc signaling server URLs. */
  readonly VITE_SIGNALING_URLS?: string;
  /** Override: matchmaking WebSocket URL. Defaults to VITE_SERVER_URL + /match. */
  readonly VITE_MATCHMAKING_URL?: string;
  /** Override: room relay base URL. Defaults to VITE_SERVER_URL + /relay. */
  readonly VITE_RELAY_URL?: string;
  /** Override: AI hint endpoint. Defaults to VITE_SERVER_URL (as http/https) + /api/ai-hint. */
  readonly VITE_AI_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
