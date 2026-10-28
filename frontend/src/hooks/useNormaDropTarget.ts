import { useState } from 'react';
import type { DragEvent } from 'react';
import { NORMA_DRAG_TYPE } from '../utils/normaDrag';

/**
 * Makes an element a place a norma card can be dropped on: spread `props` on it, and `isOver` says a norma is
 * being dragged over it right now. `onDrop` gets the dragged norma's id. Anything else dragged over is ignored.
 */
export function useNormaDropTarget(onDrop: (normaId: string) => void) {
  const [isOver, setIsOver] = useState(false);

  function accepts(event: DragEvent): boolean {
    return event.dataTransfer.types.includes(NORMA_DRAG_TYPE);
  }

  const props = {
    onDragEnter(event: DragEvent) {
      if (!accepts(event)) return;
      event.preventDefault();
      setIsOver(true);
    },
    onDragOver(event: DragEvent) {
      if (!accepts(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    },
    onDragLeave(event: DragEvent) {
      // Moving onto one of its own children is not leaving.
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsOver(false);
    },
    onDrop(event: DragEvent) {
      if (!accepts(event)) return;
      event.preventDefault();
      setIsOver(false);
      const id = event.dataTransfer.getData(NORMA_DRAG_TYPE);
      if (id) onDrop(id);
    },
  };

  return { isOver, props };
}
