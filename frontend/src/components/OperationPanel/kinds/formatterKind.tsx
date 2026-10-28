import type { ReactNode } from 'react';
import { DEFAULT_VALUE_FORMAT, TYPE_LABELS, describeFormat, isFormatConsistent, type ValueFormat, type ValueType } from '../../../types/valueFormat';
import type { OperationFields, OperationKind } from '../operationKind';

/** The rules (see types/valueFormat.ts) plus the operations they apply to, as a formatter keeps them in its fields. */
interface FormatterFields extends ValueFormat {
  // The ids of the operations whose "input" has to obey the rules — chosen by clicking their cards on the canvas
  // (see OperationPanel's formatter pick), not set with the rules.
  appliesTo: string[];
}

function asFormatterFields(fields: OperationFields): FormatterFields {
  return fields as unknown as FormatterFields;
}

/** The kinds' ids of the formatter, for the places that treat it apart (it has no input and no output of its own). */
export const FORMATTER_KIND_ID = 'formatter';

function numberOrNull(text: string): number | null {
  if (text.trim() === '') return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

interface RulesFormProps {
  fields: FormatterFields;
  updateFields: (patch: OperationFields) => void;
}

/** The type and limits of the formatter: the fields shown while creating it and again on its card. */
function RulesForm({ fields, updateFields }: RulesFormProps) {
  const isText = fields.type === 'text';
  const lengthOrRange = (label: string, key: 'minLength' | 'maxLength' | 'min' | 'max', placeholder: string): ReactNode => (
    <div className="operation-entry__field">
      <label className="operation-entry__label">{label}</label>
      <input
        type="number"
        className="operation-entry__input"
        value={fields[key] ?? ''}
        placeholder={placeholder}
        min={key === 'minLength' || key === 'maxLength' ? 0 : undefined}
        step={key === 'minLength' || key === 'maxLength' || fields.type === 'integer' ? 1 : 'any'}
        onChange={(event) => updateFields({ [key]: numberOrNull(event.target.value) })}
      />
    </div>
  );

  return (
    <>
      <div className="operation-entry__field">
        <label className="operation-entry__label">Tipo de valor</label>
        <select className="operation-entry__select" value={fields.type} onChange={(event) => updateFields({ type: event.target.value as ValueType })}>
          {(Object.keys(TYPE_LABELS) as ValueType[]).map((type) => (
            <option key={type} value={type}>
              {TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </div>

      {isText ? (
        <>
          {lengthOrRange('Mínimo de caracteres', 'minLength', 'Sem mínimo')}
          {lengthOrRange('Máximo de caracteres', 'maxLength', 'Sem máximo')}
        </>
      ) : (
        <>
          {lengthOrRange('Valor mínimo', 'min', 'Sem mínimo')}
          {lengthOrRange('Valor máximo', 'max', 'Sem máximo')}
        </>
      )}

      <label className="formatter-entry__required">
        <input type="checkbox" checked={fields.required} onChange={(event) => updateFields({ required: event.target.checked })} />
        Obrigatório (não pode ficar vazio)
      </label>

      {!isFormatConsistent(fields) && (
        <p className="operation-entry__result operation-entry__result--empty">O mínimo não pode ser maior do que o máximo.</p>
      )}
    </>
  );
}

/**
 * Not an operation on a value — a formatter has no input and produces no result. It holds rules (a type, a length or a
 * range, whether a value is required) and the operations they apply to: the value such an operation reads as its "input"
 * must obey the rules, otherwise the operation fails with the rule it broke (see the backend's
 * ModelExecutionService.applyFormatters). The rules are set when it is created or edited (the pencil); which operations they apply to is chosen
 * afterwards by clicking the formatter's card, which lists the operations to choose from. Whoever utilizes the model sees the
 * rules next to each input they apply to.
 */
export const formatterKind: OperationKind = {
  id: FORMATTER_KIND_ID,

  createFields: (): OperationFields => ({ ...DEFAULT_VALUE_FORMAT, appliesTo: [] } satisfies FormatterFields),

  canConfirm: (fields) => isFormatConsistent(asFormatterFields(fields)),

  renderDraftConfig: ({ fields, updateFields }) => <RulesForm fields={asFormatterFields(fields)} updateFields={updateFields} />,

  renderSummary: (fields) => {
    const f = asFormatterFields(fields);
    const count = f.appliesTo?.length ?? 0;
    return (
      <span>
        {describeFormat(f)} · {count === 1 ? '1 entrada' : `${count} entradas`}
      </span>
    );
  },

  // Its detail, opened by clicking its card, is only for choosing the model's defined inputs it applies to, from a list; the rules
  // themselves are edited with the pencil (see renderDraftConfig).
  renderBody: ({ fields, updateFields, formatTargets }) => {
    const applied = new Set(asFormatterFields(fields).appliesTo ?? []);
    // "Selecionar todas" covers every operation not already taken by another formatter.
    const free = formatTargets.filter((target) => target.takenBy === null).map((target) => target.operationId);
    const appliedFree = free.filter((id) => applied.has(id));
    const allSelected = free.length > 0 && appliedFree.length === free.length;
    return (
      <div className="operation-entry__field">
        <label className="operation-entry__label">Aplica-se a</label>
        {formatTargets.length === 0 ? (
          <p className="operation-entry__result operation-entry__result--empty">O modelo ainda não tem entradas definidas. Marque uma operação como «Input» no seu cartão.</p>
        ) : (
          <ul className="formatter-entry__targets">
            <li>
              <label className="formatter-entry__target formatter-entry__target--all">
                <input
                  type="checkbox"
                  checked={allSelected}
                  disabled={free.length === 0}
                  ref={(element) => {
                    if (element) element.indeterminate = appliedFree.length > 0 && !allSelected;
                  }}
                  onChange={(event) =>
                    updateFields({
                      // Takes in (or lets go of) every free operation, leaving the ones another formatter holds alone.
                      appliesTo: event.target.checked
                        ? [...new Set([...applied, ...free])]
                        : [...applied].filter((id) => !free.includes(id)),
                    })
                  }
                />
                <span>Selecionar todas</span>
              </label>
            </li>
            {formatTargets.map((target) => (
              <li key={target.operationId}>
                <label className={`formatter-entry__target${target.takenBy ? ' formatter-entry__target--taken' : ''}`}>
                  <input
                    type="checkbox"
                    checked={applied.has(target.operationId)}
                    disabled={target.takenBy !== null}
                    onChange={(event) =>
                      updateFields({
                        appliesTo: event.target.checked
                          ? [...applied, target.operationId]
                          : [...applied].filter((id) => id !== target.operationId),
                      })
                    }
                  />
                  <span>{target.label}</span>
                  {target.takenBy && <span className="formatter-entry__taken">já tem «{target.takenBy}»</span>}
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  },

  getColumnHighlights: () => [],
};
