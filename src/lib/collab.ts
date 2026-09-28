import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { LanguageId } from '../types';

/**
 * Signaling servers only help peers find each other (WebRTC offer/answer/ICE exchange).
 * After that, every Yjs update flows browser-to-browser over WebRTC data channels.
 * Tabs in the same browser also sync over BroadcastChannel, even with no signaling server.
 */
const SIGNALING_URLS = (import.meta.env.VITE_SIGNALING_URLS || 'ws://localhost:4444')
  .split(',')
  .map((url: string) => url.trim())
  .filter(Boolean);

export interface RoomSession {
  doc: Y.Doc;
  provider: WebrtcProvider;
  /** Shared room settings, e.g. the active language, so every peer sees the same file. */
  meta: Y.Map<unknown>;
  chat: Y.Array<unknown>;
  getCode: (language: LanguageId) => Y.Text;
  destroy: () => void;
}

export function createRoomSession(roomId: string): RoomSession {
  // A Y.Doc is the shared document. Everything inside it (texts, maps, arrays) is a CRDT,
  // so concurrent edits from any number of peers merge to the same result on every client.
  const doc = new Y.Doc();

  // The provider syncs the doc with everyone else in the same named room.
  const provider = new WebrtcProvider(`peercode-${roomId}`, doc, { signaling: SIGNALING_URLS });

  return {
    doc,
    provider,
    meta: doc.getMap('meta'),
    chat: doc.getArray('chat'),
    // One Y.Text per language, so switching languages doesn't wipe your partner's work.
    getCode: (language) => doc.getText(`code:${language}`),
    destroy: () => {
      provider.destroy();
      doc.destroy();
    },
  };
}

export function isSignalingConnected(provider: WebrtcProvider): boolean {
  return provider.signalingConns.some((conn) => conn.connected);
}
