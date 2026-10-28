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

/** How long the closing animation of a modal lasts (see animateOut and `.modal__overlay--leaving` in Modal.css). */
const LEAVE_MS = 220;

/**
 * Plays a modal's entrance backwards once it has been removed: a copy of its last look is put back on screen, fades out
 * while the box sinks, and is dropped. Done here, once, for every modal — the owners just stop rendering it, as they
 * always did, so none of them needs an exit state of its own. The copy is inert (it can't be clicked or focused).
 */
function animateOut(overlay: HTMLElement) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ghost = overlay.cloneNode(true) as HTMLElement;
  ghost.classList.add('modal__overlay--leaving');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.setAttribute('inert', '');
  ghost.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
  document.body.appendChild(ghost);
  window.setTimeout(() => ghost.remove(), LEAVE_MS + 80);
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
  const overlayRef = useRef<HTMLDivElement>(null);

  // When the modal goes away for real (its owner stopped rendering it) its box is already out of the document by the time
  // this cleanup runs; React's development double-run (mount, cleanup, mount) happens with it still in place — skipped.
  useEffect(() => {
    const overlay = overlayRef.current;
    return () => {
      if (overlay && !overlay.isConnected) animateOut(overlay);
    };
  }, []);

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
    <div ref={overlayRef} className={align === 'left' ? 'modal__overlay modal__overlay--left' : 'modal__overlay'} onClick={closeDisabled || !closeOnBackdrop ? undefined : onClose}>
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
