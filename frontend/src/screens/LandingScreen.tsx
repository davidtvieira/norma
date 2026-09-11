import { DatasetUploader } from '../components/DatasetUploader/DatasetUploader';
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle';
import type { DatasetImportResponse } from '../types/dataset';
import type { Theme } from '../hooks/useTheme';

interface LandingScreenProps {
  theme: Theme;
  onToggleTheme: () => void;
  onImportSuccess: (dataset: DatasetImportResponse) => void;
}

/** The very first screen: nothing imported yet, just the upload control. */
export function LandingScreen({ theme, onToggleTheme, onImportSuccess }: LandingScreenProps) {
  return (
    <div className="app app--landing">
      <header className="app__topbar">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </header>

      <div className="app__landing-body">
        <div className="app__landing-left">
          <p className="app__intro">Importe um ficheiro de dados para começar a criar um modelo inteligente.</p>
        </div>
        <div className="app__landing-right">
          <div className="app__landing-content">
            <DatasetUploader onImportSuccess={onImportSuccess} />
          </div>
        </div>
      </div>

      <footer className="app__footer">
        <h1 className="app__brand">Norma</h1>
      </footer>
    </div>
  );
}
