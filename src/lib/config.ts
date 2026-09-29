// Where the browser finds the PeerCode server (signaling + matchmaking).
// In production set one variable, VITE_SERVER_URL, to the deployed server,
// e.g. https://peercode-server.up.railway.app. The per-service variables below
// override it if you ever split signaling and matchmaking onto different hosts.

const env = import.meta.env;

/** Accept http(s):// or ws(s):// and return a WebSocket URL without a trailing slash. */
export function toWebSocketUrl(url: string): string {
  return url
    .trim()
    .replace(/^http(s?):\/\//i, 'ws$1://')
    .replace(/\/+$/, '');
}

const SERVER_URL = toWebSocketUrl(env.VITE_SERVER_URL || 'ws://localhost:4444');

export const SIGNALING_URLS: string[] = (env.VITE_SIGNALING_URLS || SERVER_URL)
  .split(',')
  .map(toWebSocketUrl)
  .filter(Boolean);

export const MATCHMAKING_URL = toWebSocketUrl(env.VITE_MATCHMAKING_URL || `${SERVER_URL}/match`);

/** Base URL for the room relay fallback; the room name is appended. */
export const RELAY_URL = toWebSocketUrl(env.VITE_RELAY_URL || `${SERVER_URL}/relay`);

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
