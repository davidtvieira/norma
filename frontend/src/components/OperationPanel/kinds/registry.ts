import type { OperationKind } from '../operationKind';
import { counterKind } from './counterKind';
import { findKind } from './findKind';
import { lookupKind } from './lookupKind';
import { nodeKind } from './nodeKind';
import { sumKind } from './sumKind';
import { translatorKind } from './translatorKind';

/**
 * The single place new operation kinds get registered — both OperationPanel (editing) and
 * ModelCard (utilizing an imported model) key off this instead of each hardcoding the list.
 */
export const KINDS: OperationKind[] = [lookupKind, sumKind, counterKind, nodeKind, findKind, translatorKind];
export const KINDS_BY_ID: Record<string, OperationKind> = Object.fromEntries(KINDS.map((kind) => [kind.id, kind]));
/** The operation kind ids known to the app — used to validate an imported model. */
export const OPERATION_KIND_IDS = new Set(KINDS.map((kind) => kind.id));
