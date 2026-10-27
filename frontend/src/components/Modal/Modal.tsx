import { CloseIcon } from '../ButtonIcons/ButtonIcons';
import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './Modal.css';

interface ModalProps {
  title: ReactNode;
  /** A smaller line under the title (an operation's kind, say). */
  subtitle?: ReactNode;
  /** `sm` for a short form or text, `md` for a list, `lg` for a wide two-column dialog. */
  size?: 'sm' | 'md' | 'lg';
  /** Closes the modal — the × button, a click on the backdrop and Escape all end up here. */
  onClose: () => void;
  /** While true nothing closes it (a run is in progress). */
  closeDisabled?: boolean;
  /** Whether a click on the backdrop closes it (default). */
  closeOnBackdrop?: boolean;
  /** Whether Escape closes it (default) — off while something else on screen, like the dataset panel, is
   * the one Escape should close. */
  escapeCloses?: boolean;
  /** `left` pushes the dialog to the left edge, leaving room for the dataset panel on the right. */
  align?: 'center' | 'left';
  /** The buttons at the bottom, right-aligned: a `modal__button--ghost` dismiss button, then the
   * main action (`modal__button action-button`). Left out when the × is enough. */
  actions?: ReactNode;
  children?: ReactNode;
}

/** The modals stacked on screen, oldest first — Escape only closes the top one. */
const openModals: symbol[] = [];

/**
 * The app's one modal: backdrop, dialog, title with its ×, scrolling body and a row of actions.
 * Every dialog is built on it, so they all look and behave the same. Rendered in the page body so
 * no transformed or clipped ancestor can move or cut it.
 */
export function Modal({ title, subtitle, size = 'sm', onClose, closeDisabled = false, closeOnBackdrop = true, escapeCloses = true, align = 'center', actions, children }: ModalProps) {
  const titleId = useId();

  // The latest props, read by the one Escape listener below so it never has to be re-registered
  // (re-registering on every render would reshuffle which stacked modal is on top).
  const latest = useRef({ onClose, closeDisabled, escapeCloses });
  useEffect(() => {
    latest.current = { onClose, closeDisabled, escapeCloses };
  });

  useEffect(() => {
    const id = Symbol('modal');
    openModals.push(id);
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && openModals[openModals.length - 1] === id && !latest.current.closeDisabled && latest.current.escapeCloses) {
        latest.current.onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      openModals.splice(openModals.indexOf(id), 1);
    };
  }, []);

  return createPortal(
    <div className={align === 'left' ? 'modal__overlay modal__overlay--left' : 'modal__overlay'} onClick={closeDisabled || !closeOnBackdrop ? undefined : onClose}>
      <div
        className={`modal modal--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal__header">
          <div className="modal__heading">
            <h2 id={titleId} className="modal__title">
              {title}
            </h2>
            {subtitle && <div className="modal__subtitle">{subtitle}</div>}
          </div>
          <button type="button" className="modal__close" onClick={onClose} disabled={closeDisabled} aria-label="Fechar">
            <CloseIcon />
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {actions && <div className="modal__actions">{actions}</div>}
      </div>
    </div>,
    document.body,
  );
}
