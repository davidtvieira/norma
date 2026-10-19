import './AppFooter.css';

interface AppFooterProps {
  /** Resets the whole app back to the landing screen (see App.tsx's goHome) — same place a fresh
   * page load starts from, dataset/model/editor state included. */
  onGoHome: () => void;
}

/** The "Norma" brand mark shown at the bottom of every screen, flanked by a line on each side
 * running the full width — clicking it is this app's only always-available way back to the very
 * start, regardless of how deep the current screen is (editor, utilize, choose-model). */
export function AppFooter({ onGoHome }: AppFooterProps) {
  return (
    <footer className="app__footer">
      <button type="button" className="app__brand app__brand--link" onClick={onGoHome}>
        Norma
      </button>
    </footer>
  );
}
