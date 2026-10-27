import { DiskIcon } from '../ButtonIcons/ButtonIcons';
import './RecentSessionCard.css';

interface RecentSessionCardProps {
  datasetFileName: string;
  /** The session's .nrm name, when it has one — shown in place of the dataset's filename. Null
   * for a dataset-only entry (nothing to name yet), which shows the dataset's name instead. */
  nrmName: string | null;
  /** Whether the session has a model (a .nrm) or is only a dataset — drives the label under the name. */
  hasModel: boolean;
  /** The model is also kept on the platform (in "As minhas normas"), not only in this browser. */
  isSaved: boolean;
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
 * asked for until they click. There's no remove: the cache keeps only the last few, and the oldest drops out.
 */
export function RecentSessionCard({ datasetFileName, nrmName, hasModel, isSaved, isResuming, error, onResume }: RecentSessionCardProps) {
  const name = nrmName ?? datasetFileName;
  return (
    <div className={`recent-session-card${isSaved ? ' recent-session-card--saved' : ''}`}>
      <button type="button" className="recent-session-card__button" onClick={onResume} disabled={isResuming} aria-busy={isResuming} title={name}>
        <span className="recent-session-card__name">{name}</span>
        <span className="recent-session-card__label">
          {isSaved && <DiskIcon className="recent-session-card__icon" />}
          {!hasModel ? 'Conjunto de dados' : isSaved ? 'Guardado na plataforma' : 'Não guardado na plataforma'}
        </span>
      </button>
      {error && <p className="recent-session-card__error">{error}</p>}
    </div>
  );
}
