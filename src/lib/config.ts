// Where the browser finds the PeerCode server (signaling, relay, matchmaking, debugger API).
// Pages served from localhost use the local server. Everywhere else the deployed Render server
// is the default, so the live site works even without VITE_SERVER_URL. VITE_SERVER_URL (and the
// per-service variables below) still override it, except values pointing at the retired Railway
// deployment, which are ignored so a stale build setting can't break the site.
const env = import.meta.env;

/** Accept http(s):// or ws(s):// and return a WebSocket URL without a trailing slash. */
export function toWebSocketUrl(url: string): string {
  return url
    .trim()
    .replace(/^http(s?):\/\//i, 'ws$1://')
    .replace(/\/+$/, '');
}

const PRODUCTION_SERVER_URL = 'https://peercode-ai-rkzy.onrender.com';
const RETIRED_HOST = /\.up\.railway\.app/i;
/** A configured URL, unless it's empty or points at the retired Railway server. */
const usable = (value: string | undefined) => (value && !RETIRED_HOST.test(value) ? value : undefined);
const isLocalPage = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

const SERVER_URL = toWebSocketUrl(usable(env.VITE_SERVER_URL) ?? (isLocalPage ? 'ws://localhost:4444' : PRODUCTION_SERVER_URL));

export const SIGNALING_URLS: string[] = (usable(env.VITE_SIGNALING_URLS) || SERVER_URL)
  .split(',')
  .map(toWebSocketUrl)
  .filter(Boolean);

export const MATCHMAKING_URL = toWebSocketUrl(usable(env.VITE_MATCHMAKING_URL) || `${SERVER_URL}/match`);

/** Base URL for the room relay fallback; the room name is appended. */
export const RELAY_URL = toWebSocketUrl(usable(env.VITE_RELAY_URL) || `${SERVER_URL}/relay`);

/** Same server, over HTTP(S), for the AI hint endpoint. */
const toHttpUrl = (url: string) => url.replace(/^ws(s?):\/\//i, 'http$1://');
export const AI_HINT_URL = usable(env.VITE_AI_URL) || `${toHttpUrl(SERVER_URL)}/api/ai-hint`;

/** Base URL of the time-travel debugger API (checkpoints, tests, regression, Meta AI, verify). */
export const DEBUGGER_API_URL = `${toHttpUrl(SERVER_URL)}/api`;

export const IS_LOCAL_SERVER = /^wss?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(MATCHMAKING_URL);

/**
 * Optional STUN/TURN servers as JSON, e.g.
 * [{"urls":"turn:turn.example.com:3478","username":"u","credential":"p"}]
 * Without TURN, peers behind strict NATs (some campus and corporate networks) can't connect
 * directly. When unset, y-webrtc's default public STUN servers are used.
 */
export const ICE_SERVERS: RTCIceServer[] | undefined = (() => {
  if (!env.VITE_ICE_SERVERS) return undefined;
  try {
    const parsed = JSON.parse(env.VITE_ICE_SERVERS);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    console.warn('VITE_ICE_SERVERS is not valid JSON; using default STUN servers.');
    return undefined;
  }
})();
