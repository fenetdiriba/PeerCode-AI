import { useCallback, useEffect, useRef, useState } from 'react';
import { IS_LOCAL_SERVER, MATCHMAKING_URL } from '../lib/config';
import { MatchServerMessage, UserProfile } from '../types';

export type Match = Extract<MatchServerMessage, { type: 'matched' }>;

export type MatchState =
  | { phase: 'idle' }
  | { phase: 'connecting' }
  | { phase: 'searching'; since: number; queueSize: number }
  | { phase: 'matched'; match: Match }
  | { phase: 'error'; message: string };

export function useMatchmaking(profile: UserProfile) {
  const [state, setState] = useState<MatchState>({ phase: 'idle' });
  const socketRef = useRef<WebSocket | null>(null);

  const closeSocket = () => {
    const ws = socketRef.current;
    socketRef.current = null;
    if (ws) {
      ws.onclose = null;
      ws.close();
    }
  };

  useEffect(() => closeSocket, []);

  const start = useCallback(() => {
    if (!profile.skills) return;
    closeSocket();
    setState({ phase: 'connecting' });

    const ws = new WebSocket(MATCHMAKING_URL);
    socketRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: 'join',
          profile: { name: profile.name, userId: profile.userId, skills: profile.skills },
        }),
      );
      setState({ phase: 'searching', since: Date.now(), queueSize: 1 });
    };

    ws.onmessage = (e) => {
      let msg: MatchServerMessage;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.type === 'queue') {
        setState((s) => (s.phase === 'searching' ? { ...s, queueSize: msg.size } : s));
      } else if (msg.type === 'matched') {
        closeSocket();
        setState({ phase: 'matched', match: msg });
      } else if (msg.type === 'error') {
        closeSocket();
        setState({ phase: 'error', message: msg.message });
      }
    };

    ws.onclose = () => {
      if (socketRef.current !== ws) return;
      socketRef.current = null;
      setState({
        phase: 'error',
        message: IS_LOCAL_SERVER
          ? "Can't reach the matchmaking server. Start it with `npm run server`."
          : "Can't reach the matchmaking server right now. Try again in a moment.",
      });
    };
  }, [profile.name, profile.userId, profile.skills]);

  const cancel = useCallback(() => {
    const ws = socketRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'leave' }));
    closeSocket();
    setState({ phase: 'idle' });
  }, []);

  return { state, start, cancel };
}
