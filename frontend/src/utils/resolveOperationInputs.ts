import { getInputSource } from '../types/valueSource';

/**
 * Any operation entry, reduced to what dependency resolution needs — kept separate from
 * OperationPanel's own OperationEntryState so this module doesn't import from a component file.
 */
export interface ChainableEntry {
  id: string;
  confirmed: boolean;
  fields: object;
}

export type ResolvedInput =
  | { status: 'ready'; value: string }
  | { status: 'pending' }
  | { status: 'missing' }
  | { status: 'cycle' };

/** entryId -> the operationId it references, for every entry whose input is a reference. */
function buildReferenceGraph(entries: ChainableEntry[]): Map<string, string> {
  const edges = new Map<string, string>();
  for (const entry of entries) {
    const source = getInputSource(entry.fields);
    if (source.type === 'reference') {
      edges.set(entry.id, source.operationId);
    }
  }
  return edges;
}

/** Ids of every entry that sits on a reference cycle (directly or transitively self-referencing). */
function findCyclicIds(edges: Map<string, string>): Set<string> {
  const cyclic = new Set<string>();
  for (const start of edges.keys()) {
    const seen = new Set<string>();
    let current: string | undefined = start;
    while (current !== undefined) {
      if (seen.has(current)) {
        if (current === start) cyclic.add(start);
        break;
      }
      seen.add(current);
      current = edges.get(current);
    }
  }
  return cyclic;
}

/**
 * Every entry that (transitively) reads its input from `entryId`'s result — used to keep the
 * "reference" dropdown from ever letting the user create a cycle in the first place.
 */
export function getDependents(entryId: string, entries: ChainableEntry[]): Set<string> {
  const edges = buildReferenceGraph(entries);
  const dependents = new Set<string>();
  let frontier = [entryId];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const [from, to] of edges) {
      if (frontier.includes(to) && !dependents.has(from)) {
        dependents.add(from);
        next.push(from);
      }
    }
    frontier = next;
  }
  return dependents;
}

/**
 * Resolves every entry's chainable input to the literal string that should actually drive its
 * request: a typed value is always ready immediately, a reference is ready once the referenced
 * operation has produced a result, and stays pending/missing/cycle otherwise. `results` holds the
 * latest computed value per entry id (null while it has none yet, e.g. still loading or errored).
 */
export function resolveOperationInputs(
  entries: ChainableEntry[],
  results: Record<string, string | null>,
): Record<string, ResolvedInput> {
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
  const edges = buildReferenceGraph(entries);
  const cyclicIds = findCyclicIds(edges);

  const resolved: Record<string, ResolvedInput> = {};
  for (const entry of entries) {
    const source = getInputSource(entry.fields);

    if (source.type === 'literal') {
      resolved[entry.id] = { status: 'ready', value: source.value };
      continue;
    }

    if (cyclicIds.has(entry.id)) {
      resolved[entry.id] = { status: 'cycle' };
      continue;
    }

    const target = entriesById.get(source.operationId);
    if (!target || !target.confirmed) {
      resolved[entry.id] = { status: 'missing' };
      continue;
    }

    const value = results[source.operationId];
    resolved[entry.id] = value == null ? { status: 'pending' } : { status: 'ready', value };
  }
  return resolved;
}
