import { getInputSource } from '../types/valueSource';

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
  operations: ExportedOperationNode[];
}

const MODEL_EXPORT_VERSION = 1;

function childrenOf(entryId: string, confirmedEntries: SerializableEntry[]): SerializableEntry[] {
  return confirmedEntries.filter((entry) => {
    const source = getInputSource(entry.fields);
    return source.type === 'reference' && source.operationId === entryId;
  });
}

function isLinkedChild(entry: SerializableEntry, confirmedEntries: SerializableEntry[]): boolean {
  const source = getInputSource(entry.fields);
  return source.type === 'reference' && confirmedEntries.some((candidate) => candidate.id === source.operationId);
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
export function buildModelExport(entries: SerializableEntry[], modelName: string, datasetId: string): ExportedModel {
  const confirmedEntries = entries.filter((entry) => entry.confirmed);
  const roots = confirmedEntries.filter((entry) => !isLinkedChild(entry, confirmedEntries));
  return {
    version: MODEL_EXPORT_VERSION,
    modelName,
    datasetId,
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

  return { ...model, entries };
}
