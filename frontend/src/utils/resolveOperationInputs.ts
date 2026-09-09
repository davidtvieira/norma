import { getInputSources, type ValueSource } from '../types/valueSource';

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

/**
 * entryId -> every operationId it references — usually at most one (a kind with a single
 * chainable "input", e.g. lookup), but a kind with several (counter's "inputs" list) can have
 * more than one, so this is a multi-edge graph rather than a single successor per node.
 */
function buildReferenceGraph(entries: ChainableEntry[]): Map<string, string[]> {
  const edges = new Map<string, string[]>();
  for (const entry of entries) {
    const refs = getInputSources(entry.fields)
      .filter((source) => source.type === 'reference')
      .map((source) => source.operationId);
    edges.set(entry.id, refs);
  }
  return edges;
}

/**
 * Ids of every entry that sits on a reference cycle (directly or transitively
 * self-referencing), found via a DFS walk (coloring each node visiting/done) rather than chasing
 * a single successor per node, since a node can now have more than one outgoing edge.
 */
function findCyclicIds(edges: Map<string, string[]>): Set<string> {
  const cyclic = new Set<string>();
  const done = new Map<string, boolean>(); // absent = untouched, false = visiting, true = done
  const stack: string[] = [];

  function visit(node: string): void {
    done.set(node, false);
    stack.push(node);
    for (const next of edges.get(node) ?? []) {
      const state = done.get(next);
      if (state === false) {
        const cycleStart = stack.indexOf(next);
        for (const id of stack.slice(cycleStart)) cyclic.add(id);
      } else if (state === undefined) {
        visit(next);
      }
    }
    stack.pop();
    done.set(node, true);
  }

  for (const start of edges.keys()) {
    if (!done.has(start)) visit(start);
  }
  return cyclic;
}

/**
 * Every entry that (transitively) reads any of its inputs from `entryId`'s result — used to keep
 * the "reference" dropdown from ever letting the user create a cycle in the first place.
 */
export function getDependents(entryId: string, entries: ChainableEntry[]): Set<string> {
  const edges = buildReferenceGraph(entries);
  const dependents = new Set<string>();
  let frontier = [entryId];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const [from, tos] of edges) {
      if (tos.some((to) => frontier.includes(to)) && !dependents.has(from)) {
        dependents.add(from);
        next.push(from);
      }
    }
    frontier = next;
  }
  return dependents;
}

function resolveSource(
  source: ValueSource,
  entriesById: Map<string, ChainableEntry>,
  results: Record<string, string | null>,
): ResolvedInput {
  if (source.type === 'literal') {
    return { status: 'ready', value: source.value };
  }

  const target = entriesById.get(source.operationId);
  if (!target || !target.confirmed) {
    return { status: 'missing' };
  }

  const value = results[source.operationId];
  return value == null ? { status: 'pending' } : { status: 'ready', value };
}

/**
 * Resolves every entry's chainable input(s) to the literal string that should actually drive its
 * request: a typed value is always ready immediately, a reference is ready once the referenced
 * operation has produced a result, and stays pending/missing/cycle otherwise. `results` holds the
 * latest computed value per entry id (null while it has none yet, e.g. still loading or errored).
 * Returned as an array per entry — one element for a single-input kind (e.g. lookup), several for
 * a kind like counter — in the same order as getInputSources(entry.fields).
 */
export function resolveOperationInputs(
  entries: ChainableEntry[],
  results: Record<string, string | null>,
): Record<string, ResolvedInput[]> {
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
  const edges = buildReferenceGraph(entries);
  const cyclicIds = findCyclicIds(edges);

  const resolved: Record<string, ResolvedInput[]> = {};
  for (const entry of entries) {
    // An entry itself sitting on a cycle (any of its inputs looping back to itself) makes every
    // one of its inputs report 'cycle', not just the one(s) that actually close the loop —
    // there's nothing meaningful left to compute for it either way.
    if (cyclicIds.has(entry.id)) {
      resolved[entry.id] = getInputSources(entry.fields).map(() => ({ status: 'cycle' }));
      continue;
    }
    resolved[entry.id] = getInputSources(entry.fields).map((source) => resolveSource(source, entriesById, results));
  }
  return resolved;
}
