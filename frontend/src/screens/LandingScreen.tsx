import { BuildIcon, StoreIcon } from '../components/ButtonIcons/ButtonIcons';
import { useState } from 'react';
import { BuildNormaModal } from '../components/BuildNormaModal/BuildNormaModal';
import { AppFooter } from '../components/AppFooter/AppFooter';
import { NormaUploader } from '../components/NormaUploader/NormaUploader';
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle';
import type { DatasetImportStatus } from '../types/dataset';
import type { NrmImportStatusPayload } from '../types/nrm';
import type { Theme } from '../hooks/useTheme';
import type { ImportedModel } from './ChooseModelScreen';

interface LandingScreenProps {
  theme: Theme;
  onToggleTheme: () => void;
  onImportSuccess: (dataset: DatasetImportStatus, file: File) => void;
  onNormaImportSuccess: (
    dataset: NrmImportStatusPayload,
    datasetFile: File | null,
    model: ImportedModel,
    modelText: string,
    nrmFile: File,
  ) => void;
  onGoHome: () => void;
  /** "Explorar as minhas normas" — opens the `/normas` route. */
  onBrowseNormas: () => void;
  /** "Construir a minha norma" → "Sem dataset": starts a norma with nothing loaded (only the operations that don't read a dataset). */
  onCreateWithoutDataset: () => void;
}

/**
 * The very first screen: nothing imported yet. Offers either a plain dataset upload (the start
 * of the normal create/import-model flow) or a single .nrm file that bundles a dataset and an
 * already-built model together, skipping straight to ChooseModelScreen's "Editar Modelo" /
 * "Utilizar Modelo" choice as if both had been imported separately. Resuming a cached session
 * ("Sessões recentes") lives on the models page, reached through the browse button.
 */
export function LandingScreen({
  theme,
  onToggleTheme,
  onImportSuccess,
  onNormaImportSuccess,
  onGoHome,
  onBrowseNormas,
  onCreateWithoutDataset,
}: LandingScreenProps) {
  const [isBuildOpen, setIsBuildOpen] = useState(false);

  return (
    <div className="app app--landing">
      <header className="app__topbar">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </header>

      <div className="app__landing-body">
        <div className="app__landing-left">
          <p className="app__intro">Importe uma norma que já tem, ou construa a sua, com ou sem um ficheiro de dados.</p>
        </div>
        <div className="app__landing-right">
          <div className="app__landing-content">
            <div className="app__landing-uploaders">
              <NormaUploader onImportSuccess={onNormaImportSuccess} />
              <div className="app__landing-uploaders-or">
                <span>ou</span>
              </div>
              {/* Replaces the dataset upload: how the norma starts is chosen in the dialog. Same shape as the .nrm dropzone beside it. */}
              <div className="norma-uploader">
                <div
                  className="norma-uploader__dropzone"
                  role="button"
                  tabIndex={0}
                  onClick={() => setIsBuildOpen(true)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setIsBuildOpen(true);
                    }
                  }}
                >
                  <div className="norma-uploader__icon" aria-hidden="true">
                    <BuildIcon />
                  </div>
                  <p className="norma-uploader__title">Construir a minha norma</p>
                  <p className="norma-uploader__hint">Comece com um dataset ou sem dados e escolha as operações</p>
                </div>
              </div>
            </div>
            <button type="button" className="app__browse-button" onClick={onBrowseNormas}>
              <StoreIcon className="app__browse-icon" />
              <span>Explorar as minhas normas</span>
              <span className="app__browse-hint">Veja e abra as normas que já criou</span>
            </button>

            {isBuildOpen && (
              <BuildNormaModal
                onClose={() => setIsBuildOpen(false)}
                onImportSuccess={onImportSuccess}
                onStartWithoutDataset={onCreateWithoutDataset}
              />
            )}
          </div>
        </div>
      </div>

      <AppFooter onGoHome={onGoHome} />
    </div>
  );
}
