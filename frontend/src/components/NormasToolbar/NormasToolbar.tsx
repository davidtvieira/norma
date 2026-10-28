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
  /** The name of the open folder, when there is one — the search can then be limited to it. */
  folderName: string | null;
  searchInFolder: boolean;
  onSearchInFolderChange: (value: boolean) => void;
}

/** A search box and an order select above the grid of normas. */
export function NormasToolbar({ query, onChange, folderName, searchInFolder, onSearchInFolderChange }: NormasToolbarProps) {
  const orderIndex = Math.max(
    0,
    ORDERS.findIndex((order) => order.sort === query.sort && order.direction === query.direction),
  );

  return (
    <div className="normas-toolbar">
      <input
        type="search"
        className="normas-toolbar__search"
        placeholder="Pesquisar por nome ou ficheiro de dados…"
        aria-label="Pesquisar normas"
        value={query.search}
        onChange={(event) => onChange({ ...query, search: event.target.value })}
      />
      {folderName !== null && (
        <label className="normas-toolbar__scope" title={`Pesquisar só nas normas de "${folderName}"`}>
          <input type="checkbox" checked={searchInFolder} onChange={(event) => onSearchInFolderChange(event.target.checked)} />
          Só nesta pasta
        </label>
      )}
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
