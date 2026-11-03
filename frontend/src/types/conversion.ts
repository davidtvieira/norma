/** What happened to one saved norma in the one-off conversion (mirrors the backend's ConversionReport). TEMPORARY. */
export interface ConversionReportPayload {
  id: string;
  name: string;
  /** `converted`: verified and saved; `verified`: a dry run that would convert; `unchanged`: nothing to convert; `failed`: left as it was. */
  status: 'converted' | 'verified' | 'unchanged' | 'failed';
  counters: number;
  calcs: number;
  formatters: number;
  pages: number;
  iterations: number;
  /** Whether the version of the norma's info and model was dropped. */
  version: boolean;
  cases: number;
  problems: string[];
}
