import { useEffect, useState } from 'react';
import { LoadingOverlay } from '../components/LoadingOverlay/LoadingOverlay';
import { AppFooter } from '../components/AppFooter/AppFooter';
import { BackButton } from '../components/BackButton/BackButton';
import { RecentSessionCard } from '../components/RecentSessionCard/RecentSessionCard';
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle';
import { ConfirmModal } from '../components/Modal/ConfirmModal';
import { NormaCard } from '../components/NormaCard/NormaCard';
import { NormasToolbar } from '../components/NormasToolbar/NormasToolbar';
import { CategoryModal } from '../components/CategoryModal/CategoryModal';
import { FolderBreadcrumb } from '../components/FolderBreadcrumb/FolderBreadcrumb';
import { RemoveFromFolderCard } from '../components/RemoveFromFolderCard/RemoveFromFolderCard';
import { NewFolderCard } from '../components/NewFolderCard/NewFolderCard';
import { FolderCard } from '../components/FolderCard/FolderCard';
import { MAX_FOLDER_DEPTH } from '../types/category';
import { useNormaDropTarget } from '../hooks/useNormaDropTarget';
import type { Theme } from '../hooks/useTheme';
import type { FolderEntryPayload, LibraryListingPayload, PathStepPayload, SavedNrmPayload, SavedNrmQuery } from '../types/savedNrm';
import './NormasHeading.css';

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
  /** What the library holds at the level being looked at (the folders and the normas the backend found) — null until it has answered. */
  listing: LibraryListingPayload | null;
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
  /** The open folder's id, null at the top. */
  folder: string | null;
  onFolderChange: (folder: string | null) => void;
  /** Inside a folder a search only looks there; this makes it look in every folder. */
  searchEverywhere: boolean;
  onSearchEverywhereChange: (value: boolean) => void;
  onCreateCategory: (name: string, parentId: string | null) => Promise<void>;
  onUpdateCategory: (id: string, name: string, parentId: string | null) => Promise<void>;
  onDeleteCategory: (id: string) => Promise<void>;
  /** Files a norma under a category (null = under none). */
  onMoveNorma: (id: string, categoryId: string | null) => Promise<void>;
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
  listing,
  normasLoading,
  normasFailed,
  savedQuery,
  onSavedQueryChange,
  openingSavedId,
  onOpenSaved,
  onDeleteSaved,
  folder,
  onFolderChange,
  searchEverywhere,
  onSearchEverywhereChange,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
  onMoveNorma,
}: NormasScreenProps) {
  // The folder dialog: creating (in the open folder, or at the top level) or renaming one.
  const [categoryDialog, setCategoryDialog] = useState<{ editing: FolderEntryPayload | null; parentId: string | null } | null>(null);
  const [pendingDeleteCategory, setPendingDeleteCategory] = useState<FolderEntryPayload | null>(null);
  const normas = listing?.normas ?? null;
  const searching = savedQuery.search.trim() !== '';
  // Where the page is: the path the backend answered with, its last step the open folder. A search across all folders
  // has no path in its answer, so the last one answered stays while its folder is still the open one.
  const [lastPath, setLastPath] = useState<PathStepPayload[]>([]);
  useEffect(() => {
    if (listing && listing.path.length > 0) setLastPath(listing.path);
    else if (folder === null) setLastPath([]);
  }, [listing, folder]);
  const path = listing && listing.path.length > 0 ? listing.path : lastPath[lastPath.length - 1]?.id === folder ? lastPath : [];
  const current = path[path.length - 1] ?? null;
  // What the backend found at this level: its folders (a search matches their names too) and, beside them, the normas.
  const folders = listing?.categories ?? [];
  // A norma card dropped on a folder (or a step of the breadcrumb): files it there, unless it already is.
  function dropNorma(normaId: string, folderId: string | null) {
    const model = normas?.find((candidate) => candidate.id === normaId);
    if (!model || model.categoryId === folderId) return;
    setIsMoving(true);
    onMoveNorma(normaId, folderId)
      .catch(() => undefined)
      .finally(() => setIsMoving(false));
  }

  // The counter by the title: inside a folder, the normas in it and in the folders inside it that are on screen; else all of them.
  const count =
    listing === null
      ? null
      : listing.path.length > 0
        ? listing.normas.length + listing.categories.reduce((sum, entry) => sum + entry.totalCount, 0)
        : listing.total;

  const [pendingDelete, setPendingDelete] = useState<SavedNrmPayload | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  // The norma being dragged right now, if any: one that is in a folder gets a card to drop it on to take it out.
  const [draggedNorma, setDraggedNorma] = useState<SavedNrmPayload | null>(null);

  return (
    <div className="app app--landing normas-screen">
      <header className="app__topbar app__topbar--with-title">
        <BackButton onClick={onBack} />
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </header>

      <div className="app__normas-body">
        <div className="app__normas-header">
          <div className="normas-heading">
            <h1 className="app__normas-title">
              {path.length > 0 ? <HomeTitle onOpen={() => onFolderChange(null)} onDropNorma={(normaId) => dropNorma(normaId, null)} /> : 'As minhas normas'}
            </h1>
            {path.length > 0 && <FolderBreadcrumb path={path} onOpen={onFolderChange} onDropNorma={dropNorma} />}
            {count !== null && (
              <span className="app__normas-count" title={current ? 'Normas nesta pasta' : 'Normas guardadas na plataforma'}>
                {count}
              </span>
            )}
          </div>
          <NormasToolbar
            query={savedQuery}
            onChange={onSavedQueryChange}
            folderName={current?.name ?? null}
            searchEverywhere={searchEverywhere}
            onSearchEverywhereChange={onSearchEverywhereChange}
          />
        </div>
        {normas !== null && normas.length === 0 && folders.length === 0 && (
          <p className="app__normas-placeholder app__normas-no-match">
            {searching ? 'Nenhuma norma corresponde à pesquisa.' : (current ? 'Esta pasta ainda não tem normas.' : 'Ainda não há normas nem pastas.')}
          </p>
        )}
        {normas !== null || !normasFailed ? (
          <div className="app__normas-scroll">
            <div className="app__normas-list">
              {folders.map((category) => (
                <FolderCard
                  key={category.id}
                  category={category}
                  showPath={searching}
                  onOpen={() => onFolderChange(category.id)}
                  onDropNorma={(normaId) => dropNorma(normaId, category.id)}
                  onEdit={() => setCategoryDialog({ editing: category, parentId: null })}
                  onDelete={() => setPendingDeleteCategory(category)}
                />
              ))}
              {(normas ?? []).map((model) => (
                <NormaCard
                  key={model.id}
                  model={model}
                  categoryLabel={model.categoryPath.join(' › ')}
                  isOpening={openingSavedId === model.id}
                  onOpen={() => onOpenSaved(model)}
                  onDelete={() => setPendingDelete(model)}
                  onDragChange={(isDragging) => setDraggedNorma(isDragging ? model : null)}
                />
              ))}
              {/* The last card: "Nova pasta" — which, while a norma that is in a folder is dragged, becomes the card to
                  drop it on to take it out of its folder. */}
              {draggedNorma?.categoryId ? (
                <RemoveFromFolderCard onDropNorma={(normaId) => dropNorma(normaId, null)} />
              ) : (
                !searching &&
                path.length < MAX_FOLDER_DEPTH && (
                  <NewFolderCard label="Nova pasta" onClick={() => setCategoryDialog({ editing: null, parentId: current?.id ?? null })} />
                )
              )}
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

      {/* Nothing to show yet (opening the page, or going into another folder): the loading page at once. A refresh of what is
          already on screen (typing a search, a move) waits a moment so a quick answer never flashes it. */}
      {(isDeleting || isMoving || normasLoading || (normas === null && !normasFailed)) &&
        (normas === null && !normasFailed ? <LoadingOverlay key="blank" /> : <LoadingOverlay key="refresh" delayMs={200} />)}

      <AppFooter onGoHome={onGoHome} />

      {categoryDialog && (
        <CategoryModal
          editing={categoryDialog.editing}
          initialParentId={categoryDialog.parentId}
          onSubmit={(name, parentId) =>
            categoryDialog.editing ? onUpdateCategory(categoryDialog.editing.id, name, parentId) : onCreateCategory(name, parentId)
          }
          onClose={() => setCategoryDialog(null)}
        />
      )}

      {pendingDeleteCategory && (
        <ConfirmModal
          title="Apagar a pasta?"
          message={
            `A pasta "${pendingDeleteCategory.name}" vai ser apagada` +
            (pendingDeleteCategory.childCount > 0 ? ', com todas as pastas que tem dentro' : '') +
            '.' +
            (pendingDeleteCategory.totalCount > 0
              ? ` ${pendingDeleteCategory.totalCount === 1 ? 'A norma que lá está fica' : `As ${pendingDeleteCategory.totalCount} normas que lá estão ficam`} sem pasta.`
              : '')
          }
          confirmLabel="Apagar"
          danger
          onConfirm={() => {
            const target = pendingDeleteCategory;
            setPendingDeleteCategory(null);
            setIsDeleting(true);
            onDeleteCategory(target.id)
              .catch(() => undefined)
              .finally(() => setIsDeleting(false));
          }}
          onCancel={() => setPendingDeleteCategory(null)}
        />
      )}

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

/** The page's title once a folder is open: the way back to the top, and a place to drop a norma to take it out of its folder. */
function HomeTitle({ onOpen, onDropNorma }: { onOpen: () => void; onDropNorma: (normaId: string) => void }) {
  const drop = useNormaDropTarget(onDropNorma);
  return (
    <button type="button" className={`normas-heading__home${drop.isOver ? ' normas-heading__home--drop' : ''}`} onClick={onOpen} {...drop.props}>
      As minhas normas
    </button>
  );
}
