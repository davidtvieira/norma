import { useState } from 'react';
import type { DragEvent } from 'react';
import { ChevronRightIcon, FolderClosedIcon, FolderOpenIcon, InfoIcon, PencilIcon, PlusIcon, TrashIcon } from '../ButtonIcons/ButtonIcons';
import { NormaMark } from '../NormaMark/NormaMark';
import { useNormaDropTarget } from '../../hooks/useNormaDropTarget';
import { FOLDER_DRAG_TYPE, NORMA_DRAG_TYPE } from '../../utils/normaDrag';
import { formatDate, truncate } from '../../utils/formatNorma';
import { toFolderEntry, type TreeFolder, type TreeItem, type TreeNorma } from '../../utils/normaTree';
import { MAX_FOLDER_DEPTH } from '../../types/category';
import type { FolderEntryPayload, SavedNrmPayload } from '../../types/savedNrm';
import './NormaTree.css';

/** The longest a description is shown on a row (the whole of it is in the "i" dialog). */
const DESCRIPTION_CAP = 100;

interface NormaTreeProps {
  items: TreeItem[];
  /** Folders closed by the user; `openAll` (while searching) shows every folder open whatever this says. */
  collapsed: ReadonlySet<string>;
  openAll: boolean;
  onToggleFolder: (folderId: string) => void;
  openingSavedId: string | null;
  onOpen: (model: SavedNrmPayload) => void;
  onDelete: (model: SavedNrmPayload) => void;
  /** The "i" of a norma: its details in a dialog. */
  onShowInfo: (model: SavedNrmPayload) => void;
  /** A norma was dropped on a folder (null: taken out of its folder). */
  onDropNorma: (normaId: string, folderId: string | null) => void;
  /** A folder was dropped on another folder (null: taken out of its parent, to the top level). */
  onDropFolder: (draggedId: string, folderId: string | null) => void;
  /** A folder started (it) or stopped (null) being dragged. */
  onFolderDragChange: (folder: FolderEntryPayload | null) => void;
  /** A norma started (it) or stopped (null) being dragged. */
  onDragChange: (model: SavedNrmPayload | null) => void;
  onNewFolder: (parentId: string) => void;
  onEditFolder: (folder: FolderEntryPayload) => void;
  onDeleteFolder: (folder: FolderEntryPayload) => void;
}

/**
 * The library as a tree: each folder opens to show its subfolders and the normas filed in it, with the unfiled normas at
 * the top level. A norma opens with a click (Enter or Space); a norma dragged onto a folder is filed there. Rows only
 * show their buttons (description, edit, delete, new subfolder) while pointed at or focused.
 */
export function NormaTree(props: NormaTreeProps) {
  const { items } = props;
  return (
    <ul className="normas-tree" role="tree" aria-label="As minhas normas">
      {items.map((item) => (
        <TreeNode key={item.kind === 'folder' ? `f-${item.id}` : `n-${item.model.id}`} item={item} {...props} />
      ))}
    </ul>
  );
}

function TreeNode({ item, ...rest }: { item: TreeItem } & NormaTreeProps) {
  return item.kind === 'folder' ? <FolderNode folder={item} {...rest} /> : <NormaRow node={item} {...rest} />;
}

function FolderNode({ folder, ...props }: { folder: TreeFolder } & NormaTreeProps) {
  const isOpen = props.openAll || !props.collapsed.has(folder.id);
  const drop = useNormaDropTarget(
    (normaId) => props.onDropNorma(normaId, folder.id),
    (draggedId) => props.onDropFolder(draggedId, folder.id),
  );
  const [isDragging, setIsDragging] = useState(false);
  const canHaveSubfolder = folder.depth + 1 < MAX_FOLDER_DEPTH;
  const entry = toFolderEntry(folder);
  const Icon = isOpen ? FolderOpenIcon : FolderClosedIcon;

  return (
    <li role="none">
      <div
        className={`normas-tree__row normas-tree__row--folder${drop.isOver ? ' normas-tree__row--drop' : ''}${isDragging ? ' normas-tree__row--dragging' : ''}`}
        draggable
        onDragStart={(event: DragEvent) => {
          event.dataTransfer.setData(FOLDER_DRAG_TYPE, folder.id);
          event.dataTransfer.effectAllowed = 'move';
          setIsDragging(true);
          props.onFolderDragChange(entry);
        }}
        onDragEnd={() => {
          setIsDragging(false);
          props.onFolderDragChange(null);
        }}
        style={{ paddingLeft: `calc(${folder.depth} * var(--tree-indent) + 0.5rem)` }}
        role="treeitem"
        aria-expanded={isOpen}
        aria-level={folder.depth + 1}
        tabIndex={0}
        onClick={() => props.onToggleFolder(folder.id)}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            props.onToggleFolder(folder.id);
          }
        }}
        {...drop.props}
      >
        <ChevronRightIcon className={`normas-tree__chevron${isOpen ? ' normas-tree__chevron--open' : ''}`} />
        <Icon className="normas-tree__folder-icon" />
        <span className="normas-tree__name" title={folder.name}>
          {folder.name}
        </span>
        <span className="normas-tree__count" title={folder.totalCount === 1 ? '1 norma' : `${folder.totalCount} normas`}>
          {folder.totalCount}
        </span>
        <span className="normas-tree__actions">
          {canHaveSubfolder && (
            <RowButton label={`Nova pasta em ${folder.name}`} onClick={() => props.onNewFolder(folder.id)}>
              <PlusIcon className="normas-tree__action-icon" />
            </RowButton>
          )}
          <RowButton label={`Editar ${folder.name}`} onClick={() => props.onEditFolder(entry)}>
            <PencilIcon className="normas-tree__action-icon" />
          </RowButton>
          <RowButton label={`Apagar ${folder.name}`} onClick={() => props.onDeleteFolder(entry)}>
            <TrashIcon className="normas-tree__action-icon" />
          </RowButton>
        </span>
      </div>
      {isOpen && folder.children.length > 0 && (
        <ul role="group" className="normas-tree__group">
          {folder.children.map((child) => (
            <TreeNode key={child.kind === 'folder' ? `f-${child.id}` : `n-${child.model.id}`} item={child} {...props} />
          ))}
        </ul>
      )}
    </li>
  );
}

function NormaRow({ node, ...props }: { node: TreeNorma } & NormaTreeProps) {
  const { model } = node;
  const [isDragging, setIsDragging] = useState(false);
  const isOpening = props.openingSavedId === model.id;
  const canOpen = model.available && !isOpening;
  const description = model.description?.trim() ? model.description : null;

  return (
    <li role="none">
      <div
        className={`normas-tree__row normas-tree__row--norma${canOpen ? ' normas-tree__row--openable' : ''}${isOpening ? ' normas-tree__row--opening' : ''}${isDragging ? ' normas-tree__row--dragging' : ''}`}
        style={{ paddingLeft: `calc(${node.depth} * var(--tree-indent) + 0.5rem)` }}
        role="treeitem"
        aria-level={node.depth + 1}
        aria-busy={isOpening || undefined}
        tabIndex={model.available ? 0 : undefined}
        draggable
        onDragStart={(event: DragEvent) => {
          event.dataTransfer.setData(NORMA_DRAG_TYPE, model.id);
          event.dataTransfer.effectAllowed = 'move';
          setIsDragging(true);
          props.onDragChange(model);
        }}
        onDragEnd={() => {
          setIsDragging(false);
          props.onDragChange(null);
        }}
        onClick={canOpen ? () => props.onOpen(model) : undefined}
        onKeyDown={
          canOpen
            ? (event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  props.onOpen(model);
                }
              }
            : undefined
        }
      >
        <span className="normas-tree__chevron-space" aria-hidden="true" />
        <NormaMark className="normas-tree__mark" />
        <span className="normas-tree__name" title={model.name}>
          {model.name}
        </span>
        {model.available && description && (
          <span className="normas-tree__summary" title={description}>
            {truncate(description, DESCRIPTION_CAP)}
          </span>
        )}
        <span className="normas-tree__meta">
          {model.available ? `Atualizado em ${formatDate(model.updatedAt)}` : 'O ficheiro já não existe na plataforma.'}
        </span>
        <span className="normas-tree__actions">
          <RowButton label={`Informação sobre ${model.name}`} onClick={() => props.onShowInfo(model)}>
            <InfoIcon className="normas-tree__action-icon" />
          </RowButton>
          <RowButton label={`Apagar ${model.name}`} onClick={() => props.onDelete(model)}>
            <TrashIcon className="normas-tree__action-icon" />
          </RowButton>
        </span>
      </div>
    </li>
  );
}

/** A small icon button inside a row: its click must not also toggle or open the row. */
function RowButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="normas-tree__action"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

interface NormaTreeEndProps {
  /** A norma or folder that is inside a folder is being dragged: the row becomes the place to drop it to take it out of its folder. */
  isDraggingFiled: boolean;
  /** A new top-level folder can be made (not while searching). */
  canCreate: boolean;
  onNewFolder: () => void;
  onDropNorma: (normaId: string, folderId: string | null) => void;
  onDropFolder: (draggedId: string, folderId: string | null) => void;
}

/** The last row of the tree: "Nova pasta" — or, while a filed norma is dragged, "Remover da pasta" to drop it on. */
export function NormaTreeEnd({ isDraggingFiled, canCreate, onNewFolder, onDropNorma, onDropFolder }: NormaTreeEndProps) {
  const drop = useNormaDropTarget(
    (normaId) => onDropNorma(normaId, null),
    (draggedId) => onDropFolder(draggedId, null),
  );
  if (isDraggingFiled) {
    return (
      <div className={`normas-tree__remove${drop.isOver ? ' normas-tree__remove--over' : ''}`} {...drop.props}>
        Remover da pasta
      </div>
    );
  }
  if (!canCreate) return null;
  return (
    <button type="button" className="btn btn--secondary btn--sm" onClick={onNewFolder}>
      <PlusIcon />
      Nova pasta
    </button>
  );
}
