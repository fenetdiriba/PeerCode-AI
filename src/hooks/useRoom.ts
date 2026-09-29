import { useCallback, useEffect, useState } from 'react';
import { createRoomSession, isSignalingConnected, RoomSession } from '../lib/collab';
import { DEFAULT_LANGUAGE, getLanguage } from '../lib/languages';
import {
  AwarenessUser,
  ChatMessage,
  ConnectionDetails,
  ConnectionStatus,
  LanguageId,
  RoomPeer,
  UserProfile,
} from '../types';

const MAX_CHAT_MESSAGES = 200;

/** @param initialLanguage language to open a brand-new room in (set by matchmaking) */
export function useRoom(roomId: string, profile: UserProfile, initialLanguage?: LanguageId) {
  const [session, setSession] = useState<RoomSession | null>(null);
  const [peers, setPeers] = useState<RoomPeer[]>([]);
  const [connection, setConnection] = useState<ConnectionDetails>({
    signaling: false,
    relay: 'connecting',
    relayPeers: 0,
    directPeers: 0,
    sameBrowserPeers: 0,
  });
  const [language, setLanguageState] = useState<LanguageId>(DEFAULT_LANGUAGE);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    const s = createRoomSession(roomId);
    const { provider, relay, meta, chat } = s;
    const awareness = provider.awareness;
    setSession(s);

    // Awareness holds ephemeral per-peer state (name, color, cursor). It is broadcast but never stored.
    const onAwarenessChange = () => {
      const list: RoomPeer[] = [];
      awareness.getStates().forEach((state, clientId) => {
        const user = state.user as AwarenessUser | undefined;
        if (user) list.push({ ...user, clientId, isLocal: clientId === awareness.clientID });
      });
      list.sort((a, b) => Number(b.isLocal) - Number(a.isLocal) || a.joinedAt - b.joinedAt);
      setPeers(list);
    };
    awareness.on('change', onAwarenessChange);

    // y-webrtc lists peers it is still *trying* to reach; only count connections that opened.
    const onConnection = () => {
      const conns = provider.room ? [...provider.room.webrtcConns.values()] : [];
      const next: ConnectionDetails = {
        signaling: isSignalingConnected(provider),
        relay: relay.status,
        relayPeers: relay.peerCount,
        directPeers: conns.filter((c) => c.connected).length,
        sameBrowserPeers: provider.room?.bcConns.size ?? 0,
      };
      setConnection((prev) =>
        (Object.keys(next) as (keyof ConnectionDetails)[]).every((k) => prev[k] === next[k]) ? prev : next,
      );
    };
    provider.on('peers', onConnection);
    provider.signalingConns.forEach((conn) => {
      conn.on('connect', onConnection);
      conn.on('disconnect', onConnection);
    });
    // A WebRTC connection can open or drop without a 'peers' event, so re-check periodically.
    const poll = setInterval(onConnection, 2000);
    const offRelay = relay.onChange(onConnection);
    onConnection();

    // Every matched peer gets the same suggestion, so it doesn't matter who writes it first.
    if (initialLanguage && meta.get('language') === undefined) meta.set('language', initialLanguage);

    const onMeta = () => setLanguageState(getLanguage(meta.get('language') as string | undefined).id);
    meta.observe(onMeta);
    onMeta();

    const onChat = () => setMessages(chat.toArray() as ChatMessage[]);
    chat.observe(onChat);
    onChat();

    return () => {
      awareness.off('change', onAwarenessChange);
      provider.off('peers', onConnection);
      clearInterval(poll);
      provider.signalingConns.forEach((conn) => {
        conn.off('connect', onConnection);
        conn.off('disconnect', onConnection);
      });
      offRelay();
      meta.unobserve(onMeta);
      chat.unobserve(onChat);
      s.destroy();
      setSession(null);
      setPeers([]);
    };
    // initialLanguage is only read when the room is first opened.
  }, [roomId]);

  // Publish (and re-publish on rename) our identity. joinedAt is kept stable across renames.
  useEffect(() => {
    if (!session) return;
    const awareness = session.provider.awareness;
    const current = awareness.getLocalState()?.user as AwarenessUser | undefined;
    awareness.setLocalStateField('user', {
      name: profile.name,
      color: profile.color,
      joinedAt: current?.joinedAt ?? Date.now(),
    } satisfies AwarenessUser);
  }, [session, profile.name, profile.color]);

  const setLanguage = useCallback(
    (next: LanguageId) => session?.meta.set('language', next),
    [session],
  );

  const sendMessage = useCallback(
    (text: string) => {
      if (!session || !text.trim()) return;
      const { doc, chat } = session;
      const message: ChatMessage = {
        id: `${doc.clientID}-${Date.now()}`,
        clientId: doc.clientID,
        name: profile.name,
        color: profile.color,
        text: text.trim().slice(0, 2000),
        ts: Date.now(),
      };
      doc.transact(() => {
        chat.push([message]);
        if (chat.length > MAX_CHAT_MESSAGES) chat.delete(0, chat.length - MAX_CHAT_MESSAGES);
      });
    },
    [session, profile.name, profile.color],
  );

  const remoteCount = peers.filter((p) => !p.isLocal).length;
  const online = connection.signaling || connection.relay === 'connected';
  const status: ConnectionStatus = remoteCount > 0 ? 'connected' : online ? 'waiting' : 'disconnected';

  return { session, peers, remoteCount, status, connection, language, setLanguage, messages, sendMessage };
}
