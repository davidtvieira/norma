import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { importDataset } from '../../services/datasetApi';
import type { DatasetImportResponse } from '../../types/dataset';
import './DatasetUploader.css';

interface DatasetUploaderProps {
  onImportSuccess: (dataset: DatasetImportResponse) => void;
}

/**
 * Dropzone-style file picker that uploads a spreadsheet to the dataset import API.
 */
export function DatasetUploader({ onImportSuccess }: DatasetUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function uploadFile(file: File) {
    setIsUploading(true);
    setErrorMessage(null);

    try {
      const dataset = await importDataset(file);
      onImportSuccess(dataset);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Falha ao importar o conjunto de dados.');
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
    <div className="dataset-uploader">
      <div
        className={`dataset-uploader__dropzone${isDragActive ? ' dataset-uploader__dropzone--active' : ''}${isUploading ? ' dataset-uploader__dropzone--busy' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => event.key === 'Enter' && fileInputRef.current?.click()}
      >
        <div className="dataset-uploader__icon" aria-hidden="true">
          {isUploading ? (
            <span className="dataset-uploader__spinner" />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M12 15V4m0 0 4 4m-4-4-4 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>
        <p className="dataset-uploader__title">
          {isUploading ? 'A carregar…' : 'Carregue a sua folha de cálculo'}
        </p>
        <p className="dataset-uploader__hint">Arraste e largue um ficheiro .xlsx, ou clique para procurar</p>

        <input
          id="dataset-file-input"
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          onChange={handleFileChange}
          disabled={isUploading}
          className="dataset-uploader__input"
        />
      </div>
      {errorMessage && <p className="dataset-uploader__error">{errorMessage}</p>}
    </div>
  );
}
