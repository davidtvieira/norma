import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import './LoadingOverlay.css';

interface LoadingOverlayProps {
  /** Waits this long before showing, so an operation that finishes right away never flashes the
   * overlay. Defaults to showing immediately. */
  delayMs?: number;
}

/**
 * The app's one loading state: a rolling circle over a slightly darkened, full-screen backdrop that
 * also blocks clicks on whatever is behind it. Render it while something is loading, instead of
 * showing a spinner on the button that started it.
 */
export function LoadingOverlay({ delayMs = 0 }: LoadingOverlayProps) {
  const [isVisible, setIsVisible] = useState(delayMs <= 0);

  useEffect(() => {
    if (delayMs <= 0) return;
    const timeoutId = window.setTimeout(() => setIsVisible(true), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [delayMs]);

  if (!isVisible) return null;

  return createPortal(
    <div className="loading-overlay" role="status" aria-live="polite" aria-label="A carregar">
      {/* The app's icon, drawn on a loop: a node, the two connections leaving it, and the nodes they reach. */}
      <svg className="loading-overlay__mark" viewBox="0 0 120 120" aria-hidden="true">
        <g fill="none" strokeWidth="8">
          <path className="loading-overlay__edge" d="M35 60C60 60 60 30 85 30" pathLength="100" />
          <path className="loading-overlay__edge loading-overlay__edge--b" d="M35 60C60 60 60 90 85 90" pathLength="100" />
          <circle className="loading-overlay__node" cx="24" cy="60" r="11" />
          <circle className="loading-overlay__target" cx="96" cy="30" r="11" />
          <circle className="loading-overlay__target loading-overlay__target--b" cx="96" cy="90" r="11" />
        </g>
      </svg>
    </div>,
    document.body,
  );
}
