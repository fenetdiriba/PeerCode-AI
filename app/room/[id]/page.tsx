type RoomPageProps = {
  params: {
    id: string;
  };
};

export default function RoomPage({ params }: RoomPageProps) {
  return (
    <section className="w-full rounded-2xl border border-white/10 bg-surface p-10 text-center">
      <h1 className="text-2xl font-semibold">Room</h1>
      <p className="mt-4 text-lg text-gray-300">
        Room ID: <span className="font-mono font-bold text-white">{params.id}</span>
      </p>
    </section>
  );
}
