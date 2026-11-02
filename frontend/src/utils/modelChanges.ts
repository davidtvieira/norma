import type { SerializableEntry } from './modelSerialization';

/** The model as it was when last opened or saved — what the editor's changes are measured against. */
export interface ModelBaseline {
  nrmName: string;
  entries: SerializableEntry[];
  inputIds: string[];
  outputIds: string[];
}

export interface ModelChange {
  kind: 'added' | 'removed' | 'changed';
  /** What changed: an operation's name, or "Nome da norma", "Inputs", "Outputs". */
  subject: string;
  /** One line per detail (a field that changed, a rename, a move in the order). */
  details: string[];
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function nameOf(entries: SerializableEntry[], id: string): string {
  return entries.find((entry) => entry.id === id)?.name.trim() || id;
}

/** The differences between the baseline and what is in the editor now — drafts (unconfirmed operations) aren't part of the model, so they never count. */
export function diffModel(baseline: ModelBaseline, current: ModelBaseline): ModelChange[] {
  const changes: ModelChange[] = [];
  if (baseline.nrmName.trim() !== current.nrmName.trim()) {
    changes.push({ kind: 'changed', subject: 'Nome da norma', details: [`"${baseline.nrmName.trim()}" → "${current.nrmName.trim()}"`] });
  }

  const before = baseline.entries.filter((entry) => entry.confirmed);
  const after = current.entries.filter((entry) => entry.confirmed);
  for (const entry of after) {
    const old = before.find((candidate) => candidate.id === entry.id);
    if (!old) {
      changes.push({ kind: 'added', subject: entry.name, details: [] });
      continue;
    }
    const details: string[] = [];
    if (old.name !== entry.name) details.push(`Nome: "${old.name}" → "${entry.name}"`);
    const keys = new Set([...Object.keys(old.fields), ...Object.keys(entry.fields)]);
    for (const key of keys) {
      if (!same(old.fields[key], entry.fields[key])) details.push(`Campo "${key}" alterado`);
    }
    if (details.length > 0) changes.push({ kind: 'changed', subject: entry.name, details });
  }
  for (const old of before) {
    if (!after.some((entry) => entry.id === old.id)) changes.push({ kind: 'removed', subject: old.name, details: [] });
  }

  for (const [label, was, now] of [
    ['Inputs', baseline.inputIds, current.inputIds],
    ['Outputs', baseline.outputIds, current.outputIds],
  ] as const) {
    if (same(was, now)) continue;
    const details: string[] = [];
    for (const id of now) if (!was.includes(id)) details.push(`+ ${nameOf(after, id)}`);
    for (const id of was) if (!now.includes(id)) details.push(`− ${nameOf(before, id)}`);
    if (details.length === 0) details.push('Ordem alterada');
    changes.push({ kind: 'changed', subject: label, details });
  }
  return changes;
}
