import { useState } from 'react';
import type { ReactNode } from 'react';

interface SheetPanelProps {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

/**
 * The dataset's off-canvas panel on the right: slides in over a dimmed backdrop (a click on it
 * closes the panel). The arrow on its left edge widens it to the whole screen to read the data
 * better, and back. Its styles are `.sheet-panel*` in App.css.
 */
export function SheetPanel({ title, open, onClose, children }: SheetPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  // Always reopens at its usual width.
  if (!open && isExpanded) setIsExpanded(false);

  return (
    <>
      <div
        className={open ? 'sheet-panel__backdrop sheet-panel__backdrop--visible' : 'sheet-panel__backdrop'}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`sheet-panel${open ? ' sheet-panel--open' : ''}${isExpanded ? ' sheet-panel--expanded' : ''}`}
        aria-hidden={!open}
      >
        <button
          type="button"
          className="sheet-panel__expand naked-button"
          onClick={() => setIsExpanded((current) => !current)}
          aria-label={isExpanded ? 'Voltar ao tamanho normal' : 'Abrir os dados em ecrã inteiro'}
          title={isExpanded ? 'Voltar ao tamanho normal' : 'Abrir os dados em ecrã inteiro'}
          aria-pressed={isExpanded}
        >
          <svg
            className={isExpanded ? 'sheet-panel__expand-icon sheet-panel__expand-icon--collapse' : 'sheet-panel__expand-icon'}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path d="M11 6l-6 6 6 6M19 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="sheet-panel__header">
          <span className="sheet-panel__title">{title}</span>
          <button type="button" className="sheet-panel__close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="sheet-panel__body">{children}</div>
      </aside>
    </>
  );
}
