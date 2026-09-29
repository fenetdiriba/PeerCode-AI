import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { LanguageId } from '../types';
import { ICE_SERVERS, RELAY_URL, SIGNALING_URLS } from './config';
import { RelayProvider } from './relay';

// Signaling servers only help peers find each other (WebRTC offer/answer/ICE exchange).
// After that, Yjs updates flow browser-to-browser over WebRTC data channels.
// Tabs in the same browser also sync over BroadcastChannel, even with no signaling server.
// When a direct connection is impossible (strict NATs, many mobile networks), the relay
// provider carries updates through the server instead.

export interface RoomSession {
  doc: Y.Doc;
  provider: WebrtcProvider;
  relay: RelayProvider;
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
  const roomName = `peercode-${roomId}`;
  const provider = new WebrtcProvider(roomName, doc, {
    signaling: SIGNALING_URLS,
    peerOpts: ICE_SERVERS ? { config: { iceServers: ICE_SERVERS } } : {},
  });

  // Share the same awareness so presence and cursors work over either path. Updates that
  // arrived over WebRTC (origin = the y-webrtc room) aren't echoed back out through the relay.
  const relay = new RelayProvider(`${RELAY_URL}/${roomName}`, doc, provider.awareness, (origin) =>
    origin != null && origin === provider.room,
  );

  return {
    doc,
    provider,
    relay,
    meta: doc.getMap('meta'),
    chat: doc.getArray('chat'),
    // One Y.Text per language, so switching languages doesn't wipe your partner's work.
    getCode: (language) => doc.getText(`code:${language}`),
    destroy: () => {
      relay.destroy();
      provider.destroy();
      doc.destroy();
    },
  };
}

export function isSignalingConnected(provider: WebrtcProvider): boolean {
  return provider.signalingConns.some((conn) => conn.connected);
}
