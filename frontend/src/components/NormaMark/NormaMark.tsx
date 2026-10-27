interface NormaMarkProps {
  className?: string;
  /** `logo` draws it in `--logo-color`; `current` in the surrounding text color (inside a button). */
  color?: 'logo' | 'current';
}

/**
 * The Norma icon — a node, the two connections leaving it and the nodes they reach — drawn in `--logo-color` unless
 * told otherwise. Sized by its parent. Every part has a class so a parent can animate them (see NormaCard.css).
 */
export function NormaMark({ className, color = 'logo' }: NormaMarkProps) {
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true" style={{ stroke: color === 'logo' ? 'var(--logo-color)' : 'currentColor' }}>
      <g fill="none" strokeWidth="8">
        <path className="norma-mark__edge" d="M35 60C60 60 60 30 85 30" pathLength="100" />
        <path className="norma-mark__edge norma-mark__edge--b" d="M35 60C60 60 60 90 85 90" pathLength="100" />
        <circle className="norma-mark__node" cx="24" cy="60" r="11" />
        <circle className="norma-mark__target" cx="96" cy="30" r="11" />
        <circle className="norma-mark__target norma-mark__target--b" cx="96" cy="90" r="11" />
      </g>
    </svg>
  );
}
