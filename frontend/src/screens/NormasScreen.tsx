import { useState } from 'react';
import { LoadingOverlay } from '../components/LoadingOverlay/LoadingOverlay';
import { AppFooter } from '../components/AppFooter/AppFooter';
import { BackButton } from '../components/BackButton/BackButton';
import { RecentSessionCard } from '../components/RecentSessionCard/RecentSessionCard';
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle';
import { ConfirmModal } from '../components/Modal/ConfirmModal';
import { NormaAddCard } from '../components/NormaAddCard/NormaAddCard';
import { NormaCard } from '../components/NormaCard/NormaCard';
import { NormasToolbar } from '../components/NormasToolbar/NormasToolbar';
import type { Theme } from '../hooks/useTheme';
import type { SavedNrmPayload, SavedNrmQuery } from '../types/savedNrm';

export interface RecentSessionEntryProps {
  id: string;
  datasetFileName: string;
  /** The cached .nrm's own name — null for a dataset-only entry (or an unnamed legacy one). */
  nrmName: string | null;
  /** False for a dataset-only entry — nothing built or imported on it yet. */
  hasModel: boolean;
  /** Also kept on the platform, not only in this browser. */
  isSaved: boolean;
  isResuming: boolean;
  error: string | null;
  onResume: () => void;
}

interface NormasScreenProps {
  theme: Theme;
  onToggleTheme: () => void;
  onBack: () => void;
  onGoHome: () => void;
  /** Up to the 4 most recently uploaded/saved sessions (see App.tsx's utils/sessionCache.ts-backed
   * recentSessions), newest first. Empty when there's none — "Sessões recentes" is always shown,
   * with an empty-state message. */
  recentSessions: RecentSessionEntryProps[];
  /** The library of saved .nrm files, newest first — null until the backend has answered. */
  normas: SavedNrmPayload[] | null;
  /** How many models the library holds in all (null until known) — the list may be showing only the search's matches. */
  normasTotal: number | null;
  /** A request for the list (first load, a search, a new order) is still waiting for its answer. */
  normasLoading: boolean;
  /** True when the library could not be read (the toast already said why). */
  normasFailed: boolean;
  /** What the list is searched and ordered by, and how to change it. */
  savedQuery: SavedNrmQuery;
  onSavedQueryChange: (query: SavedNrmQuery) => void;
  /** The norma being opened right now, if any. */
  openingSavedId: string | null;
  onOpenSaved: (model: SavedNrmPayload) => void;
  onDeleteSaved: (model: SavedNrmPayload) => Promise<void>;
  /** Adds the picked or dropped .nrm files to the library (the "+" card at the end of the grid). */
  onUploadNormas: (files: File[]) => Promise<void>;
}

/**
 * "Explorar as minhas normas" (`/normas`), reached from the landing screen's browse button.
 * An empty container, to be populated later, with "Sessões recentes" below it.
 */
export function NormasScreen({
  theme,
  onToggleTheme,
  onBack,
  onGoHome,
  recentSessions,
  normas,
  normasTotal,
  normasLoading,
  normasFailed,
  savedQuery,
  onSavedQueryChange,
  openingSavedId,
  onOpenSaved,
  onDeleteSaved,
  onUploadNormas,
}: NormasScreenProps) {
  const [pendingDelete, setPendingDelete] = useState<SavedNrmPayload | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  function uploadNormas(files: File[]) {
    setIsUploading(true);
    onUploadNormas(files).finally(() => setIsUploading(false));
  }

  return (
    <div className="app app--landing">
      <header className="app__topbar app__topbar--with-title">
        <BackButton onClick={onBack} />
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </header>

      <div className="app__normas-body">
        <div className="app__normas-header">
          <h1 className="app__normas-title">
            As minhas normas
            {normasTotal !== null && (
              <span className="app__normas-count" title="Normas guardadas na plataforma">
                {normasTotal}
              </span>
            )}
          </h1>
          <NormasToolbar query={savedQuery} onChange={onSavedQueryChange} />
        </div>
        {normas !== null && normas.length === 0 && savedQuery.search.trim() !== '' && (
          <p className="app__normas-placeholder app__normas-no-match">Nenhuma norma corresponde à pesquisa.</p>
        )}
        {normas !== null ? (
          <div className="app__normas-scroll">
            <div className="app__normas-list">
              {normas.map((model) => (
                <NormaCard
                  key={model.id}
                  model={model}
                  isOpening={openingSavedId === model.id}
                  onOpen={() => onOpenSaved(model)}
                  onDelete={() => setPendingDelete(model)}
                />
              ))}
              <NormaAddCard isUploading={isUploading} onFiles={uploadNormas} />
            </div>
          </div>
        ) : (
          <div className="app__normas-container">
            <p className="app__normas-placeholder">
              {normasFailed ? 'Não foi possível obter as normas guardadas.' : ''}
            </p>
          </div>
        )}
      </div>

      <div className="recent-sessions recent-sessions--fixed">
        <div className="recent-sessions__header">
          <p className="recent-sessions__title">Sessões recentes</p>
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
                isSaved={entry.isSaved}
                isResuming={entry.isResuming}
                error={entry.error}
                onResume={entry.onResume}
              />
            ))}
          </div>
        )}
      </div>

      {(isUploading || isDeleting || normasLoading || (normas === null && !normasFailed)) && <LoadingOverlay delayMs={200} />}

      <AppFooter onGoHome={onGoHome} />

      {pendingDelete && (
        <ConfirmModal
          title="Apagar a norma?"
          message={`"${pendingDelete.name}" vai ser removido da plataforma. Esta ação não se pode desfazer.`}
          confirmLabel="Apagar"
          danger
          onConfirm={() => {
            const target = pendingDelete;
            setPendingDelete(null);
            setIsDeleting(true);
            onDeleteSaved(target)
              .catch(() => undefined)
              .finally(() => setIsDeleting(false));
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
