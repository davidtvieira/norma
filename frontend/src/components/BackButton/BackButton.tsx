import './BackButton.css';

interface BackButtonProps {
  onClick: () => void;
}

/** The "← Voltar" button every screen's navbar uses to go one step back. */
export function BackButton({ onClick }: BackButtonProps) {
  return (
    <button type="button" className="back-button" onClick={onClick}>
      ← Voltar
    </button>
  );
}
