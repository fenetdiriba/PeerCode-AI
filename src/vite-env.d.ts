/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Comma-separated y-webrtc signaling server URLs. Defaults to ws://localhost:4444. */
  readonly VITE_SIGNALING_URLS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
