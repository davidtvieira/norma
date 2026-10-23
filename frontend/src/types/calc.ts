export type CalcOperation = 'add' | 'subtract' | 'multiply' | 'divide';

/** How the result is formatted: as is, rounded to an integer, or its absolute value. */
export type CalcFormat = 'none' | 'round' | 'abs';

export interface CalcRequestPayload {
  a: string;
  b: string;
  operation: CalcOperation;
  format: CalcFormat;
}

export interface CalcResponsePayload {
  value: number;
}
