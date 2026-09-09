import { getInputSources } from '../types/valueSource';

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
  operations: ExportedOperationNode[];
}

export interface ExportedModel {
  version: 1;
  modelName: string;
  datasetId: string;
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
): ExportedModel {
  const confirmedEntries = entries.filter((entry) => entry.confirmed);
  const roots = confirmedEntries.filter((entry) => !isLinkedChild(entry, confirmedEntries));
  return {
    version: MODEL_EXPORT_VERSION,
    modelName,
    datasetId,
    inputOperationIds,
    outputOperationIds,
    operations: roots.map((entry) => toNode(entry, confirmedEntries)),
  };
}

export class ModelImportError extends Error {}

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

  out.push({ id: typedNode.id, name: typedNode.name, kindId: typedNode.kind, confirmed: true, fields: typedNode.fields });

  for (const child of typedNode.operations ?? []) {
    flattenNode(child, knownKindIds, out);
  }
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
export function parseModelImport(raw: string, knownKindIds: Set<string>): ExportedModel & { entries: SerializableEntry[] } {
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

  // Missing on a model exported before the input/output pickers existed — treated as "not set
  // yet" rather than rejecting the file, same as a freshly created model before its author has
  // picked one.
  const rawModel = model as unknown as Record<string, unknown>;
  return {
    ...model,
    inputOperationIds: readOperationIds(rawModel, 'inputOperationIds', 'inputOperationId'),
    outputOperationIds: readOperationIds(rawModel, 'outputOperationIds', 'outputOperationId'),
    entries,
  };
}
