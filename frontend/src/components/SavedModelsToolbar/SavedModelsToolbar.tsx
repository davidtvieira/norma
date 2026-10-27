import type { SavedNrmQuery } from '../../types/savedNrm';
import './SavedModelsToolbar.css';

/** The ways to order the library, as the select offers them. */
const ORDERS: { label: string; sort: SavedNrmQuery['sort']; direction: SavedNrmQuery['direction'] }[] = [
  { label: 'Mais recentes', sort: 'updatedAt', direction: 'desc' },
  { label: 'Mais antigos', sort: 'updatedAt', direction: 'asc' },
  { label: 'Nome (A–Z)', sort: 'name', direction: 'asc' },
  { label: 'Nome (Z–A)', sort: 'name', direction: 'desc' },
  { label: 'Maiores', sort: 'sizeBytes', direction: 'desc' },
  { label: 'Mais operações', sort: 'operationCount', direction: 'desc' },
];

interface SavedModelsToolbarProps {
  query: SavedNrmQuery;
  onChange: (query: SavedNrmQuery) => void;
}

/** A search box and an order select above the grid of saved models. */
export function SavedModelsToolbar({ query, onChange }: SavedModelsToolbarProps) {
  const orderIndex = Math.max(
    0,
    ORDERS.findIndex((order) => order.sort === query.sort && order.direction === query.direction),
  );

  return (
    <div className="saved-models-toolbar">
      <input
        type="search"
        className="saved-models-toolbar__search"
        placeholder="Pesquisar por nome ou ficheiro de dados…"
        aria-label="Pesquisar normas"
        value={query.search}
        onChange={(event) => onChange({ ...query, search: event.target.value })}
      />
      <select
        className="saved-models-toolbar__order"
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
