import type { ReactNode } from 'react';
import { Modal } from '../Modal/Modal';
import './ModelSettingsModal.css';

export interface ValidationSet {
  id: string;
  name: string;
  /** The rules in a few words, and how many inputs they apply to. */
  summary: ReactNode;
}

export interface PageSetting {
  id: string;
  name: string;
  /** What it reads the page from, in a few words. */
  summary: ReactNode;
}

export interface IterationSetting {
  id: string;
  name: string;
  /** The pages it goes through, in a few words. */
  summary: ReactNode;
}

interface ModelSettingsModalProps {
  /** Whether the model has a dataset: without one there are no pages to choose from. */
  hasDataset: boolean;
  /** The page selector, or null when the model has none. */
  page: PageSetting | null;
  /** The iteration (the model runs once per page of a range), or null when it has none. */
  iteration: IterationSetting | null;
  sets: ValidationSet[];
  /** Whether the canvas is being edited ("Editar"): only then can settings be added, changed or removed. */
  canEdit: boolean;
  onAddIteration: () => void;
  /** Opens the dialog that picks the page the editor previews. */
  onPreviewIteration: (id: string) => void;
  /** Changes the range of pages and what each is called. */
  onEditIteration: (id: string) => void;
  onRemoveIteration: (id: string) => void;
  onAddPage: () => void;
  /** Opens the dialog where the page selector's value is set. */
  onEditPage: (id: string) => void;
  onRemovePage: (id: string) => void;
  /** Opens the dialog that chooses which inputs a rule set applies to. */
  onChooseInputs: (id: string) => void;
  onEditRules: (id: string) => void;
  onRemoveRules: (id: string) => void;
  onAddRules: () => void;
  onClose: () => void;
}

/**
 * The model's own configuration, apart from its operations: which page its operations read (the page selector) and what its
 * inputs have to be (the validation rule sets, each applying to the inputs it is given). They are settings, not operations,
 * so they are not on the canvas.
 */
export function ModelSettingsModal({
  hasDataset,
  page,
  iteration,
  sets,
  canEdit,
  onAddIteration,
  onPreviewIteration,
  onEditIteration,
  onRemoveIteration,
  onAddPage,
  onEditPage,
  onRemovePage,
  onChooseInputs,
  onEditRules,
  onRemoveRules,
  onAddRules,
  onClose,
}: ModelSettingsModalProps) {
  const editHint = canEdit ? undefined : 'Entre em "Editar" para alterar.';
  return (
    <Modal
      title="Configuração do modelo"
      size="md"
      onClose={onClose}
      actions={
        <button type="button" className="btn btn--secondary" onClick={onClose}>
          Fechar
        </button>
      }
    >
      <section className="model-settings__section">
        <h3 className="modal__label">Página</h3>
        <p className="model-settings__hint">
          Por omissão cada operação lê a página em que foi criada. Com um seletor de página, todas as que seguem a página lêem a que ele escolher.
        </p>
        {!hasDataset ? (
          <p className="model-settings__empty">Precisa de um conjunto de dados.</p>
        ) : page ? (
          <ul className="model-settings__list">
            <li className="model-settings__row">
              <div className="model-settings__text">
                <span className="model-settings__name">{page.name || 'Seletor de página'}</span>
                <span className="model-settings__summary">{page.summary}</span>
              </div>
              <div className="model-settings__actions">
                <button type="button" className="btn btn--secondary btn--sm" onClick={() => onEditPage(page.id)}>
                  Valor
                </button>
                <button type="button" className="btn btn--secondary btn--sm btn--danger-hover" onClick={() => onRemovePage(page.id)} disabled={!canEdit} title={editHint}>
                  Remover
                </button>
              </div>
            </li>
          </ul>
        ) : (
          <button type="button" className="btn btn--secondary btn--sm" onClick={onAddPage} disabled={!canEdit} title={editHint}>
            + Escolher a página
          </button>
        )}
      </section>

      <section className="model-settings__section">
        <h3 className="modal__label">Iteração</h3>
        <p className="model-settings__hint">
          Com uma iteração, o modelo corre uma vez por cada página de um intervalo e dá um resultado por página.
        </p>
        {!hasDataset ? (
          <p className="model-settings__empty">Precisa de um conjunto de dados.</p>
        ) : iteration ? (
          <ul className="model-settings__list">
            <li className="model-settings__row">
              <div className="model-settings__text">
                <span className="model-settings__name">{iteration.name || 'Iterador'}</span>
                <span className="model-settings__summary">{iteration.summary}</span>
              </div>
              <div className="model-settings__actions">
                <button type="button" className="btn btn--secondary btn--sm" onClick={() => onPreviewIteration(iteration.id)}>
                  Pré-visualização
                </button>
                <button type="button" className="btn btn--secondary btn--sm" onClick={() => onEditIteration(iteration.id)} disabled={!canEdit} title={editHint}>
                  Páginas
                </button>
                <button type="button" className="btn btn--secondary btn--sm btn--danger-hover" onClick={() => onRemoveIteration(iteration.id)} disabled={!canEdit} title={editHint}>
                  Remover
                </button>
              </div>
            </li>
          </ul>
        ) : (
          <button type="button" className="btn btn--secondary btn--sm" onClick={onAddIteration} disabled={!canEdit} title={editHint}>
            + Repetir por página
          </button>
        )}
      </section>

      <section className="model-settings__section">
        <h3 className="modal__label">Validação das entradas</h3>
        <p className="model-settings__hint">Regras que as entradas do modelo têm de cumprir. Cada conjunto aplica-se às entradas que escolher.</p>
        {sets.length === 0 ? (
          <p className="model-settings__empty">Ainda não há regras de validação.</p>
        ) : (
          <ul className="model-settings__list">
            {sets.map((set) => (
              <li key={set.id} className="model-settings__row">
                <div className="model-settings__text">
                  <span className="model-settings__name">{set.name || 'Sem nome'}</span>
                  <span className="model-settings__summary">{set.summary}</span>
                </div>
                <div className="model-settings__actions">
                  <button type="button" className="btn btn--secondary btn--sm" onClick={() => onChooseInputs(set.id)}>
                    Entradas
                  </button>
                  <button type="button" className="btn btn--secondary btn--sm" onClick={() => onEditRules(set.id)} disabled={!canEdit} title={editHint}>
                    Regras
                  </button>
                  <button type="button" className="btn btn--secondary btn--sm btn--danger-hover" onClick={() => onRemoveRules(set.id)} disabled={!canEdit} title={editHint}>
                    Remover
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="btn btn--secondary btn--sm model-settings__add" onClick={onAddRules} disabled={!canEdit} title={editHint}>
          + Novo conjunto de regras
        </button>
      </section>
    </Modal>
  );
}
