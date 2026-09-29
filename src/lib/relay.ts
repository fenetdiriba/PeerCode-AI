import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';

// Message types (same numbering as y-websocket).
const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const MESSAGE_QUERY_AWARENESS = 3;

export type RelayStatus = 'connecting' | 'connected' | 'disconnected';

/**
 * Syncs a Y.Doc through the server's /relay endpoint. It runs alongside y-webrtc as a
 * fallback: when two browsers can't open a direct WebRTC connection (common on mobile
 * data), updates still reach the other side. The server only forwards frames between
 * clients in the same room; it never stores or reads the document.
 *
 * Because Yjs updates are idempotent, receiving the same edit over both WebRTC and the
 * relay is harmless.
 */
export class RelayProvider {
  status: RelayStatus = 'connecting';
  /** Other clients connected to this room's relay. */
  peerCount = 0;

  private ws: WebSocket | null = null;
  private retryMs = 1000;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private listeners = new Set<() => void>();

  constructor(
    private url: string,
    private doc: Y.Doc,
    private awareness: awarenessProtocol.Awareness,
    /** Transaction origins that came from another transport (e.g. y-webrtc); not re-sent. */
    private isForeignOrigin: (origin: unknown) => boolean,
  ) {
    doc.on('update', this.onDocUpdate);
    awareness.on('update', this.onAwarenessUpdate);
    window.addEventListener('beforeunload', this.onUnload);
    this.connect();
  }

  /** Subscribe to status / peer count changes. Returns an unsubscribe function. */
  onChange(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  private setStatus(status: RelayStatus) {
    this.status = status;
    if (status !== 'connected') this.peerCount = 0;
    this.emit();
  }

  private connect() {
    if (this.destroyed) return;
    const ws = new WebSocket(this.url);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    this.setStatus('connecting');

    ws.onopen = () => {
      this.retryMs = 1000;
      this.setStatus('connected');
      // Ask peers for what we're missing, push everything we have (they ignore what they
      // already know), and exchange awareness so names and cursors show up right away.
      const step1 = encoding.createEncoder();
      encoding.writeVarUint(step1, MESSAGE_SYNC);
      syncProtocol.writeSyncStep1(step1, this.doc);
      this.send(encoding.toUint8Array(step1));

      const full = encoding.createEncoder();
      encoding.writeVarUint(full, MESSAGE_SYNC);
      syncProtocol.writeUpdate(full, Y.encodeStateAsUpdate(this.doc));
      this.send(encoding.toUint8Array(full));

      this.sendLocalAwareness();
      const query = encoding.createEncoder();
      encoding.writeVarUint(query, MESSAGE_QUERY_AWARENESS);
      this.send(encoding.toUint8Array(query));
    };

    ws.onmessage = (e) => {
      if (typeof e.data === 'string') {
        try {
          const msg = JSON.parse(e.data);
          if (msg?.type === 'peers' && typeof msg.count === 'number') {
            this.peerCount = msg.count;
            this.emit();
          }
        } catch {
          // Ignore malformed control messages.
        }
        return;
      }
      this.onBinary(new Uint8Array(e.data as ArrayBuffer));
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.setStatus('disconnected');
      if (this.destroyed) return;
      this.retryTimer = setTimeout(() => this.connect(), this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, 30000);
    };
  }

  private onBinary(data: Uint8Array) {
    try {
      const decoder = decoding.createDecoder(data);
      const type = decoding.readVarUint(decoder);
      if (type === MESSAGE_SYNC) {
        const reply = encoding.createEncoder();
        encoding.writeVarUint(reply, MESSAGE_SYNC);
        // Answers a peer's step 1 with the updates they're missing; applies step 2 / updates.
        syncProtocol.readSyncMessage(decoder, reply, this.doc, this);
        if (encoding.length(reply) > 1) this.send(encoding.toUint8Array(reply));
      } else if (type === MESSAGE_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(decoder), this);
      } else if (type === MESSAGE_QUERY_AWARENESS) {
        this.sendLocalAwareness();
      }
    } catch (err) {
      console.warn('Ignoring malformed relay message', err);
    }
  }

  private send(data: Uint8Array) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(data);
  }

  private sendAwareness(clients: number[]) {
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(this.awareness, clients));
    this.send(encoding.toUint8Array(enc));
  }

  private sendLocalAwareness() {
    if (this.awareness.getLocalState() !== null) this.sendAwareness([this.awareness.clientID]);
  }

  private onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this || this.isForeignOrigin(origin)) return;
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MESSAGE_SYNC);
    syncProtocol.writeUpdate(enc, update);
    this.send(encoding.toUint8Array(enc));
  };

  private onAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (origin === this || this.isForeignOrigin(origin)) return;
    this.sendAwareness([...added, ...updated, ...removed]);
  };

  private onUnload = () => {
    awarenessProtocol.removeAwarenessStates(this.awareness, [this.doc.clientID], 'window unload');
  };

  destroy() {
    this.destroyed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.doc.off('update', this.onDocUpdate);
    this.awareness.off('update', this.onAwarenessUpdate);
    window.removeEventListener('beforeunload', this.onUnload);
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    this.listeners.clear();
  }
}
