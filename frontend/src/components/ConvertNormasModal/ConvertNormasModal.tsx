import { useEffect, useRef, useState } from 'react';
import { Modal } from '../Modal/Modal';
import { convertNorma, listLibrary } from '../../services/datasetApi';
import { DEFAULT_SAVED_QUERY, type SavedNrmPayload } from '../../types/savedNrm';
import type { ConversionReportPayload } from '../../types/conversion';
import './ConvertNormasModal.css';

type Row = { state: 'waiting' } | { state: 'running' } | { state: 'done'; report: ConversionReportPayload } | { state: 'error'; message: string };

interface ConvertNormasModalProps {
  onClose: () => void;
}

function describe(report: ConversionReportPayload): string {
  const changed = [
    report.counters > 0 ? `${report.counters} ${report.counters === 1 ? 'Contador' : 'Contadores'}` : '',
    report.calcs > 0 ? `${report.calcs} Calcular reescritos` : '',
    report.formatters > 0 ? `${report.formatters} ${report.formatters === 1 ? 'Formatador passou' : 'Formatadores passaram'} para a validação` : '',
    report.pages > 0 ? 'Seletor de página passou para a configuração' : '',
    report.iterations > 0 ? 'Iterador passou para a configuração' : '',
    report.version ? 'versões retiradas' : '',
  ].filter(Boolean);
  const cases = report.cases > 0 ? `${report.cases} testes iguais` : '';
  return [changed.join(' e '), cases].filter(Boolean).join(' · ');
}

const STATUS_LABEL: Record<ConversionReportPayload['status'], string> = {
  converted: 'Convertida',
  verified: 'Verificada',
  unchanged: 'Sem alterações',
  failed: 'Falhou',
};

/**
 * TEMPORARY, to be deleted once the saved normas are converted: runs the conversion over every norma in the library, one
 * after the other. For each, the backend converts it, runs its saved test cases on the result and compares them with what the
 * norma answered before; only a norma whose every case matches is saved (and never with "Só verificar"). One that does not
 * match is left as it was and shows why.
 */
export function ConvertNormasModal({ onClose }: ConvertNormasModalProps) {
  const [normas, setNormas] = useState<SavedNrmPayload[] | null>(null);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [dryRun, setDryRun] = useState(true);
  const [running, setRunning] = useState(false);
  const cancelled = useRef(false);

  useEffect(() => {
    let live = true;
    listLibrary({ ...DEFAULT_SAVED_QUERY, everywhere: true })
      .then((listing) => {
        if (live) setNormas(listing.normas);
      })
      .catch(() => undefined);
    return () => {
      live = false;
      cancelled.current = true;
    };
  }, []);

  async function start() {
    if (!normas) return;
    setRunning(true);
    cancelled.current = false;
    setRows(Object.fromEntries(normas.map((norma) => [norma.id, { state: 'waiting' } as Row])));
    for (const norma of normas) {
      if (cancelled.current) break;
      setRows((current) => ({ ...current, [norma.id]: { state: 'running' } }));
      try {
        const report = await convertNorma(norma.id, dryRun);
        setRows((current) => ({ ...current, [norma.id]: { state: 'done', report } }));
      } catch (error) {
        setRows((current) => ({ ...current, [norma.id]: { state: 'error', message: error instanceof Error ? error.message : 'Falhou.' } }));
      }
    }
    setRunning(false);
  }

  const finished = Object.values(rows).filter((row) => row.state === 'done' || row.state === 'error').length;
  const failed = Object.values(rows).filter((row) => row.state === 'error' || (row.state === 'done' && row.report.status === 'failed')).length;

  return (
    <Modal
      title="Converter normas"
      size="lg"
      onClose={onClose}
      closeDisabled={running}
      closeOnBackdrop={false}
      actions={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={running}>
            Fechar
          </button>
          <button type="button" className="btn btn--primary" onClick={start} disabled={running || !normas || normas.length === 0}>
            {running ? 'A converter…' : dryRun ? 'Verificar' : 'Converter'}
          </button>
        </>
      }
    >
      <p className="modal__hint">
        Cada norma é convertida, testada com os mesmos valores de antes e comparada com o resultado anterior. Só é guardada se
        tudo for igual; se alguma coisa for diferente, fica como estava.
      </p>
      <label className="convert-normas__option">
        <input type="checkbox" checked={dryRun} onChange={(event) => setDryRun(event.target.checked)} disabled={running} />
        Só verificar, sem guardar
      </label>

      {normas && Object.keys(rows).length > 0 && (
        <p className="convert-normas__summary">
          {finished} de {normas.length}
          {failed > 0 && ` · ${failed} ${failed === 1 ? 'falhou' : 'falharam'}`}
        </p>
      )}

      <ul className="convert-normas__list">
        {(normas ?? []).map((norma) => {
          const row = rows[norma.id];
          return (
            <li key={norma.id} className="convert-normas__row">
              <div className="convert-normas__line">
                <span className="convert-normas__name">
                  {norma.name}
                  {norma.description && <span className="convert-normas__description"> · {norma.description}</span>}
                </span>
                <span className={`convert-normas__status convert-normas__status--${row?.state === 'done' ? row.report.status : (row?.state ?? 'idle')}`}>
                  {!row && '—'}
                  {row?.state === 'waiting' && 'À espera'}
                  {row?.state === 'running' && 'A converter…'}
                  {row?.state === 'done' && STATUS_LABEL[row.report.status]}
                  {row?.state === 'error' && 'Erro'}
                </span>
              </div>
              {row?.state === 'done' && describe(row.report) && <p className="convert-normas__detail">{describe(row.report)}</p>}
              {row?.state === 'done' &&
                row.report.problems.map((problem) => (
                  <p key={problem} className="convert-normas__problem">
                    {problem}
                  </p>
                ))}
              {row?.state === 'error' && <p className="convert-normas__problem">{row.message}</p>}
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
