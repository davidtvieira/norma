import { CloseIcon, LoadIcon, SearchIcon } from '../ButtonIcons/ButtonIcons';
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
  /** The name of the open folder, when there is one — a search then looks only at the normas filed right in it, unless told to look everywhere. */
  folderName: string | null;
  searchEverywhere: boolean;
  onSearchEverywhereChange: (value: boolean) => void;
}

/** The search box (with, inside a folder, a toggle at its end to search only there), and the order select, on a line of their own under the title. */
export function NormasToolbar({ query, onChange, folderName, searchEverywhere, onSearchEverywhereChange }: NormasToolbarProps) {
  const orderIndex = Math.max(
    0,
    ORDERS.findIndex((order) => order.sort === query.sort && order.direction === query.direction),
  );

  return (
    <div className="normas-toolbar">
      <div className={`normas-toolbar__searchbox${folderName !== null ? ' normas-toolbar__searchbox--scoped' : ''}`}>
        <SearchIcon className="normas-toolbar__search-icon" />
        <input
          type="search"
          className={`normas-toolbar__search${folderName !== null ? ' normas-toolbar__search--scoped' : ''}`}
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
          {folderName !== null && (
            <button
              type="button"
              className={`normas-toolbar__scope${searchEverywhere ? ' normas-toolbar__scope--on' : ''}`}
              aria-pressed={searchEverywhere}
              title={`Pesquisar também nas subpastas de "${folderName}"`}
              onClick={() => onSearchEverywhereChange(!searchEverywhere)}
            >
              Em subpastas
            </button>
          )}
        </div>
      </div>
      <select
        className="normas-toolbar__order"
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
    </div>
  );
}

/** "Exportar": every saved norma in one zip, at the right end of the title's line. Disabled while it is being made. */
export function NormasExportButton({ onExport, disabled }: { onExport: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      className="normas-toolbar__export"
      onClick={onExport}
      disabled={disabled}
      title="Exporta todas as normas guardadas num ficheiro zip, com as pastas."
    >
      <LoadIcon />
      Exportar
    </button>
  );
}
