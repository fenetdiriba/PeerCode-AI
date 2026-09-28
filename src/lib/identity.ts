import { UserProfile } from '../types';

const STORAGE_KEY = 'peercode:profile';

// High-contrast colors that read well on the dark editor background.
export const CURSOR_COLORS = [
  '#60a5fa', // blue
  '#34d399', // emerald
  '#f472b6', // pink
  '#fbbf24', // amber
  '#a78bfa', // violet
  '#f87171', // red
  '#22d3ee', // cyan
  '#a3e635', // lime
];

const ADJECTIVES = ['Swift', 'Quiet', 'Clever', 'Bright', 'Bold', 'Calm', 'Lucky', 'Sharp'];
const ANIMALS = ['Otter', 'Falcon', 'Panda', 'Fox', 'Koala', 'Heron', 'Lynx', 'Orca'];

const pick = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

/** Keep names short and free of characters that would break CSS `content` strings. */
export function sanitizeName(raw: string): string {
  return raw.replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 24);
}

export function loadProfile(): UserProfile {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<UserProfile>;
      const name = sanitizeName(parsed.name ?? '');
      if (name && parsed.color && CURSOR_COLORS.includes(parsed.color)) {
        return { name, color: parsed.color };
      }
    }
  } catch {
    // Storage unavailable or corrupt: fall through to a fresh profile.
  }
  const profile = { name: `${pick(ADJECTIVES)} ${pick(ANIMALS)}`, color: pick(CURSOR_COLORS) };
  saveProfile(profile);
  return profile;
}

export function saveProfile(profile: UserProfile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Private mode etc. The profile still works for this session.
  }
}

const ROOM_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function generateRoomId(length = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => ROOM_ALPHABET[b % ROOM_ALPHABET.length]).join('');
}

export const ROOM_ID_PATTERN = /^[a-z0-9]{3,32}$/;

/** Accepts a bare room code or a pasted room URL and returns a normalized room id. */
export function parseRoomInput(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  const fromUrl = trimmed.match(/#\/room\/([a-z0-9]+)/);
  const candidate = fromUrl ? fromUrl[1] : trimmed;
  return ROOM_ID_PATTERN.test(candidate) ? candidate : null;
}
