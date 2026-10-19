import './RecentSessionCard.css';

interface RecentSessionCardProps {
  datasetFileName: string;
  /** The session's .nrm name, when it has one — shown in place of the dataset's filename. Null
   * for a dataset-only entry (nothing to name yet), which shows the dataset's name instead. */
  nrmName: string | null;
  /** Whether the session has a model (a .nrm) or is only a dataset — drives the label under the name. */
  hasModel: boolean;
  isResuming: boolean;
  /** Only ever set on the one entry an actual resume attempt just failed on, for a local (non-API)
   * reason — an API failure is a toast instead, see services/apiErrors. */
  error: string | null;
  onResume: () => void;
}

/**
 * One tile in the landing screen's "Sessões recentes" row (see LandingScreen — up to 4, see
 * App.tsx's utils/sessionCache.ts-backed recentSessions state). Shows the session's name, with a label saying whether it's a model or a dataset, and
 * is itself the button that resumes it — a resume is a real backend re-upload the user hasn't
 * asked for until they click. There's no per-entry remove: the row's "Limpar tudo" is the only way
 * to clear them.
 */
export function RecentSessionCard({ datasetFileName, nrmName, hasModel, isResuming, error, onResume }: RecentSessionCardProps) {
  const name = nrmName ?? datasetFileName;
  return (
    <div className="recent-session-card">
      <button type="button" className="recent-session-card__button" onClick={onResume} disabled={isResuming} aria-busy={isResuming} title={name}>
        <span className="recent-session-card__name">{name}</span>
        <span className="recent-session-card__label">{hasModel ? 'Modelo (.nrm)' : 'Conjunto de dados'}</span>
      </button>
      {error && <p className="recent-session-card__error">{error}</p>}
    </div>
  );
}
