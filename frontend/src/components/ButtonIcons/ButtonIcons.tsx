/** Small line icons for text buttons — sized and colored by the button (1em box, currentColor). */
const svgProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg',
  'aria-hidden': true,
  className: 'button-icon',
} as const;

const strokeProps = { stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/** Tray with an arrow into it — "Carregar". */
export function LoadIcon() {
  return (
    <svg {...svgProps}>
      <path d="M12 4v11m0 0-4-4m4 4 4-4" {...strokeProps} />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" {...strokeProps} />
    </svg>
  );
}

/** Tray with an arrow out of it — "Guardar". */
export function SaveIcon() {
  return (
    <svg {...svgProps}>
      <path d="M12 15V4m0 0L8 8m4-4 4 4" {...strokeProps} />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" {...strokeProps} />
    </svg>
  );
}

/** Eraser-like sweep — "Limpar". */
export function ClearIcon() {
  return (
    <svg {...svgProps}>
      <path d="M6 6l12 12M18 6 6 18" {...strokeProps} />
    </svg>
  );
}

/** Floppy disk — saving the model itself ("Guardar modelo"). */
export function DiskIcon() {
  return (
    <svg {...svgProps}>
      <path d="M5 4h11l3 3v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4Z" {...strokeProps} />
      <path d="M8 4v5h7V4M8 20v-6h8v6" {...strokeProps} />
    </svg>
  );
}

/** Table grid — looking at the dataset ("Ver dados"). */
export function SpreadsheetIcon() {
  return (
    <svg {...svgProps}>
      <rect x="4" y="4" width="16" height="16" rx="2" {...strokeProps} />
      <path d="M4 10h16M4 15h16M10 4v16" {...strokeProps} />
    </svg>
  );
}

/** Lightning bolt — running a test ("Testar modelo"). */
export function BoltIcon() {
  return (
    <svg {...svgProps}>
      <path d="M13 3 5 13.5h6L10 21l9-11h-6.5L13 3Z" {...strokeProps} />
    </svg>
  );
}
