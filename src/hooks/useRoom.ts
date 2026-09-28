import { useCallback, useEffect, useState } from 'react';
import { createRoomSession, isSignalingConnected, RoomSession } from '../lib/collab';
import { DEFAULT_LANGUAGE, getLanguage } from '../lib/languages';
import { AwarenessUser, ChatMessage, ConnectionStatus, LanguageId, RoomPeer, UserProfile } from '../types';

const MAX_CHAT_MESSAGES = 200;

export function useRoom(roomId: string, profile: UserProfile) {
  const [session, setSession] = useState<RoomSession | null>(null);
  const [peers, setPeers] = useState<RoomPeer[]>([]);
  const [signalingConnected, setSignalingConnected] = useState(false);
  const [language, setLanguageState] = useState<LanguageId>(DEFAULT_LANGUAGE);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    const s = createRoomSession(roomId);
    const { provider, meta, chat } = s;
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

    const onSignaling = () => setSignalingConnected(isSignalingConnected(provider));
    provider.signalingConns.forEach((conn) => {
      conn.on('connect', onSignaling);
      conn.on('disconnect', onSignaling);
    });
    onSignaling();

    const onMeta = () => setLanguageState(getLanguage(meta.get('language') as string | undefined).id);
    meta.observe(onMeta);
    onMeta();

    const onChat = () => setMessages(chat.toArray() as ChatMessage[]);
    chat.observe(onChat);
    onChat();

    return () => {
      awareness.off('change', onAwarenessChange);
      provider.signalingConns.forEach((conn) => {
        conn.off('connect', onSignaling);
        conn.off('disconnect', onSignaling);
      });
      meta.unobserve(onMeta);
      chat.unobserve(onChat);
      s.destroy();
      setSession(null);
      setPeers([]);
    };
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
  const status: ConnectionStatus =
    remoteCount > 0 ? 'connected' : signalingConnected ? 'waiting' : 'disconnected';

  return { session, peers, remoteCount, status, language, setLanguage, messages, sendMessage };
}
