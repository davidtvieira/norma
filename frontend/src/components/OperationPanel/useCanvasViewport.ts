import { useLayoutEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, WheelEvent as ReactWheelEvent } from 'react';

/** A node's position on the canvas surface, in canvas-local pixels (unaffected by panning). */
export interface NodePosition {
  x: number;
  y: number;
}

/** Just enough of an operation entry for marquee hit-testing — kept minimal so this module has
 * no dependency on OperationPanel's own entry shape. */
export interface CanvasEntry {
  id: string;
  confirmed: boolean;
}

/** An in-progress canvas pan (dragging empty canvas background) or node drag: the pointer
 * position where the drag started, and the position being dragged from at that point. */
interface DragState {
  id: string | null;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

/** The pointer position (in screen/client pixels, not canvas-local ones — see the marquee-drag
 * effect below) a select-mode marquee drag started at — stable for the whole drag, same as
 * DragState above; only its endpoint moves, tracked separately in MarqueeRect so the drag's own
 * effect doesn't need to re-subscribe on every pointer move. */
interface MarqueeStart {
  x: number;
  y: number;
}

/** The marquee's current on-screen box, recomputed from MarqueeStart and the latest pointer
 * position on every move — purely for drawing the selection rectangle; the hit-test against nodes
 * only happens once, on mouseup (see the effect below). */
export interface MarqueeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** How far the canvas can be zoomed out/in, and the multiplicative step each zoom-in/zoom-out
 * click (or wheel notch — see handleViewportWheel) applies. Multiplicative rather than additive so
 * repeated clicks feel like a consistent proportional change at any zoom level, not a fixed pixel
 * amount that feels huge when zoomed out and tiny when zoomed in. */
export const MIN_ZOOM = 0.4;
export const MAX_ZOOM = 2;
export const ZOOM_STEP = 1.2;

/** A node "drag" that barely moved (in screen pixels) is really a click, not a reposition. */
const CLICK_DISTANCE_THRESHOLD = 4;

interface UseCanvasViewportOptions {
  /** Every node currently on the canvas — read only for the marquee's own mouseup hit-test
   * (against each entry's actual on-screen DOM box, via nodeRefs), same as before this was its
   * own hook. */
  entries: CanvasEntry[];
  /** A node was dragged to a new canvas-local position — the caller applies it (e.g. setEntries). */
  onDragEntry: (id: string, position: NodePosition) => void;
  /** A node was clicked rather than dragged (movement stayed under the threshold) — what that
   * means (toggle selection vs. open a detail modal) is the caller's call, not this hook's; it
   * depends on which tool is active, which this hook has no notion of. */
  onNodeClick: (id: string) => void;
  /** A marquee drag ended — every node whose on-screen box overlapped it, replacing whatever
   * selection the caller was tracking (an empty array for a marquee that hit nothing). */
  onMarqueeSelect: (ids: string[]) => void;
}

/**
 * The operation canvas' pan/zoom/marquee-select/node-drag mechanics — deliberately with zero
 * knowledge of what a "node" represents beyond its id and on-screen box: dragging a node reports
 * its new position via onDragEntry rather than writing to any entry list itself, and a marquee
 * reports which ids it hit via onMarqueeSelect rather than owning a selection of its own (that's
 * OperationPanel's, since what "selected" means — the copy/delete selection bar — is a business
 * concept this hook has no business owning). Split out of OperationPanel, which used to hold all
 * of this directly, so its own state is just the operation-editing concerns the canvas mechanics
 * don't need to know about either.
 */
export function useCanvasViewport({ entries, onDragEntry, onNodeClick, onMarqueeSelect }: UseCanvasViewportOptions) {
  // The canvas' pan offset (dragging empty background) and, independently, a node being dragged
  // — see the window-level listener effect below. Both are plain pointer-delta math, no library.
  const [viewOffset, setViewOffset] = useState<NodePosition>({ x: 0, y: 0 });
  const [pan, setPan] = useState<DragState | null>(null);
  const [dragNode, setDragNode] = useState<DragState | null>(null);
  // The canvas' zoom level, 1 = 100% — applied to the same surface viewOffset already pans (see
  // zoomBy and the transform in OperationPanel's own JSX), so panning and zooming compose
  // naturally instead of needing two separate transformed layers.
  const [zoom, setZoom] = useState(1);

  const [marqueeStart, setMarqueeStart] = useState<MarqueeStart | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  // Each rendered node's DOM element, keyed by entry id — read only on marquee mouseup, to hit-test
  // its actual on-screen box (including however tall its live result/body currently renders) against
  // the marquee rectangle. A stale entry for a since-deleted id is harmless — nothing looks it up
  // again once its own key is gone from `entries`.
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  // Each node's stacking order, keyed by entry id — bumped (see bringToFront) whenever a node is
  // dragged, clicked into, or expanded, so it renders above every other node instead of staying
  // stuck under whichever ones happen to come later in the entry list (plain DOM order otherwise).
  // Absent entries fall back to CSS's implicit stacking (DOM order), so a node never needs
  // touching here until it's actually interacted with.
  const [nodeZIndex, setNodeZIndex] = useState<Record<string, number>>({});
  const nodeZIndexCounter = useRef(0);

  // Callback props are re-created every render by OperationPanel (e.g. onNodeClick closes over
  // `tool`, which changes independently of pan/dragNode/marqueeStart) — refs keep the window
  // listener effects below able to depend on just [pan, dragNode] / [marqueeStart] (their own
  // start/end signals, never touched mid-drag) while still always calling the latest callback,
  // instead of forcing a re-subscribe (and the timing hazards that come with it) on every render.
  const onDragEntryRef = useRef(onDragEntry);
  onDragEntryRef.current = onDragEntry;
  const onNodeClickRef = useRef(onNodeClick);
  onNodeClickRef.current = onNodeClick;
  const onMarqueeSelectRef = useRef(onMarqueeSelect);
  onMarqueeSelectRef.current = onMarqueeSelect;

  function bringToFront(id: string) {
    nodeZIndexCounter.current += 1;
    setNodeZIndex((current) => ({ ...current, [id]: nodeZIndexCounter.current }));
  }

  // Drives both canvas panning and node dragging: a single pointer-move/up listener registered
  // only while one of the two is active, so a release outside the canvas still ends the drag
  // instead of leaving it stuck.
  useLayoutEffect(() => {
    if (!pan && !dragNode) return;

    function handleMouseMove(event: globalThis.MouseEvent) {
      if (pan) {
        setViewOffset({ x: pan.originX + (event.clientX - pan.startX), y: pan.originY + (event.clientY - pan.startY) });
      }
      if (dragNode) {
        // Node positions live in the surface's own pre-zoom coordinate space (see the transform
        // in OperationPanel's JSX) while the pointer delta is measured in real screen pixels —
        // dividing by zoom converts the latter into the former, so a node tracks the cursor 1:1
        // on screen at any zoom level instead of drifting faster than the cursor while zoomed in
        // (or slower while zoomed out). Uses whatever zoom was active when this drag started —
        // changing zoom mid-drag (e.g. via the wheel) isn't accounted for.
        onDragEntryRef.current(dragNode.id!, {
          x: dragNode.originX + (event.clientX - dragNode.startX) / zoom,
          y: dragNode.originY + (event.clientY - dragNode.startY) / zoom,
        });
      }
    }

    function handleMouseUp(event: globalThis.MouseEvent) {
      // A node "drag" that barely moved is really a click — reported via onNodeClick, whose
      // caller decides what that means (toggle selection vs. open a detail modal) depending on
      // which tool is active, a business concern this hook has no notion of. A real drag (past
      // the threshold) never reports a click.
      if (dragNode?.id) {
        const movedDistance = Math.hypot(event.clientX - dragNode.startX, event.clientY - dragNode.startY);
        if (movedDistance < CLICK_DISTANCE_THRESHOLD) {
          onNodeClickRef.current(dragNode.id);
        }
      }
      setPan(null);
      setDragNode(null);
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    // pan/dragNode only ever change at the start (mousedown) and end (mouseup) of a drag, never
    // mid-drag — safe to depend on just these two.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pan, dragNode]);

  // The marquee-select counterpart of the pan/node-drag effect above, kept separate since it
  // drives its own bit of state (the marquee rectangle) instead of viewOffset/node positions —
  // same shape otherwise: marqueeStart is set once on mousedown and cleared on mouseup, never
  // touched mid-drag, so depending on just it (not the constantly-updating marqueeRect) is safe,
  // same reasoning as pan/dragNode above.
  useLayoutEffect(() => {
    if (!marqueeStart) return;

    function handleMouseMove(event: globalThis.MouseEvent) {
      setMarqueeRect({
        left: Math.min(marqueeStart!.x, event.clientX),
        top: Math.min(marqueeStart!.y, event.clientY),
        width: Math.abs(event.clientX - marqueeStart!.x),
        height: Math.abs(event.clientY - marqueeStart!.y),
      });
    }

    function handleMouseUp(event: globalThis.MouseEvent) {
      const left = Math.min(marqueeStart!.x, event.clientX);
      const right = Math.max(marqueeStart!.x, event.clientX);
      const top = Math.min(marqueeStart!.y, event.clientY);
      const bottom = Math.max(marqueeStart!.y, event.clientY);

      // Any confirmed node whose on-screen box (read straight off the DOM, so it reflects
      // whatever it's actually rendering right now — a longer result, an expanded field, ...)
      // overlaps the dragged rectangle at all becomes the new selection, replacing whatever was
      // selected before. A plain click (no real drag) hits nothing and clears the selection.
      const hits = entries
        .filter((entry) => entry.confirmed)
        .filter((entry) => {
          const el = nodeRefs.current[entry.id];
          if (!el) return false;
          const box = el.getBoundingClientRect();
          return box.left < right && box.right > left && box.top < bottom && box.bottom > top;
        })
        .map((entry) => entry.id);
      onMarqueeSelectRef.current(hits);
      setMarqueeStart(null);
      setMarqueeRect(null);
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marqueeStart]);

  function startPan(event: ReactMouseEvent<HTMLDivElement>) {
    // Only ever reaches here for a mousedown on empty canvas background — a node's own
    // mousedown handler (see startNodeDrag) stops propagation before it would bubble up here.
    event.preventDefault();
    setPan({ id: null, startX: event.clientX, startY: event.clientY, originX: viewOffset.x, originY: viewOffset.y });
  }

  function startMarquee(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    setMarqueeStart({ x: event.clientX, y: event.clientY });
    setMarqueeRect({ left: event.clientX, top: event.clientY, width: 0, height: 0 });
  }

  // Zooms toward/away from a focal point (in screen coordinates — the cursor for a wheel notch,
  // or the viewport's own center for a toolbar +/− click, which has no cursor position of its own
  // to zoom around) while keeping whatever's currently under that point visually still, the same
  // way most other canvas/map tools zoom: solved by picking a new viewOffset such that the
  // surface-local point the focal point currently maps to (given the old zoom/viewOffset) still
  // maps to that exact same screen position under the new zoom.
  function zoomBy(factor: number, focal?: { clientX: number; clientY: number }) {
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
    if (nextZoom === zoom) return;

    const viewportBox = viewportRef.current?.getBoundingClientRect();
    if (viewportBox) {
      const focalX = (focal?.clientX ?? viewportBox.left + viewportBox.width / 2) - viewportBox.left;
      const focalY = (focal?.clientY ?? viewportBox.top + viewportBox.height / 2) - viewportBox.top;
      setViewOffset({
        x: focalX - (nextZoom / zoom) * (focalX - viewOffset.x),
        y: focalY - (nextZoom / zoom) * (focalY - viewOffset.y),
      });
    }
    setZoom(nextZoom);
  }

  // Ctrl/Cmd+wheel (a trackpad pinch is reported as this by the browser) zooms the canvas around
  // the cursor; a plain wheel is left alone (does nothing — the viewport has nothing to scroll,
  // and reserving plain wheel for zoom too would make it too easy to zoom by accident while just
  // moving the mouse across the canvas with a scroll wheel resting under the cursor).
  function handleViewportWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, { clientX: event.clientX, clientY: event.clientY });
  }

  function startNodeDrag(id: string, position: NodePosition) {
    return (event: ReactMouseEvent<HTMLDivElement>) => {
      // Bring the node to front on any interaction with it — dragging, clicking a control inside
      // it, or selecting it — so it's never left rendered underneath other nodes it overlaps
      // (plain DOM order otherwise, since a node itself sets no z-index).
      bringToFront(id);
      // Let a form control inside the node (a text input, a select, a button, ...) handle its own
      // click/focus instead of hijacking it into a node drag — preventDefault on mousedown
      // suppresses the browser's default "focus this element" behavior, which made it impossible
      // to click into a text field and type. Still stopPropagation so the click doesn't also
      // bubble up and start a canvas pan.
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, button')) {
        event.stopPropagation();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setDragNode({ id, startX: event.clientX, startY: event.clientY, originX: position.x, originY: position.y });
    };
  }

  return {
    viewOffset,
    zoom,
    pan,
    dragNode,
    marqueeRect,
    viewportRef,
    nodeRefs,
    nodeZIndex,
    bringToFront,
    startPan,
    startMarquee,
    startNodeDrag,
    zoomBy,
    handleViewportWheel,
  };
}
