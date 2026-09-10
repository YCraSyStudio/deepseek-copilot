import { useCallback, useRef, useState, type PointerEvent, type RefObject } from "react";

/** Pointer distance, in pixels, that turns a click into a drag. */
const DRAG_THRESHOLD_PX = 3;

/** Pointer handlers that pan a scrollable lightbox viewport by dragging it. */
export interface ImagePan {
  isPanning: boolean;
  handlers: {
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
  };
  /** Whether the interaction that just finished moved the image. */
  didDrag: () => boolean;
}

interface DragState {
  pointerId: number;
  x: number;
  y: number;
  left: number;
  top: number;
}

/**
 * Drag-to-pan for the image lightbox: pressing on the image and moving the mouse
 * scrolls the viewport, so a zoomed image can be explored without hunting for the
 * scrollbars. Touch pointers are left alone because they already scroll natively,
 * and a drag that moved anything is reported so the click that follows does not
 * close the viewer.
 */
export function useImagePan(viewportRef: RefObject<HTMLDivElement | null>): ImagePan {
  const drag = useRef<DragState | null>(null);
  const moved = useRef(false);
  const [isPanning, setIsPanning] = useState(false);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      moved.current = false;
      if (event.button !== 0 || event.pointerType === "touch") {return;}
      const viewport = viewportRef.current;
      if (!viewport || !isScrollable(viewport)) {return;}
      drag.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: viewport.scrollLeft,
        top: viewport.scrollTop,
      };
      setIsPanning(true);
      event.currentTarget.setPointerCapture(event.pointerId);
      // Keeps the drag from selecting text or starting a native image drag.
      event.preventDefault();
    },
    [viewportRef],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const state = drag.current;
      const viewport = viewportRef.current;
      if (!state || !viewport || event.pointerId !== state.pointerId) {return;}
      const deltaX = event.clientX - state.x;
      const deltaY = event.clientY - state.y;
      if (!moved.current && Math.abs(deltaX) + Math.abs(deltaY) < DRAG_THRESHOLD_PX) {return;}
      moved.current = true;
      viewport.scrollLeft = state.left - deltaX;
      viewport.scrollTop = state.top - deltaY;
    },
    [viewportRef],
  );

  const endDrag = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const state = drag.current;
      if (!state || event.pointerId !== state.pointerId) {return;}
      drag.current = null;
      setIsPanning(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [],
  );

  return {
    isPanning,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
    didDrag: () => moved.current,
  };
}

function isScrollable(element: HTMLElement): boolean {
  return element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight;
}
