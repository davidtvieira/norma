import { ChevronRightIcon } from '../ButtonIcons/ButtonIcons';
import { useNormaDropTarget } from '../../hooks/useNormaDropTarget';
import type { CategoryNode } from '../../types/category';
import './FolderBreadcrumb.css';

interface FolderBreadcrumbProps {
  /** The open folder's ancestors, top-most first, then the folder itself last; empty at the top. */
  path: CategoryNode[];
  onOpen: (id: string | null) => void;
  /** A norma card was dropped on a step of the path (null = "Todas as pastas"): files it there. */
  onDropNorma: (normaId: string, folderId: string | null) => void;
}

/** "As minhas normas › Fiscal › IVA" above the grid of folders. */
export function FolderBreadcrumb({ path, onOpen, onDropNorma }: FolderBreadcrumbProps) {
  return (
    <div className="folder-breadcrumb">
      <nav className="folder-breadcrumb__path" aria-label="Pasta">
        {path.length === 0 ? (
          <span className="folder-breadcrumb__current">Todas as pastas</span>
        ) : (
          <Crumb label="Todas as pastas" onOpen={() => onOpen(null)} onDropNorma={(normaId) => onDropNorma(normaId, null)} />
        )}
        {path.map((node, index) => (
          <span key={node.id} className="folder-breadcrumb__step">
            <ChevronRightIcon className="folder-breadcrumb__chevron" />
            {index === path.length - 1 ? (
              <span className="folder-breadcrumb__current">{node.name}</span>
            ) : (
              <Crumb label={node.name} onOpen={() => onOpen(node.id)} onDropNorma={(normaId) => onDropNorma(normaId, node.id)} />
            )}
          </span>
        ))}
      </nav>
    </div>
  );
}

/** A step of the path you can go back to; a norma dropped on it is filed in that folder. */
function Crumb({ label, onOpen, onDropNorma }: { label: string; onOpen: () => void; onDropNorma: (normaId: string) => void }) {
  const drop = useNormaDropTarget(onDropNorma);
  return (
    <button type="button" className={`folder-breadcrumb__link${drop.isOver ? ' folder-breadcrumb__link--drop' : ''}`} onClick={onOpen} {...drop.props}>
      {label}
    </button>
  );
}
