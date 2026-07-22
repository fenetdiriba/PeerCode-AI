"use client";

import { useRouter } from "next/navigation";

function generateRoomId(length = 6): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

export default function HomePage() {
  const router = useRouter();

  const handleCreateRoom = () => {
    const roomId = generateRoomId();
    router.push(`/room/${roomId}`);
  };

  return (
    <section className="w-full rounded-2xl border border-white/10 bg-surface p-10 text-center shadow-xl shadow-black/30">
      <h1 className="text-3xl font-bold tracking-tight">PeerCode AI</h1>
      <p className="mt-3 text-sm text-gray-400">Create a room and start collaborating in real time.</p>
      <button
        type="button"
        onClick={handleCreateRoom}
        className="mt-8 rounded-lg bg-indigo-500 px-5 py-2.5 font-medium text-white transition hover:bg-indigo-400"
      >
        Create Room
      </button>
    </section>
  );
}
