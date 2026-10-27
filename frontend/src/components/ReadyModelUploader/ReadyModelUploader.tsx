import { FolderOpenIcon } from '../ButtonIcons/ButtonIcons';
import { LoadingOverlay } from '../LoadingOverlay/LoadingOverlay';
import { inlineErrorMessage } from '../../services/apiErrors';
import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { importNrmFile } from '../../utils/nrmSerialization';
import type { NrmImportStatusPayload } from '../../types/nrm';
import type { ImportedModel } from '../../screens/ChooseModelScreen';
import './ReadyModelUploader.css';

interface ReadyModelUploaderProps {
  /** Also hands back the dataset file extracted from the .nrm (not just the parsed dataset), same
   * reason as DatasetUploader's own onImportSuccess — so it's available again if "Guardar modelo"
   * re-exports this model later — and the .nrm itself, so it can be kept in the library as it came. */
  onImportSuccess: (dataset: NrmImportStatusPayload, datasetFile: File, model: ImportedModel, modelText: string, nrmFile: File) => void;
}

/**
 * Dropzone-style file picker for a .nrm file — a zip bundling a dataset spreadsheet together
 * with an already-built model's exported JSON, so both can be loaded in one step instead of
 * importing the dataset and then the model separately (see ChooseModelScreen's own, separate
 * "Importar Modelo" flow, which still only handles the model half once a dataset already exists).
 */
export function ReadyModelUploader({ onImportSuccess }: ReadyModelUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Set on any failed upload, including an API one whose message only shows in a toast — drives the
  // dropzone's red outline, which errorMessage alone can't (it's empty for an API failure).
  const [hasError, setHasError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function uploadFile(file: File) {
    setIsUploading(true);
    setErrorMessage(null);
    setHasError(false);

    try {
      const { dataset, datasetFile, model, modelText } = await importNrmFile(file);
      onImportSuccess(dataset, datasetFile, model, modelText, file);
    } catch (error) {
      setErrorMessage(inlineErrorMessage(error, 'Falha ao importar o modelo Norma.') || null);
      setHasError(true);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      uploadFile(file);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      uploadFile(file);
    }
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragActive(true);
  }

  function handleDragLeave() {
    setIsDragActive(false);
  }

  return (
    <div className="ready-model-uploader">
      {isUploading && <LoadingOverlay />}
      <div
        className={`ready-model-uploader__dropzone${isDragActive ? ' ready-model-uploader__dropzone--active' : ''}${isUploading ? ' ready-model-uploader__dropzone--busy' : ''}${hasError ? ' ready-model-uploader__dropzone--error' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => event.key === 'Enter' && fileInputRef.current?.click()}
      >
        <div className="ready-model-uploader__icon" aria-hidden="true">
          <FolderOpenIcon />
        </div>
        <p className="ready-model-uploader__title">
          Carregue um modelo Norma
        </p>
        <p className="ready-model-uploader__hint">Arraste e largue um ficheiro .nrm, ou clique para procurar</p>

        <input
          id="ready-model-file-input"
          ref={fileInputRef}
          type="file"
          accept=".nrm"
          onChange={handleFileChange}
          disabled={isUploading}
          className="ready-model-uploader__input"
        />
      </div>
      {errorMessage && <p className="ready-model-uploader__error">{errorMessage}</p>}
    </div>
  );
}
