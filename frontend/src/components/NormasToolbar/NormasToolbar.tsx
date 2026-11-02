import { CloseIcon, GridIcon, LoadIcon, SearchIcon, TreeIcon } from '../ButtonIcons/ButtonIcons';
import type { SavedNrmQuery } from '../../types/savedNrm';
import './NormasToolbar.css';

/** The ways to order the library, as the select offers them. */
const ORDERS: { label: string; sort: SavedNrmQuery['sort']; direction: SavedNrmQuery['direction'] }[] = [
  { label: 'Mais recentes', sort: 'updatedAt', direction: 'desc' },
  { label: 'Mais antigos', sort: 'updatedAt', direction: 'asc' },
  { label: 'Nome (A–Z)', sort: 'name', direction: 'asc' },
  { label: 'Nome (Z–A)', sort: 'name', direction: 'desc' },
  { label: 'Maiores', sort: 'sizeBytes', direction: 'desc' },
  { label: 'Mais operações', sort: 'operationCount', direction: 'desc' },
];

interface NormasToolbarProps {
  query: SavedNrmQuery;
  onChange: (query: SavedNrmQuery) => void;
  /** The name of the open folder, when there is one (null at the top) — a search looks only at the normas of that level, unless told to look everywhere. */
  folderName: string | null;
  /** Whether the "Em subpastas" toggle is there: in the folders view, at the top as well as inside a folder (the tree always searches everything). */
  showScopeToggle: boolean;
  searchEverywhere: boolean;
  onSearchEverywhereChange: (value: boolean) => void;
  /** How the library is shown: as a tree of folders, or as folders you open one at a time. */
  view: NormasView;
  onViewChange: (view: NormasView) => void;
}

/** The two ways "As minhas normas" can be shown. */
export type NormasView = 'tree' | 'folders';

/** The search box (with, inside a folder, a toggle at its end to search only there), and the order select, on a line of their own under the title. */
export function NormasToolbar({ query, onChange, folderName, showScopeToggle, searchEverywhere, onSearchEverywhereChange, view, onViewChange }: NormasToolbarProps) {
  const orderIndex = Math.max(
    0,
    ORDERS.findIndex((order) => order.sort === query.sort && order.direction === query.direction),
  );

  return (
    <div className="normas-toolbar">
      <div className={`normas-toolbar__searchbox${showScopeToggle ? ' normas-toolbar__searchbox--scoped' : ''}`}>
        <SearchIcon className="normas-toolbar__search-icon" />
        <input
          type="search"
          className={`normas-toolbar__search${showScopeToggle ? ' normas-toolbar__search--scoped' : ''}`}
          placeholder="Pesquisar normas…"
          aria-label="Pesquisar normas"
          value={query.search}
          onChange={(event) => onChange({ ...query, search: event.target.value })}
        />
        <div className="normas-toolbar__tail">
          {query.search !== '' && (
            <button
              type="button"
              className="normas-toolbar__clear"
              aria-label="Limpar pesquisa"
              title="Limpar pesquisa"
              onClick={() => onChange({ ...query, search: '' })}
            >
              <CloseIcon />
            </button>
          )}
          {showScopeToggle && (
            <button
              type="button"
              className={`normas-toolbar__scope${searchEverywhere ? ' normas-toolbar__scope--on' : ''}`}
              aria-pressed={searchEverywhere}
              title={folderName !== null ? `Pesquisar também nas subpastas de "${folderName}"` : 'Pesquisar também nas pastas'}
              onClick={() => onSearchEverywhereChange(!searchEverywhere)}
            >
              Em subpastas
            </button>
          )}
        </div>
      </div>
      <select
        className="btn btn--secondary normas-toolbar__order"
        aria-label="Ordenar normas"
        value={orderIndex}
        onChange={(event) => {
          const order = ORDERS[Number(event.target.value)];
          onChange({ ...query, sort: order.sort, direction: order.direction });
        }}
      >
        {ORDERS.map((order, index) => (
          <option key={order.label} value={index}>
            {order.label}
          </option>
        ))}
      </select>
      <div className="normas-toolbar__views" role="group" aria-label="Ver em árvore ou em pastas">
        <button
          type="button"
          className={`normas-toolbar__view${view === 'tree' ? ' normas-toolbar__view--active' : ''}`}
          aria-pressed={view === 'tree'}
          title="Árvore"
          onClick={() => onViewChange('tree')}
        >
          <TreeIcon />
        </button>
        <button
          type="button"
          className={`normas-toolbar__view${view === 'folders' ? ' normas-toolbar__view--active' : ''}`}
          aria-pressed={view === 'folders'}
          title="Pastas"
          onClick={() => onViewChange('folders')}
        >
          <GridIcon />
        </button>
      </div>
    </div>
  );
}

/** "Exportar": every saved norma in one zip, at the right end of the title's line. Disabled while it is being made. */
export function NormasExportButton({ onExport, disabled }: { onExport: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      className="btn btn--secondary"
      onClick={onExport}
      disabled={disabled}
      title="Exporta todas as normas guardadas num ficheiro zip, com as pastas."
    >
      <LoadIcon />
      Exportar
    </button>
  );
}
