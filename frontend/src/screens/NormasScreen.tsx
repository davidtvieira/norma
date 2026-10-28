import { useState } from 'react';
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
import { MoveNormaModal } from '../components/MoveNormaModal/MoveNormaModal';
import { MAX_FOLDER_DEPTH, categoryPath, idsWithin, pathTo, type CategoryNode } from '../types/category';
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
  /** The categories as a tree — null until the backend has answered. */
  categories: CategoryNode[] | null;
  /** The open folder's id, null at the top. */
  folder: string | null;
  onFolderChange: (folder: string | null) => void;
  /** While searching inside a folder: only that folder's normas. */
  searchInFolder: boolean;
  onSearchInFolderChange: (value: boolean) => void;
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
  normas,
  normasTotal,
  normasLoading,
  normasFailed,
  savedQuery,
  onSavedQueryChange,
  openingSavedId,
  onOpenSaved,
  onDeleteSaved,
  categories,
  folder,
  onFolderChange,
  searchInFolder,
  onSearchInFolderChange,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
  onMoveNorma,
}: NormasScreenProps) {
  // The category dialog: creating (under `parent`, or at the top level) or editing `node`.
  const [categoryDialog, setCategoryDialog] = useState<{ editing: CategoryNode | null; parent: CategoryNode | null } | null>(null);
  const [pendingDeleteCategory, setPendingDeleteCategory] = useState<CategoryNode | null>(null);
  const [movingNorma, setMovingNorma] = useState<SavedNrmPayload | null>(null);
  const tree = categories ?? [];
  const searching = savedQuery.search.trim() !== '';
  // The open folder and its ancestors, top-most first.
  const path = pathTo(tree, folder);
  const current = path[path.length - 1] ?? null;
  // Not searching: this level's folders and, beside them, the normas filed right here (at the top, those with no
  // category). Searching lists normas alone — all that match, or only those inside the open folder.
  const folders = searching ? [] : current ? current.children : tree;
  const shown =
    normas === null
      ? null
      : searching
        ? current && searchInFolder
          ? normas.filter((model) => model.categoryId !== null && idsWithin(current).has(model.categoryId))
          : normas
        : normas.filter((model) => model.categoryId === (current?.id ?? null));
  // A norma card dropped on a folder (or a step of the breadcrumb): files it there, unless it already is.
  function dropNorma(normaId: string, folderId: string | null) {
    const model = normas?.find((candidate) => candidate.id === normaId);
    if (!model || model.categoryId === folderId) return;
    setIsMoving(true);
    onMoveNorma(normaId, folderId)
      .catch(() => undefined)
      .finally(() => setIsMoving(false));
  }

  const waitingForFolders = categories === null;
  const [pendingDelete, setPendingDelete] = useState<SavedNrmPayload | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  // The norma being dragged right now, if any: one that is in a folder gets a card to drop it on to take it out.
  const [draggedNorma, setDraggedNorma] = useState<SavedNrmPayload | null>(null);

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
          <NormasToolbar
            query={savedQuery}
            onChange={onSavedQueryChange}
            folderName={current?.name ?? null}
            searchInFolder={searchInFolder}
            onSearchInFolderChange={onSearchInFolderChange}
          />
        </div>
        {!waitingForFolders && (
          <FolderBreadcrumb
            path={path}
            onOpen={onFolderChange}
            onDropNorma={dropNorma}
          />
        )}
        {shown !== null && shown.length === 0 && folders.length === 0 && !waitingForFolders && (
          <p className="app__normas-placeholder app__normas-no-match">
            {searching ? 'Nenhuma norma corresponde à pesquisa.' : (current ? 'Esta pasta ainda não tem normas.' : 'Ainda não há normas nem pastas.')}
          </p>
        )}
        {shown !== null ? (
          <div className="app__normas-scroll">
            <div className="app__normas-list">
              {folders.map((category) => (
                <FolderCard
                  key={category.id}
                  category={category}
                  onOpen={() => onFolderChange(category.id)}
                  onDropNorma={(normaId) => dropNorma(normaId, category.id)}
                  onEdit={() => setCategoryDialog({ editing: category, parent: null })}
                  onDelete={() => setPendingDeleteCategory(category)}
                />
              ))}
              {shown.map((model) => (
                <NormaCard
                  key={model.id}
                  model={model}
                  categoryLabel={categoryPath(tree, model.categoryId)}
                  isOpening={openingSavedId === model.id}
                  onOpen={() => onOpenSaved(model)}
                  onDelete={() => setPendingDelete(model)}
                  onMove={() => setMovingNorma(model)}
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
                  <NewFolderCard label="Nova pasta" onClick={() => setCategoryDialog({ editing: null, parent: current })} />
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

      {(isDeleting || isMoving || normasLoading || waitingForFolders || (normas === null && !normasFailed)) && <LoadingOverlay delayMs={200} />}

      <AppFooter onGoHome={onGoHome} />

      {categoryDialog && (
        <CategoryModal
          editing={categoryDialog.editing}
          initialParentId={categoryDialog.parent?.id ?? null}
          tree={tree}
          onSubmit={(name, parentId) =>
            categoryDialog.editing ? onUpdateCategory(categoryDialog.editing.id, name, parentId) : onCreateCategory(name, parentId)
          }
          onClose={() => setCategoryDialog(null)}
        />
      )}

      {movingNorma && (
        <MoveNormaModal
          model={movingNorma}
          tree={tree}
          onMove={(categoryId) => onMoveNorma(movingNorma.id, categoryId)}
          onClose={() => setMovingNorma(null)}
        />
      )}

      {pendingDeleteCategory && (
        <ConfirmModal
          title="Apagar a pasta?"
          message={
            pendingDeleteCategory.totalCount > 0 || pendingDeleteCategory.children.length > 0
              ? `"${pendingDeleteCategory.name}" ainda tem pastas ou normas. Mova-as primeiro para a poder apagar.`
              : `"${pendingDeleteCategory.name}" vai ser removida.`
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
