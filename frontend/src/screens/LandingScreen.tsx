import { StoreIcon } from '../components/ButtonIcons/ButtonIcons';
import { AppFooter } from '../components/AppFooter/AppFooter';
import { DatasetUploader } from '../components/DatasetUploader/DatasetUploader';
import { ReadyModelUploader } from '../components/ReadyModelUploader/ReadyModelUploader';
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle';
import type { DatasetImportStatus } from '../types/dataset';
import type { NrmImportStatusPayload } from '../types/nrm';
import type { Theme } from '../hooks/useTheme';
import type { ImportedModel } from './ChooseModelScreen';

interface LandingScreenProps {
  theme: Theme;
  onToggleTheme: () => void;
  onImportSuccess: (dataset: DatasetImportStatus, file: File) => void;
  onReadyModelImportSuccess: (
    dataset: NrmImportStatusPayload,
    datasetFile: File,
    model: ImportedModel,
    modelText: string,
    nrmFile: File,
  ) => void;
  onGoHome: () => void;
  /** "Explorar os meus modelos Norma" — opens the `/modelos` route. */
  onBrowseModels: () => void;
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
  onReadyModelImportSuccess,
  onGoHome,
  onBrowseModels,
}: LandingScreenProps) {
  return (
    <div className="app app--landing">
      <header className="app__topbar">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </header>

      <div className="app__landing-body">
        <div className="app__landing-left">
          <p className="app__intro">Importe um ficheiro de dados para começar a criar um modelo inteligente.</p>
        </div>
        <div className="app__landing-right">
          <div className="app__landing-content">
            <div className="app__landing-uploaders">
              <ReadyModelUploader onImportSuccess={onReadyModelImportSuccess} />
              <div className="app__landing-uploaders-or">
                <span>ou</span>
              </div>
              <DatasetUploader onImportSuccess={onImportSuccess} />
            </div>
            <button type="button" className="app__browse-button" onClick={onBrowseModels}>
              <StoreIcon className="app__browse-icon" />
              <span>Explorar os meus modelos Norma</span>
              <span className="app__browse-hint">Veja e abra os modelos que já criou</span>
            </button>
          </div>
        </div>
      </div>

      <AppFooter onGoHome={onGoHome} />
    </div>
  );
}
