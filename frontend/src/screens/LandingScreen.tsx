import { AppFooter } from '../components/AppFooter/AppFooter';
import { DatasetUploader } from '../components/DatasetUploader/DatasetUploader';
import { ReadyModelUploader } from '../components/ReadyModelUploader/ReadyModelUploader';
import { RecentSessionCard } from '../components/RecentSessionCard/RecentSessionCard';
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle';
import type { DatasetImportStatus } from '../types/dataset';
import type { NrmImportStatusPayload } from '../types/nrm';
import type { Theme } from '../hooks/useTheme';
import type { ImportedModel } from './ChooseModelScreen';

export interface RecentSessionEntryProps {
  id: string;
  datasetFileName: string;
  /** The cached .nrm's own name — null for a dataset-only entry (or an unnamed legacy one). */
  nrmName: string | null;
  /** False for a dataset-only entry — nothing built or imported on it yet. */
  hasModel: boolean;
  isResuming: boolean;
  error: string | null;
  onResume: () => void;
}

interface LandingScreenProps {
  theme: Theme;
  onToggleTheme: () => void;
  onImportSuccess: (dataset: DatasetImportStatus, file: File) => void;
  onReadyModelImportSuccess: (dataset: NrmImportStatusPayload, datasetFile: File, model: ImportedModel, modelText: string) => void;
  onGoHome: () => void;
  /** "Limpar tudo" — discards every entry in recentSessions at once. */
  onClearRecentSessions: () => void;
  /** Up to the 4 most recently uploaded/saved .nrm sessions (see App.tsx's
   * utils/sessionCache.ts-backed recentSessions), newest first. Empty when there's none — the
   * "Sessões recentes" row at the bottom is always there, showing an empty-state message. */
  recentSessions: RecentSessionEntryProps[];
}

/**
 * The very first screen: nothing imported yet. Offers either a plain dataset upload (the start
 * of the normal create/import-model flow) or a single .nrm file that bundles a dataset and an
 * already-built model together, skipping straight to ChooseModelScreen's "Editar Modelo" /
 * "Utilizar Modelo" choice as if both had been imported separately. When sessions were cached
 * from earlier visits, a "Sessões recentes" row offering to resume any of them sits below
 * these same upload options — not instead of them, since resuming is only ever one possible next
 * step here.
 */
export function LandingScreen({
  theme,
  onToggleTheme,
  onImportSuccess,
  onReadyModelImportSuccess,
  onGoHome,
  onClearRecentSessions,
  recentSessions,
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
            <ReadyModelUploader onImportSuccess={onReadyModelImportSuccess} />
            <div className="app__landing-separator">
              <span>ou</span>
            </div>
            <DatasetUploader onImportSuccess={onImportSuccess} />
          </div>
        </div>
      </div>

      <div className="recent-sessions">
        <div className="recent-sessions__header">
          <p className="recent-sessions__title">Sessões recentes</p>
          <button
            type="button"
            className="recent-sessions__clear-button"
            onClick={onClearRecentSessions}
            disabled={recentSessions.length === 0 || recentSessions.some((entry) => entry.isResuming)}
          >
            Limpar tudo
          </button>
        </div>
        {recentSessions.length === 0 ? (
          <p className="recent-sessions__empty">Ainda não há sessões recentes.</p>
        ) : (
          <div className="recent-sessions__list">
            {recentSessions.map((entry) => (
              <RecentSessionCard
                key={entry.id}
                datasetFileName={entry.datasetFileName}
                nrmName={entry.nrmName}
                hasModel={entry.hasModel}
                isResuming={entry.isResuming}
                error={entry.error}
                onResume={entry.onResume}
              />
            ))}
          </div>
        )}
      </div>

      <AppFooter onGoHome={onGoHome} />
    </div>
  );
}
