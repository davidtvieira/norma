import { LoadingOverlay } from '../LoadingOverlay/LoadingOverlay';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { inlineErrorMessage } from '../../services/apiErrors';
import { getModelOperation, getNrmOperation } from '../../services/datasetApi';
import { useDatasetSheets } from '../../hooks/useDatasetSheets';
import { getInputSources } from '../../types/valueSource';
import type { ModelOperationInputPayload, ModelOperationRefPayload } from '../../types/modelCalculation';
import { KINDS_BY_ID } from '../OperationPanel/kinds/registry';
import { KIND_LABELS } from '../OperationPanel/kindLabels';
import { Modal } from '../Modal/Modal';

interface OperationConfigModalProps {
  operation: ModelOperationRefPayload;
  /** Every operation of the model — names the operations an input is chained from. */
  operations: ModelOperationRefPayload[];
  datasetId: string;
  modelId: string;
  nrmId?: string;
  onClose: () => void;
}

/**
 * How an operation of the model is set up — its sheet, columns, range and where each input comes
 * from — for looking at only: nothing in it can be edited, and it never touches the model. Opened
 * from the "Análise" list of the Utilizar screen.
 */
export function OperationConfigModal({ operation, operations, datasetId, modelId, nrmId, onClose }: OperationConfigModalProps) {
  const [config, setConfig] = useState<ModelOperationInputPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { dataset } = useDatasetSheets(datasetId, nrmId);

  useEffect(() => {
    let cancelled = false;
    (nrmId ? getNrmOperation(nrmId, operation.id) : getModelOperation(modelId, operation.id))
      .then((loaded) => {
        if (!cancelled) setConfig(loaded);
      })
      .catch((failure) => {
        if (!cancelled) setError(inlineErrorMessage(failure, 'Falha ao obter a operação.') || 'Falha ao obter a operação.');
      });
    return () => {
      cancelled = true;
    };
  }, [modelId, nrmId, operation.id]);

  const nameOf = (id: string) => operations.find((item) => item.id === id)?.name ?? id;

  let summary: ReactNode = null;
  if (config && dataset) {
    try {
      summary = KINDS_BY_ID[config.kind]?.renderSummary(config.fields, dataset, null) ?? null;
    } catch {
      summary = null; // a summary that can't be drawn for this dataset just isn't shown
    }
  }
  const sources = config ? getInputSources(config.fields) : [];

  return (
    <Modal title={operation.name} subtitle={KIND_LABELS[operation.kind] ?? operation.kind} onClose={onClose}>
      {error && <p className="modal__text">{error}</p>}
      {!error && !config && <LoadingOverlay delayMs={200} />}
      {config && (
        <div className="model-card__config">
          {summary && <div className="model-card__config-summary">{summary}</div>}
          {sources.length > 0 && (
            <>
              <h4 className="model-card__config-heading">{sources.length > 1 ? 'Entradas' : 'Entrada'}</h4>
              <ul className="model-card__config-list">
                {sources.map((source, index) => (
                  <li key={index}>
                    {source.type === 'literal'
                      ? source.value === ''
                        ? 'Valor por definir'
                        : `Valor fixo: ${source.value}`
                      : `Resultado de «${nameOf(source.operationId)}»${source.outputIndex !== undefined ? ` (saída ${source.outputIndex + 1})` : ''}`}
                  </li>
                ))}
              </ul>
            </>
          )}
          {!summary && sources.length === 0 && <p className="modal__hint">Sem configuração para mostrar.</p>}
        </div>
      )}
    </Modal>
  );
}
