/** What happened to one saved norma in the one-off conversion (mirrors the backend's ConversionReport). TEMPORARY. */
export interface ConversionReportPayload {
  id: string;
  name: string;
  /** `converted`: verified and saved; `verified`: a dry run that would convert; `unchanged`: nothing to convert; `failed`: left as it was. */
  status: 'converted' | 'verified' | 'unchanged' | 'failed';
  counters: number;
  calcs: number;
  formatters: number;
  cases: number;
  problems: string[];
}
