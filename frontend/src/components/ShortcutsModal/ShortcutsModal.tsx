import { Modal } from '../Modal/Modal';
import './ShortcutsModal.css';

/** A mouse in the list of keys: which of its buttons is meant. */
interface MouseKey {
  mouse: 'left' | 'middle' | 'wheel';
}

type Key = string | MouseKey;

interface Shortcut {
  /** The keys, each one a key cap (or a mouse drawing); `+` between them is drawn by the list. */
  keys: Key[];
  /** What it does, in a few words. */
  action: string;
}

const MOUSE_LABELS: Record<MouseKey['mouse'], string> = {
  left: 'Botão esquerdo do rato',
  middle: 'Botão do meio do rato',
  wheel: 'Roda do rato',
};

/**
 * A little mouse seen from above with the button that is meant filled in. Drawn here, in the accent colour, so it follows
 * the theme and needs no image file.
 */
function MouseDrawing({ mouse }: MouseKey) {
  return (
    <svg className="shortcuts__mouse" viewBox="0 0 20 28" role="img" aria-label={MOUSE_LABELS[mouse]}>
      <title>{MOUSE_LABELS[mouse]}</title>
      <rect className="shortcuts__mouse-body" x="1" y="1" width="18" height="26" rx="9" />
      {mouse === 'left' && <path className="shortcuts__mouse-on" d="M10 1.75A8.25 8.25 0 0 0 1.75 10v1H10z" />}
      <path className="shortcuts__mouse-lines" d="M1 11h18M10 1v10" />
      <rect className={mouse === 'left' ? 'shortcuts__mouse-body' : 'shortcuts__mouse-on shortcuts__mouse-wheel'} x="8.4" y="3.5" width="3.2" height="6" rx="1.6" />
    </svg>
  );
}

/** What the editor's canvas answers to, in one list. Ctrl is Cmd on a Mac. */
const SHORTCUTS: Shortcut[] = [
  { keys: ['Ctrl', 'C'], action: 'Copiar a seleção' },
  { keys: ['Ctrl', 'V'], action: 'Colar junto ao cursor' },
  { keys: ['Ctrl', 'Z'], action: 'Desfazer' },
  { keys: ['Ctrl', 'Shift', 'Z'], action: 'Refazer (ou Ctrl + Y)' },
  { keys: ['Shift', { mouse: 'left' }], action: 'Juntar ou tirar da seleção (também Ctrl ou Cmd)' },
  { keys: [{ mouse: 'left' }, 'Arrastar'], action: 'Selecionar uma área' },
  { keys: [{ mouse: 'wheel' }, 'Rodar'], action: 'Zoom' },
  { keys: [{ mouse: 'middle' }, 'Arrastar'], action: 'Mover a vista' },
];

interface ShortcutsModalProps {
  onClose: () => void;
}

/** The help dialog behind the "?" button on the editor's canvas: the shortcuts it knows. */
export function ShortcutsModal({ onClose }: ShortcutsModalProps) {
  return (
    <Modal
      title="Atalhos do teclado"
      size="md"
      onClose={onClose}
      actions={
        <button type="button" className="btn btn--secondary" onClick={onClose}>
          Fechar
        </button>
      }
    >
      <p className="modal__hint">Em Mac, use Cmd em vez de Ctrl. Copiar, colar, desfazer e selecionar funcionam em "Editar".</p>
      <ul className="shortcuts__list">
        {SHORTCUTS.map((shortcut, index) => (
          <li key={index} className="shortcuts__row">
            <span className="shortcuts__keys">
              {shortcut.keys.map((key, keyIndex) => (
                <span key={keyIndex} className="shortcuts__key-wrap">
                  {keyIndex > 0 && <span className="shortcuts__plus">+</span>}
                  {typeof key === 'string' ? <kbd className="shortcuts__key">{key}</kbd> : <MouseDrawing mouse={key.mouse} />}
                </span>
              ))}
            </span>
            <span className="shortcuts__action">{shortcut.action}</span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
