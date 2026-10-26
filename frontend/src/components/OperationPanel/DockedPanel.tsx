import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

const SLIDE_MS = 260;

/**
 * Hosts the panel docked to the left (see OperationPanel's renderConfigPanel) so it slides in when
 * it appears and slides out when it goes: while `children` is null the last panel is kept on screen
 * for the length of the exit animation, then dropped. The styles keyed on `data-state` live in
 * AddOperationModal.css.
 */
export function DockedPanel({ children }: { children: ReactNode }) {
  // The last panel shown, kept on screen while it slides out.
  const [retained, setRetained] = useState<ReactNode>(null);

  useEffect(() => {
    if (children) {
      setRetained(children);
      return;
    }
    const timeoutId = window.setTimeout(() => setRetained(null), SLIDE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [children]);

  const node = children || retained;
  if (!node) return null;
  return (
    <div className="docked-panel" data-state={children ? 'open' : 'closed'}>
      {node}
    </div>
  );
}
