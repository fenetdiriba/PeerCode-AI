import { Code2 } from 'lucide-react';

export default function Logo({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const box = size === 'lg' ? 'h-9 w-9' : 'h-7 w-7';
  const icon = size === 'lg' ? 'h-5 w-5' : 'h-4 w-4';
  const text = size === 'lg' ? 'text-lg' : 'text-sm';
  return (
    <span className="flex items-center gap-2">
      <span className={`${box} flex items-center justify-center rounded-lg border border-blue-500/30 bg-blue-600/15`}>
        <Code2 className={`${icon} text-blue-400`} />
      </span>
      <span className={`${text} font-bold tracking-tight text-white`}>
        PeerCode<span className="text-blue-500"> AI</span>
      </span>
    </span>
  );
}
