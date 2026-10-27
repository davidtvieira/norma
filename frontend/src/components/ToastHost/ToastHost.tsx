import { useEffect, useRef, useState } from 'react';
import { subscribeApiErrors, type ApiErrorReport } from '../../services/apiErrors';
import './ToastHost.css';

interface Toast extends ApiErrorReport {
  id: number;
}

const TOAST_DURATION_MS = 6000;
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

  function dismiss(id: number) {
    window.clearTimeout(timeouts.current.get(id));
    timeouts.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  useEffect(() => {
    const pending = timeouts.current;
    const unsubscribe = subscribeApiErrors((report) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, ...report }].slice(-MAX_TOASTS));
      pending.set(
        id,
        window.setTimeout(() => {
          pending.delete(id);
          setToasts((current) => current.filter((toast) => toast.id !== id));
        }, TOAST_DURATION_MS),
      );
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
          className={toast.kind === 'success' ? 'toast toast--success' : 'toast toast--error'}
          role={toast.kind === 'success' ? 'status' : 'alert'}
        >
          <div className="toast__text">
            <p className="toast__title">{toast.title}</p>
            {toast.detail && <p className="toast__detail">{toast.detail}</p>}
          </div>
          <button type="button" className="toast__close" onClick={() => dismiss(toast.id)} aria-label="Fechar notificação">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
