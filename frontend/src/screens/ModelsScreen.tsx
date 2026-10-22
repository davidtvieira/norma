import { BackButton } from '../components/BackButton/BackButton';
import { AppFooter } from '../components/AppFooter/AppFooter';
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle';
import type { Theme } from '../hooks/useTheme';

interface ModelsScreenProps {
  theme: Theme;
  onToggleTheme: () => void;
  onBack: () => void;
  onGoHome: () => void;
}

/**
 * "Explorar os meus modelos Norma" (`/modelos`), reached from the landing screen's browse button.
 * For now only an empty placeholder container, to be populated later.
 */
export function ModelsScreen({ theme, onToggleTheme, onBack, onGoHome }: ModelsScreenProps) {
  return (
    <div className="app app--landing">
      <header className="app__topbar app__topbar--with-title">
        <BackButton onClick={onBack} />
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </header>

      <div className="app__models-body">
        <div className="app__models-container" />
      </div>

      <AppFooter onGoHome={onGoHome} />
    </div>
  );
}
