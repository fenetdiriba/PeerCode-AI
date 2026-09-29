interface ChipGroupProps<T extends string> {
  options: readonly T[];
  selected: readonly T[];
  onToggle?: (value: T) => void;
  /** Values to emphasize, e.g. skills shared with a match. */
  highlight?: readonly T[];
}

/** Toggleable chips when `onToggle` is given, read-only tags otherwise. */
export default function SkillChips<T extends string>({ options, selected, onToggle, highlight }: ChipGroupProps<T>) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const on = selected.includes(option);
        const strong = highlight?.includes(option);
        const base = 'rounded-full border px-3 py-1 text-xs font-medium transition-colors';
        const look = strong
          ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
          : on
            ? 'border-blue-400/70 bg-blue-600/30 text-white'
            : 'border-brand-border text-brand-text-muted';
        if (!onToggle) {
          return on ? (
            <span key={option} className={`${base} ${look}`}>
              {option}
            </span>
          ) : null;
        }
        return (
          <button
            key={option}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(option)}
            className={`${base} ${look} ${on ? '' : 'hover:border-white/20 hover:text-white'}`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
