import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { PlusIcon } from '../ButtonIcons/ButtonIcons';
import './NormaAddCard.css';

interface NormaAddCardProps {
  isUploading: boolean;
  /** The .nrm files picked or dropped — one or several. */
  onFiles: (files: File[]) => void;
}

/**
 * The "+" card that closes the grid of normas: click it to pick .nrm files (or drop them on it) and add
 * them to the library.
 */
export function NormaAddCard({ isUploading, onFiles }: NormaAddCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = ''; // so picking the same file again fires onChange again
    if (files.length > 0) onFiles(files);
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setIsDragActive(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0 && !isUploading) onFiles(files);
  }

  return (
    <>
      <button
        type="button"
        className={`norma-add${isDragActive ? ' norma-add--drag' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragActive(true);
        }}
        onDragLeave={() => setIsDragActive(false)}
        onDrop={handleDrop}
        disabled={isUploading}
        aria-busy={isUploading}
      >
        <span className="norma-add__icon">
          <PlusIcon />
        </span>
        <span className="norma-add__label">{isUploading ? 'A guardar…' : 'Adicionar norma'}</span>
        <span className="norma-add__hint">Ficheiros .nrm</span>
      </button>
      <input ref={inputRef} type="file" accept=".nrm" multiple className="norma-add__input" onChange={handleChange} />
    </>
  );
}
