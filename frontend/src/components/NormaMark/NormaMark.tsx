interface NormaMarkProps {
  className?: string;
  /** `logo` draws it in `--logo-color`; `current` in the surrounding text color (inside a button). */
  color?: 'logo' | 'current';
}

/** The Norma icon — a node, the two connections leaving it and the nodes they reach — drawn in `--logo-color` unless told otherwise. Sized by its parent. */
export function NormaMark({ className, color = 'logo' }: NormaMarkProps) {
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true" style={{ stroke: color === 'logo' ? 'var(--logo-color)' : 'currentColor' }}>
      <g fill="none" strokeWidth="8">
        <path d="M35 60C60 60 60 30 85 30" />
        <path d="M35 60C60 60 60 90 85 90" />
        <circle cx="24" cy="60" r="11" />
        <circle cx="96" cy="30" r="11" />
        <circle cx="96" cy="90" r="11" />
      </g>
    </svg>
  );
}
