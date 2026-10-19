/**
 * A tiny pub/sub for API failures, so services/datasetApi.ts can report every failed request in
 * one place and the UI (components/ToastHost) can show it, without each caller of an API function
 * having to wire up its own toast. Callers still get the error thrown as before — this only adds
 * a second, visible channel for it.
 */
/**
 * What services/datasetApi.ts throws for a failed request. By the time one is thrown it has
 * already been reported to the toasts (see reportApiError), so callers must not show its message
 * a second time on screen — see inlineErrorMessage.
 */
export class ApiError extends Error {}

/**
 * The text a caller should show inline for a caught error: nothing ('') for an ApiError, since
 * its toast already says it, otherwise the error's own message (or `fallback`) — for the local,
 * non-API failures (a malformed model file, a wrong extension...) that never reach the toasts.
 */
export function inlineErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return '';
  return error instanceof Error ? error.message : fallback;
}

export interface ApiErrorReport {
  /** Portuguese summary of what failed, e.g. "Falha ao procurar o valor". */
  title: string;
  /** The server's own message, when it sent one — omitted where it adds nothing for the user. */
  detail?: string;
}

type Listener = (report: ApiErrorReport) => void;

const listeners = new Set<Listener>();

export function subscribeApiErrors(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function reportApiError(report: ApiErrorReport): void {
  listeners.forEach((listener) => listener(report));
}
