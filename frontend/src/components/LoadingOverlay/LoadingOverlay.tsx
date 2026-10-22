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
      <span className="loading-overlay__spinner" />
    </div>,
    document.body,
  );
}
