import { getInputSources } from '../types/valueSource';

/** A node's position on the canvas surface — duplicated from OperationPanel's own NodePosition
 * (rather than imported) so this module doesn't import from a component file (see the same note
 * on utils/resolveOperationInputs.ts's ChainableEntry). */
export interface EntryPosition {
  x: number;
  y: number;
}

/**
 * Any operation entry, reduced to what (de)serialization needs — kept separate from
 * OperationPanel's own OperationEntryState so this module doesn't import from a component file
 * (see the same note on utils/resolveOperationInputs.ts's ChainableEntry).
 */
export interface SerializableEntry {
  id: string;
  name: string;
  kindId: string;
  confirmed: boolean;
  fields: Record<string, unknown>;
  /** Undefined only for an entry read back from a model exported before positions were saved —
   * OperationPanel falls back to its usual cascading placement for those (see its initialEntries
   * handling), same as it always has. */
  position?: EntryPosition;
}

/**
 * One operation in the exported model tree. Nested under its source operation's `operations`
 * array when its own fields hold a dynamic-input reference to that source — the same
 * relationship the panel shows as a nested card (see OperationPanel's childOperationsOf) — so
 * the exported shape mirrors what's on screen instead of a flat, harder-to-read list.
 */
export interface ExportedOperationNode {
  id: string;
  kind: string;
  name: string;
  fields: Record<string, unknown>;
  /** Where this operation sat on the canvas when the model was saved — restored on import so
   * reopening a model to edit it lands every operation back where its author left it, instead of
   * cascading them all into OperationPanel's default new-entry grid. */
  position: EntryPosition;
  operations: ExportedOperationNode[];
}

/**
 * One rule set of the model's input validation, kept in the model's settings and not on its canvas: the id, name and rules (with the
 * inputs they apply to) of what the editor works with as a formatter.
 */
export interface ExportedRuleSet {
  id: string;
  name: string;
  fields: Record<string, unknown>;
}

/** The kinds whose entries the model keeps in its settings instead of on its canvas: the validation rule sets, and the page selector. */
const VALIDATION_KIND_ID = 'formatter';
const PAGE_KIND_ID = 'page';
const ITERATOR_KIND_ID = 'iterator';

export interface ExportedModel {
  version: 1;
  modelName: string;
  /** The .nrm file's own name (distinct from modelName and the dataset's filename) — what the
   * landing screen's "Sessões recentes" identifies a session by. Absent on a model exported
   * before .nrm files had names (readNrmName falls back to the file's own name for those). */
  nrmName?: string;
  /** What the author wrote about the norma (optional): kept with the model so the session cache and a bare .json carry it too. The .nrm's own info.json is its source of truth. */
  nrmDescription?: string;
  datasetId: string;
  /** The model's own configuration, apart from its operations. Absent when it has none. */
  settings?: { validation?: ExportedRuleSet[]; page?: ExportedRuleSet; iteration?: ExportedRuleSet };
  /**
   * The operations whose literal values are what a caller of the model fills in (possibly
   * several, each filled in separately — possibly none, for a model with nothing dynamic left to
   * fill in), and the operations whose results are what a caller sees as "the" answer(s) —
   * possibly several too — set by the model's author (see OperationPanel's model-input/
   * model-output pickers) so utilizing a model (ModelCard) doesn't expose every operation's own
   * input/result, only these. Both empty until the author has picked at least one (or, for a
   * model exported before this existed, always empty).
   */
  inputOperationIds: string[];
  outputOperationIds: string[];
  operations: ExportedOperationNode[];
}

const MODEL_EXPORT_VERSION = 1;

/**
 * An entry's tree parent for export nesting: the first of its (possibly several — e.g. counter's
 * "inputs" list) chainable fields that's a reference. Purely cosmetic — a node that references
 * more than one other operation still nests under only this one, since the tree can't show two
 * parents at once, but every reference it holds (not just this "primary" one) stays fully
 * preserved in its own `fields` regardless of where it ends up nested, which is what
 * flattenNode/computation actually reads back — nesting position never carries relationship data
 * of its own.
 */
function primaryReferenceId(fields: Record<string, unknown>): string | null {
  const reference = getInputSources(fields).find((source) => source.type === 'reference');
  return reference?.type === 'reference' ? reference.operationId : null;
}

function childrenOf(entryId: string, confirmedEntries: SerializableEntry[]): SerializableEntry[] {
  return confirmedEntries.filter((entry) => primaryReferenceId(entry.fields) === entryId);
}

function isLinkedChild(entry: SerializableEntry, confirmedEntries: SerializableEntry[]): boolean {
  const parentId = primaryReferenceId(entry.fields);
  return parentId !== null && confirmedEntries.some((candidate) => candidate.id === parentId);
}

function toNode(entry: SerializableEntry, confirmedEntries: SerializableEntry[]): ExportedOperationNode {
  return {
    id: entry.id,
    kind: entry.kindId,
    name: entry.name,
    fields: entry.fields,
    // Falls back to the origin only for an entry that somehow has no position of its own — never
    // actually true for one coming off the live canvas (OperationPanel always assigns one), just
    // satisfies SerializableEntry's own optional position (see its own note on why that's
    // optional) without a null check at every other call site.
    position: entry.position ?? { x: 0, y: 0 },
    operations: childrenOf(entry.id, confirmedEntries).map((child) => toNode(child, confirmedEntries)),
  };
}

/**
 * Builds the exportable JSON model: only confirmed operations (a draft isn't part of the model
 * yet), nested to mirror how a dynamically-linked operation is shown nested under its source in
 * the panel — top-level entries are the ones nothing else nests them under.
 */
export function buildModelExport(
  entries: SerializableEntry[],
  modelName: string,
  datasetId: string,
  inputOperationIds: string[],
  outputOperationIds: string[],
  nrmName = '',
  nrmDescription = '',
): ExportedModel {
  const confirmedEntries = entries.filter((entry) => entry.confirmed && entry.kindId !== VALIDATION_KIND_ID && entry.kindId !== PAGE_KIND_ID && entry.kindId !== ITERATOR_KIND_ID);
  const roots = confirmedEntries.filter((entry) => !isLinkedChild(entry, confirmedEntries));
  const validation: ExportedRuleSet[] = entries
    .filter((entry) => entry.confirmed && entry.kindId === VALIDATION_KIND_ID)
    .map((entry) => ({ id: entry.id, name: entry.name, fields: entry.fields }));
  const pageEntry = entries.find((entry) => entry.confirmed && entry.kindId === PAGE_KIND_ID);
  const iterationEntry = entries.find((entry) => entry.confirmed && entry.kindId === ITERATOR_KIND_ID);
  const settings = {
    ...(validation.length > 0 ? { validation } : {}),
    ...(pageEntry ? { page: { id: pageEntry.id, name: pageEntry.name, fields: pageEntry.fields } } : {}),
    ...(iterationEntry ? { iteration: { id: iterationEntry.id, name: iterationEntry.name, fields: iterationEntry.fields } } : {}),
  };
  return {
    version: MODEL_EXPORT_VERSION,
    modelName,
    ...(nrmName.trim() ? { nrmName: nrmName.trim() } : {}),
    ...(nrmDescription.trim() ? { nrmDescription: nrmDescription.trim() } : {}),
    datasetId,
    inputOperationIds,
    outputOperationIds,
    ...(Object.keys(settings).length > 0 ? { settings } : {}),
    operations: roots.map((entry) => toNode(entry, confirmedEntries)),
  };
}

export class ModelImportError extends Error {}

/**
 * Reads a node's saved position, tolerating a model exported before positions were saved (or one
 * hand-edited into something malformed) by falling back to undefined instead of rejecting the
 * whole import — OperationPanel already falls back to its usual cascading placement in that case,
 * same as it always has.
 */
function readPosition(node: Record<string, unknown>): EntryPosition | undefined {
  const position = node.position;
  if (
    typeof position === 'object' &&
    position !== null &&
    typeof (position as EntryPosition).x === 'number' &&
    typeof (position as EntryPosition).y === 'number'
  ) {
    return { x: (position as EntryPosition).x, y: (position as EntryPosition).y };
  }
  return undefined;
}

function flattenNode(node: unknown, knownKindIds: Set<string>, out: SerializableEntry[]): void {
  if (
    typeof node !== 'object' ||
    node === null ||
    typeof (node as ExportedOperationNode).id !== 'string' ||
    typeof (node as ExportedOperationNode).kind !== 'string' ||
    typeof (node as ExportedOperationNode).name !== 'string' ||
    typeof (node as ExportedOperationNode).fields !== 'object' ||
    (node as ExportedOperationNode).fields === null
  ) {
    throw new ModelImportError('Ficheiro de modelo inválido: operação mal formada.');
  }

  const typedNode = node as ExportedOperationNode;
  if (!knownKindIds.has(typedNode.kind)) {
    throw new ModelImportError(`Tipo de operação desconhecido: ${typedNode.kind}`);
  }

  out.push({
    id: typedNode.id,
    name: typedNode.name,
    kindId: typedNode.kind,
    confirmed: true,
    fields: typedNode.fields,
    position: readPosition(typedNode as unknown as Record<string, unknown>),
  });

  for (const child of typedNode.operations ?? []) {
    flattenNode(child, knownKindIds, out);
  }
}

/** One entry of the model's settings (an id, a name and its fields), or undefined when there is none; anything else is refused. */
function readSettingEntry(item: unknown): ExportedRuleSet | undefined {
  if (item === undefined) return undefined;
  const entry = item as Partial<ExportedRuleSet> | null;
  if (typeof entry !== 'object' || entry === null || typeof entry.id !== 'string' || typeof entry.name !== 'string' || typeof entry.fields !== 'object' || entry.fields === null) {
    throw new ModelImportError('Ficheiro de modelo inválido: configuração mal formada.');
  }
  return { id: entry.id, name: entry.name, fields: entry.fields };
}

/** The validation rule sets of the model's settings, if it has any. */
function readRuleSets(model: ExportedModel): ExportedRuleSet[] {
  const validation = (model.settings as { validation?: unknown } | undefined)?.validation;
  if (validation === undefined) return [];
  if (!Array.isArray(validation)) throw new ModelImportError('Ficheiro de modelo inválido: configuração mal formada.');
  return validation.map((item) => readSettingEntry(item ?? {}) as ExportedRuleSet);
}

/**
 * Reads one of the model's designated input/output lists, tolerating a file exported before a
 * model could have more than one of either: the current array field (`arrayField`) if present,
 * falling back to wrapping the old singular field (`legacyField`, e.g. `inputOperationId` or
 * `outputOperationId`) into a one-element array if that one's set, or an empty array for either a
 * model with none at all or one exported before either field existed.
 */
function readOperationIds(model: Record<string, unknown>, arrayField: string, legacyField: string): string[] {
  const current = model[arrayField];
  if (Array.isArray(current)) {
    return current.filter((id): id is string => typeof id === 'string');
  }
  const legacy = model[legacyField];
  return typeof legacy === 'string' ? [legacy] : [];
}

/**
 * Reverses buildModelExport: flattens the nested tree back into the flat entry list
 * OperationPanel keeps internally. No relationship is lost by flattening — the parent/child
 * nesting in the JSON only ever mirrors the reference each entry's own fields already carry.
 */
export function parseModelImport(
  raw: string,
  knownKindIds: Set<string>,
): ExportedModel & { nrmName: string; nrmDescription: string; entries: SerializableEntry[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ModelImportError('Ficheiro inválido: não é um JSON válido.');
  }

  if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as ExportedModel).operations)) {
    throw new ModelImportError('Ficheiro de modelo inválido.');
  }

  const model = parsed as ExportedModel;
  const entries: SerializableEntry[] = [];
  for (const node of model.operations) {
    flattenNode(node, knownKindIds, entries);
  }
  for (const ruleSet of readRuleSets(model)) {
    entries.push({ id: ruleSet.id, name: ruleSet.name, kindId: VALIDATION_KIND_ID, confirmed: true, fields: ruleSet.fields });
  }
  const page = readSettingEntry((model.settings as { page?: unknown } | undefined)?.page);
  if (page) entries.push({ id: page.id, name: page.name, kindId: PAGE_KIND_ID, confirmed: true, fields: page.fields });
  const iteration = readSettingEntry((model.settings as { iteration?: unknown } | undefined)?.iteration);
  if (iteration) entries.push({ id: iteration.id, name: iteration.name, kindId: ITERATOR_KIND_ID, confirmed: true, fields: iteration.fields });

  // Missing on a model exported before the input/output pickers existed — treated as "not set
  // yet" rather than rejecting the file, same as a freshly created model before its author has
  // picked one.
  const rawModel = model as unknown as Record<string, unknown>;
  return {
    ...model,
    nrmName: typeof model.nrmName === 'string' ? model.nrmName.trim() : '',
    nrmDescription: typeof model.nrmDescription === 'string' ? model.nrmDescription.trim() : '',
    inputOperationIds: readOperationIds(rawModel, 'inputOperationIds', 'inputOperationId'),
    outputOperationIds: readOperationIds(rawModel, 'outputOperationIds', 'outputOperationId'),
    entries,
  };
}
