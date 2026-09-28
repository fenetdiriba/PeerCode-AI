import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import LandingView from './components/LandingView';
import { generateRoomId, loadProfile, ROOM_ID_PATTERN, saveProfile } from './lib/identity';
import { UserProfile } from './types';

// Monaco + Yjs are heavy; only load them once someone actually enters a room.
const RoomView = lazy(() => import('./components/RoomView'));

/** Hash routing (#/room/abc123) keeps deep links working on any static host. */
function roomFromHash(): string | null {
  const match = window.location.hash.match(/^#\/room\/([a-z0-9]+)$/i);
  const id = match?.[1].toLowerCase();
  return id && ROOM_ID_PATTERN.test(id) ? id : null;
}

export default function App() {
  const [roomId, setRoomId] = useState<string | null>(roomFromHash);
  const [profile, setProfile] = useState<UserProfile>(loadProfile);

  useEffect(() => {
    const onHashChange = () => setRoomId(roomFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    document.title = roomId ? `Room ${roomId} · PeerCode AI` : 'PeerCode AI';
  }, [roomId]);

  const updateProfile = useCallback((next: UserProfile) => {
    setProfile(next);
    saveProfile(next);
  }, []);

  const goToRoom = (id: string) => {
    window.location.hash = `#/room/${id}`;
  };

  if (roomId) {
    return (
      <Suspense
        fallback={
          <div className="flex h-dvh items-center justify-center font-mono text-sm text-brand-text-muted">
            Opening room {roomId}…
          </div>
        }
      >
        <RoomView
          key={roomId}
          roomId={roomId}
          profile={profile}
          onProfileChange={updateProfile}
          onLeave={() => {
            window.location.hash = '';
          }}
        />
      </Suspense>
    );
  }

  return (
    <LandingView
      profile={profile}
      onProfileChange={updateProfile}
      onCreateRoom={() => goToRoom(generateRoomId())}
      onJoinRoom={goToRoom}
    />
  );
}
