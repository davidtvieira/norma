import { CloseIcon } from '../ButtonIcons/ButtonIcons';
import { useEffect, useRef, useState } from 'react';
import { subscribeApiErrors, type ApiErrorReport } from '../../services/apiErrors';
import './ToastHost.css';

interface Toast extends ApiErrorReport {
  id: number;
  /** On its way out: it plays its exit animation, then is removed. */
  leaving?: boolean;
}

const TOAST_DURATION_MS = 6000;
/** How long the exit animation takes (see .toast--leaving) — the toast is removed once it has played. */
const TOAST_EXIT_MS = 250;
/** Oldest toasts drop off past this many, so a burst of failures (e.g. a live-result operation
 * re-erroring on every keystroke) can't stack up without bound. */
const MAX_TOASTS = 4;

/**
 * Renders a toast for every API failure (or confirmation) reported through services/apiErrors. Mounted once, at the
 * app root (see main.tsx) — nothing else needs to know toasts exist.
 */
export function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timeouts = useRef(new Map<number, number>());

  /** Slides the toast out to the right, then removes it. */
  function dismiss(id: number) {
    window.clearTimeout(timeouts.current.get(id));
    setToasts((current) => current.map((toast) => (toast.id === id ? { ...toast, leaving: true } : toast)));
    timeouts.current.set(
      id,
      window.setTimeout(() => {
        timeouts.current.delete(id);
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, TOAST_EXIT_MS),
    );
  }

  useEffect(() => {
    const pending = timeouts.current;
    const unsubscribe = subscribeApiErrors((report) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, ...report }].slice(-MAX_TOASTS));
      pending.set(id, window.setTimeout(() => dismiss(id), TOAST_DURATION_MS));
    });
    return () => {
      unsubscribe();
      pending.forEach((timeoutId) => window.clearTimeout(timeoutId));
      pending.clear();
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-host" role="region" aria-label="Notificações">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast ${toast.kind === 'success' ? 'toast--success' : 'toast--error'}${toast.leaving ? ' toast--leaving' : ''}`}
          role={toast.kind === 'success' ? 'status' : 'alert'}
        >
          <div className="toast__text">
            <p className="toast__title">{toast.title}</p>
            {toast.detail && <p className="toast__detail">{toast.detail}</p>}
          </div>
          <button type="button" className="toast__close" disabled={toast.leaving} onClick={() => dismiss(toast.id)} aria-label="Fechar notificação">
            <CloseIcon />
          </button>
        </div>
      ))}
    </div>
  );
}
