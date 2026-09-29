import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import LandingView from './components/LandingView';
import MatchView from './components/MatchView';
import OnboardingModal from './components/OnboardingModal';
import {
  generateRoomId,
  hasSeenOnboarding,
  loadProfile,
  markOnboardingSeen,
  ROOM_ID_PATTERN,
  saveProfile,
  setPendingRoomLanguage,
} from './lib/identity';
import { UserProfile } from './types';

// Monaco + Yjs are heavy; only load them once someone actually enters a room.
const RoomView = lazy(() => import('./components/RoomView'));

type Route = { view: 'landing' } | { view: 'match' } | { view: 'room'; roomId: string };

/** Hash routing (#/room/abc123, #/match) keeps deep links working on any static host. */
function routeFromHash(): Route {
  const hash = window.location.hash;
  if (hash === '#/match') return { view: 'match' };
  const id = hash.match(/^#\/room\/([a-z0-9]+)$/i)?.[1].toLowerCase();
  return id && ROOM_ID_PATTERN.test(id) ? { view: 'room', roomId: id } : { view: 'landing' };
}

export default function App() {
  const [route, setRoute] = useState<Route>(routeFromHash);
  const [profile, setProfile] = useState<UserProfile>(loadProfile);
  // First-time visitors to the landing page get the skill-profile modal once.
  const [editingSkills, setEditingSkills] = useState(() => route.view === 'landing' && !hasSeenOnboarding());

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    document.title =
      route.view === 'room'
        ? `Room ${route.roomId} · PeerCode AI`
        : route.view === 'match'
          ? 'Find a partner · PeerCode AI'
          : 'PeerCode AI';
  }, [route]);

  const updateProfile = useCallback((next: UserProfile) => {
    setProfile(next);
    saveProfile(next);
  }, []);

  const closeSkills = useCallback(() => {
    markOnboardingSeen();
    setEditingSkills(false);
  }, []);

  const goToRoom = (id: string) => {
    window.location.hash = `#/room/${id}`;
  };

  if (route.view === 'room') {
    return (
      <Suspense
        fallback={
          <div className="flex h-dvh items-center justify-center font-mono text-sm text-brand-text-muted">
            Opening room {route.roomId}…
          </div>
        }
      >
        <RoomView
          key={route.roomId}
          roomId={route.roomId}
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
    <>
      {route.view === 'match' ? (
        <MatchView
          profile={profile}
          onEditProfile={() => setEditingSkills(true)}
          onBack={() => {
            window.location.hash = '';
          }}
          onMatched={(match) => {
            setPendingRoomLanguage(match.roomId, match.language);
            goToRoom(match.roomId);
          }}
        />
      ) : (
        <LandingView
          profile={profile}
          onProfileChange={updateProfile}
          onCreateRoom={() => goToRoom(generateRoomId())}
          onFindPartner={() => {
            window.location.hash = '#/match';
          }}
          onEditSkills={() => setEditingSkills(true)}
          onJoinRoom={goToRoom}
        />
      )}
      {editingSkills && (
        <OnboardingModal
          profile={profile}
          onClose={closeSkills}
          onSave={(next) => {
            updateProfile(next);
            closeSkills();
          }}
        />
      )}
    </>
  );
}
