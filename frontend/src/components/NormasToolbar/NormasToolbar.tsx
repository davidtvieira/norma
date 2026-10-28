import { LoadIcon, SearchIcon } from '../ButtonIcons/ButtonIcons';
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
  /** "Exportar": every saved norma in one zip. Disabled while there is nothing to export. */
  onExport: () => void;
  canExport: boolean;
}

/** The search box (with, inside a folder, a toggle at its end to search only there) and the order select, beside the title. */
export function NormasToolbar({ query, onChange, folderName, searchEverywhere, onSearchEverywhereChange, onExport, canExport }: NormasToolbarProps) {
  const orderIndex = Math.max(
    0,
    ORDERS.findIndex((order) => order.sort === query.sort && order.direction === query.direction),
  );

  return (
    <div className="normas-toolbar">
      <div className="normas-toolbar__searchbox">
        <SearchIcon className="normas-toolbar__search-icon" />
        <input
          type="search"
          className={`normas-toolbar__search${folderName !== null ? ' normas-toolbar__search--scoped' : ''}`}
          placeholder="Pesquisar por nome ou ficheiro de dados…"
          aria-label="Pesquisar normas"
          value={query.search}
          onChange={(event) => onChange({ ...query, search: event.target.value })}
        />
        {folderName !== null && (
          <button
            type="button"
            className={`normas-toolbar__scope${searchEverywhere ? ' normas-toolbar__scope--on' : ''}`}
            aria-pressed={searchEverywhere}
            title={`Pesquisar em todas as normas, não só nas de "${folderName}"`}
            onClick={() => onSearchEverywhereChange(!searchEverywhere)}
          >
            Em todas as pastas
          </button>
        )}
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
      <button
        type="button"
        className="normas-toolbar__export"
        onClick={onExport}
        disabled={!canExport}
        title="Exporta todas as normas guardadas num ficheiro zip, com as pastas."
      >
        <LoadIcon />
        Exportar
      </button>
    </div>
  );
}
