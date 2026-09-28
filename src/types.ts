export type LanguageId = 'javascript' | 'typescript' | 'python' | 'java' | 'cpp';

export interface LanguageOption {
  id: LanguageId;
  label: string;
  /** Monaco language id used for syntax highlighting. */
  monacoId: string;
  /** Whether the in-browser runner can execute this language. */
  runnable: boolean;
}

/** The local user's identity, persisted in localStorage. */
export interface UserProfile {
  name: string;
  color: string;
}

/** What each peer publishes through Yjs awareness (ephemeral, never stored). */
export interface AwarenessUser extends UserProfile {
  joinedAt: number;
}

/** A peer currently in the room, derived from awareness state. */
export interface RoomPeer extends AwarenessUser {
  clientId: number;
  isLocal: boolean;
}

/** Chat messages live in a Y.Array, so they sync like the code does. */
export interface ChatMessage {
  id: string;
  clientId: number;
  name: string;
  color: string;
  text: string;
  ts: number;
}

/**
 * red: not connected to signaling and no local peers
 * yellow: connected to signaling but alone in the room
 * green: connected to at least one peer
 */
export type ConnectionStatus = 'disconnected' | 'waiting' | 'connected';

export interface RunResult {
  lines: Array<{ kind: 'log' | 'error' | 'info'; text: string }>;
  durationMs: number;
}
