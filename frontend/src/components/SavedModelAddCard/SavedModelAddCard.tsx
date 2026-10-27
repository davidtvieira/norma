import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { PlusIcon } from '../ButtonIcons/ButtonIcons';
import './SavedModelAddCard.css';

interface SavedModelAddCardProps {
  isUploading: boolean;
  /** The .nrm files picked or dropped — one or several. */
  onFiles: (files: File[]) => void;
}

/**
 * The "+" card that closes the grid of saved models: click it to pick .nrm files (or drop them on it) and add
 * them to the library.
 */
export function SavedModelAddCard({ isUploading, onFiles }: SavedModelAddCardProps) {
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
        className={`saved-model-add${isDragActive ? ' saved-model-add--drag' : ''}`}
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
        <span className="saved-model-add__icon">
          <PlusIcon />
        </span>
        <span className="saved-model-add__label">{isUploading ? 'A guardar…' : 'Adicionar norma'}</span>
        <span className="saved-model-add__hint">Ficheiros .nrm</span>
      </button>
      <input ref={inputRef} type="file" accept=".nrm" multiple className="saved-model-add__input" onChange={handleChange} />
    </>
  );
}
