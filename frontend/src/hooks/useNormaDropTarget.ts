import { useState } from 'react';
import type { DragEvent } from 'react';
import { FOLDER_DRAG_TYPE, NORMA_DRAG_TYPE } from '../utils/normaDrag';

/**
 * Makes an element a place a norma card can be dropped on: spread `props` on it, and `isOver` says a norma is
 * being dragged over it right now. `onDrop` gets the dragged norma's id. With `onDropFolder` it takes a dragged
 * folder too (its id). Anything else dragged over is ignored.
 */
export function useNormaDropTarget(onDrop: (normaId: string) => void, onDropFolder?: (folderId: string) => void) {
  const [isOver, setIsOver] = useState(false);

  function accepts(event: DragEvent): boolean {
    const types = event.dataTransfer.types;
    return types.includes(NORMA_DRAG_TYPE) || (onDropFolder !== undefined && types.includes(FOLDER_DRAG_TYPE));
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
      const normaId = event.dataTransfer.getData(NORMA_DRAG_TYPE);
      if (normaId) {
        onDrop(normaId);
        return;
      }
      const folderId = event.dataTransfer.getData(FOLDER_DRAG_TYPE);
      if (folderId && onDropFolder) onDropFolder(folderId);
    },
  };

  return { isOver, props };
}
