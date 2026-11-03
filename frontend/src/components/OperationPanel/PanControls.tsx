import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon, MoveIcon } from '../ButtonIcons/ButtonIcons';

/** How far one click moves the view, and how far each tick of a held button does. */
const CLICK_STEP = 120;
const HOLD_STEP = 28;
const HOLD_DELAY_MS = 350;
const HOLD_INTERVAL_MS = 30;

interface PanControlsProps {
  /** Moves the view: `dx`/`dy` is how far the canvas' content moves on screen. */
  onPan: (dx: number, dy: number) => void;
}

/**
 * Four arrow buttons in a cross, in a corner of the canvas, that move the view: a click steps it, and holding one keeps
 * it moving. For anyone without a middle button or an easy empty spot to drag from.
 */
export function PanControls({ onPan }: PanControlsProps) {
  const timers = useRef<{ delay?: number; interval?: number }>({});
  const latestPan = useRef(onPan);
  useEffect(() => {
    latestPan.current = onPan;
  });

  function stop() {
    window.clearTimeout(timers.current.delay);
    window.clearInterval(timers.current.interval);
    timers.current = {};
  }
  useEffect(() => stop, []);

  // `sx`/`sy` is which way the view goes (the content moves the opposite way on screen).
  function press(sx: number, sy: number) {
    stop();
    latestPan.current(-sx * CLICK_STEP, -sy * CLICK_STEP);
    timers.current.delay = window.setTimeout(() => {
      timers.current.interval = window.setInterval(() => latestPan.current(-sx * HOLD_STEP, -sy * HOLD_STEP), HOLD_INTERVAL_MS);
    }, HOLD_DELAY_MS);
  }

  function button(className: string, label: string, sx: number, sy: number, icon: ReactNode) {
    return (
      <button
        type="button"
        className={`operation-canvas__pan-button ${className}`}
        aria-label={label}
        title={label}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          press(sx, sy);
        }}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        // A key press steps once, like a click does.
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            latestPan.current(-sx * CLICK_STEP, -sy * CLICK_STEP);
          }
        }}
      >
        {icon}
      </button>
    );
  }

  return (
    <div className="operation-canvas__pan-controls">
      <span className="operation-canvas__pan-center" aria-hidden="true">
        <MoveIcon />
      </span>
      {button('operation-canvas__pan-button--up', 'Mover a vista para cima', 0, -1, <ChevronUpIcon />)}
      {button('operation-canvas__pan-button--left', 'Mover a vista para a esquerda', -1, 0, <ChevronLeftIcon />)}
      {button('operation-canvas__pan-button--right', 'Mover a vista para a direita', 1, 0, <ChevronRightIcon />)}
      {button('operation-canvas__pan-button--down', 'Mover a vista para baixo', 0, 1, <ChevronDownIcon />)}
    </div>
  );
}
