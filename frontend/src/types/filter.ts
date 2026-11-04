/** One condition: a single comparison against a value, or a numeric range. */
export type FilterMode = 'single' | 'range';

export type FilterOperator = 'eq' | 'ne' | 'contains' | 'startsWith' | 'endsWith' | 'gt' | 'gte' | 'lt' | 'lte';

export interface FilterRequestPayload {
  mode: FilterMode;
  /** Single mode only. */
  operator?: FilterOperator;
  /** Single mode only: what the inputs are compared with. */
  value?: string;
  /** Range mode only: the limits (both inclusive); blank for no limit. */
  min?: string;
  max?: string;
  /** Every value to check, in order. */
  values: string[];
}

export interface FilterResponsePayload {
  /** Only the inputs that meet the condition, unchanged and in order (possibly none). */
  values: string[];
  /** For each of those, the position of the input it came from. */
  sources: number[];
}
