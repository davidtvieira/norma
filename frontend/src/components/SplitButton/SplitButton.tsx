import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import './SplitButton.css';

export interface SplitButtonItem {
  label: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
}

interface SplitButtonProps {
  /** The main button's content. */
  children: ReactNode;
  onClick: () => void;
  /** Disables the main button only — the arrow stays usable unless `arrowDisabled` says otherwise. */
  disabled?: boolean;
  arrowDisabled?: boolean;
  /** What the arrow opens: one entry per extra option. */
  items: SplitButtonItem[];
  arrowLabel?: string;
  /** Extra classes for both halves (size, color). The main part is always an `action-button`. */
  buttonClassName?: string;
  /** Extra classes for the wrapper (layout). */
  className?: string;
  /** Anything else of the main button's, such as a tooltip or `aria-busy`. */
  mainProps?: { title?: string; 'aria-busy'?: boolean };
}

/**
 * A button with an arrow joined to its right edge: the main part does the usual thing, the arrow
 * opens a small menu (upward, since these sit at the bottom of the screen or of a modal) with the
 * alternatives. Closes on a click outside or Escape.
 */
export function SplitButton({
  children,
  onClick,
  disabled = false,
  arrowDisabled = false,
  items,
  arrowLabel = 'Mais opções',
  buttonClassName = '',
  className = '',
  mainProps,
}: SplitButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function closeOnOutsideClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setIsOpen(false);
    }
    // Capturing, and stopping the event, so Escape closes only this menu and not the modal around it.
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setIsOpen(false);
    }
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape, true);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape, true);
    };
  }, [isOpen]);

  return (
    <div className={`split-button ${className}`} ref={ref}>
      <button
        type="button"
        className={`split-button__main action-button ${buttonClassName}`}
        onClick={onClick}
        disabled={disabled}
        {...mainProps}
      >
        {children}
      </button>
      <button
        type="button"
        className={`split-button__arrow action-button ${buttonClassName}`}
        onClick={() => setIsOpen((current) => !current)}
        disabled={arrowDisabled}
        aria-label={arrowLabel}
        title={arrowLabel}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {isOpen && (
        <div className="split-button__menu" role="menu">
          {items.map((item, index) => (
            <button
              key={index}
              type="button"
              role="menuitem"
              className="split-button__item"
              disabled={item.disabled}
              onClick={() => {
                setIsOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
