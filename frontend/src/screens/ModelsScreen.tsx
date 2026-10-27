import { useState } from 'react';
import { AppFooter } from '../components/AppFooter/AppFooter';
import { BackButton } from '../components/BackButton/BackButton';
import { RecentSessionCard } from '../components/RecentSessionCard/RecentSessionCard';
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle';
import { ConfirmModal } from '../components/Modal/ConfirmModal';
import { SavedModelCard } from '../components/SavedModelCard/SavedModelCard';
import type { Theme } from '../hooks/useTheme';
import type { SavedNrmPayload } from '../types/savedNrm';

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

interface ModelsScreenProps {
  theme: Theme;
  onToggleTheme: () => void;
  onBack: () => void;
  onGoHome: () => void;
  /** "Limpar tudo" — discards every entry in recentSessions at once. */
  onClearRecentSessions: () => void;
  /** Up to the 4 most recently uploaded/saved sessions (see App.tsx's utils/sessionCache.ts-backed
   * recentSessions), newest first. Empty when there's none — "Sessões recentes" is always shown,
   * with an empty-state message. */
  recentSessions: RecentSessionEntryProps[];
  /** The library of saved .nrm files, newest first — null until the backend has answered. */
  savedModels: SavedNrmPayload[] | null;
  /** True when the library could not be read (the toast already said why). */
  savedModelsFailed: boolean;
  /** The saved model being opened right now, if any. */
  openingSavedId: string | null;
  onOpenSaved: (model: SavedNrmPayload) => void;
  onDownloadSaved: (model: SavedNrmPayload) => void;
  onDeleteSaved: (model: SavedNrmPayload) => Promise<void>;
}

/**
 * "Explorar os meus modelos Norma" (`/modelos`), reached from the landing screen's browse button.
 * An empty container, to be populated later, with "Sessões recentes" below it.
 */
export function ModelsScreen({
  theme,
  onToggleTheme,
  onBack,
  onGoHome,
  onClearRecentSessions,
  recentSessions,
  savedModels,
  savedModelsFailed,
  openingSavedId,
  onOpenSaved,
  onDownloadSaved,
  onDeleteSaved,
}: ModelsScreenProps) {
  const [pendingDelete, setPendingDelete] = useState<SavedNrmPayload | null>(null);

  return (
    <div className="app app--landing">
      <header className="app__topbar app__topbar--with-title">
        <BackButton onClick={onBack} />
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </header>

      <div className="app__models-body">
        <h1 className="app__models-title">Os meus modelos</h1>
        {savedModels !== null && savedModels.length > 0 ? (
          <div className="app__models-list">
            {savedModels.map((model) => (
              <SavedModelCard
                key={model.id}
                model={model}
                isOpening={openingSavedId === model.id}
                onOpen={() => onOpenSaved(model)}
                onDownload={() => onDownloadSaved(model)}
                onDelete={() => setPendingDelete(model)}
              />
            ))}
          </div>
        ) : (
          <div className="app__models-container">
            <p className="app__models-placeholder">
              {savedModelsFailed
                ? 'Não foi possível obter os modelos guardados.'
                : savedModels === null
                  ? 'A carregar…'
                  : 'Ainda não há modelos guardados. Guarde um a partir do editor, em "Guardar modelo".'}
            </p>
          </div>
        )}
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

      {pendingDelete && (
        <ConfirmModal
          title="Apagar o modelo?"
          message={`"${pendingDelete.name}" vai ser removido da plataforma. Esta ação não se pode desfazer.`}
          confirmLabel="Apagar"
          onConfirm={() => {
            const target = pendingDelete;
            setPendingDelete(null);
            onDeleteSaved(target).catch(() => undefined);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
