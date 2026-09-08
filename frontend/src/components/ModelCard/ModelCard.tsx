import { useState } from 'react';
import type { DatasetImportResponse } from '../../types/dataset';
import type { OperationFields } from '../OperationPanel/operationKind';
import { KINDS_BY_ID } from '../OperationPanel/kinds/registry';
import { resolveOperationInputs } from '../../utils/resolveOperationInputs';
import type { SerializableEntry } from '../../utils/modelSerialization';
import './ModelCard.css';

interface ModelCardProps {
  dataset: DatasetImportResponse;
  modelName: string;
  entries: SerializableEntry[];
}

/**
 * A model previously built in the editor and re-imported to be used, not edited: one card with
 * the model's name, a plain input for each operation's literal ("non dynamic") value, and that
 * operation's live output — no sheet, no column/range pickers, no rename/edit/delete. Reuses
 * each kind's renderBody as-is (with an empty referenceOptions, which hides the "Input
 * dinâmico" switch) so a chained operation's input renders as the read-only "Resultado de: X"
 * pill it already is, rather than something editable — the chain is fixed by the imported model.
 */
export function ModelCard({ dataset, modelName, entries }: ModelCardProps) {
  const [fields, setFields] = useState<Record<string, OperationFields>>(() =>
    Object.fromEntries(entries.map((entry) => [entry.id, entry.fields])),
  );
  // Each operation's latest computed result, keyed by entry id — feeds any operation further
  // down the chain whose input references it (see resolveOperationInputs).
  const [results, setResults] = useState<Record<string, string | null>>({});

  const liveEntries = entries.map((entry) => ({ id: entry.id, confirmed: entry.confirmed, fields: fields[entry.id] }));
  const resolvedInputs = resolveOperationInputs(liveEntries, results);

  function updateEntryFields(id: string, patch: OperationFields) {
    setFields((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }

  return (
    <div className="model-card">
      <h2 className="model-card__title">{modelName || 'Modelo sem nome'}</h2>

      <div className="model-card__operations">
        {entries.map((entry) => {
          const kind = KINDS_BY_ID[entry.kindId];
          return (
            <div key={entry.id} className="model-card__operation">
              <h3 className="model-card__operation-name">{entry.name || 'Operação sem nome'}</h3>
              {kind.renderBody({
                fields: fields[entry.id],
                updateFields: (patch) => updateEntryFields(entry.id, patch),
                datasetId: dataset.datasetId,
                onMatchChange: () => {},
                resolvedInput: resolvedInputs[entry.id],
                referenceOptions: [],
                onResultChange: (value) => setResults((current) => ({ ...current, [entry.id]: value })),
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
