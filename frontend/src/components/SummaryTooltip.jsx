import { useLayoutEffect, useRef, useState } from "react";

/* ============================================================
   HOVER TOOLTIP

   A lightweight readout that appears next to the cell being
   hovered, aligned to that row instead of floating in a fixed
   spot. It fades in and out so moving down the column feels
   continuous rather than flicking between panels.
============================================================ */

const TOOLTIP_WIDTH = 300;
const TOOLTIP_GAP = 10;
const VIEWPORT_MARGIN = 12;

/*
  Sits beside the hovered cell: to its right when there is room,
  otherwise to its left, and always vertically centred on the row.
*/
function getTooltipPosition(rect, height) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  if (!rect) {
    return {
      top: Math.max(VIEWPORT_MARGIN, (viewportHeight - height) / 2),
      left: Math.max(VIEWPORT_MARGIN, (viewportWidth - TOOLTIP_WIDTH) / 2),
    };
  }

  const rowCenter = rect.top + rect.height / 2;

  let left = rect.right + TOOLTIP_GAP;

  if (left + TOOLTIP_WIDTH > viewportWidth - VIEWPORT_MARGIN) {
    const alternative = rect.left - TOOLTIP_WIDTH - TOOLTIP_GAP;

    left =
      alternative >= VIEWPORT_MARGIN
        ? alternative
        : Math.max(
            VIEWPORT_MARGIN,
            viewportWidth - TOOLTIP_WIDTH - VIEWPORT_MARGIN,
          );
  }

  const top = Math.min(
    Math.max(VIEWPORT_MARGIN, rowCenter - height / 2),
    Math.max(VIEWPORT_MARGIN, viewportHeight - height - VIEWPORT_MARGIN),
  );

  return { top, left };
}

export default function SummaryTooltip({ hover, visible, children }) {
  const panelRef = useRef(null);

  const [position, setPosition] = useState(null);

  useLayoutEffect(() => {
    if (!hover) {
      setPosition(null);
      return;
    }

    const height = panelRef.current?.offsetHeight || 200;

    const next = getTooltipPosition(hover.rect, height);

    /*
      `hover` is a fresh object on every render, so the position is
      only committed when it actually moves. Without this guard the
      state update would re-trigger this effect forever.
    */
    setPosition((current) => {
      if (current && current.top === next.top && current.left === next.left) {
        return current;
      }

      return next;
    });
  }, [hover]);

  if (!hover) return null;

  return (
    <div
      ref={panelRef}
      role="tooltip"
      style={{
        top: position?.top ?? "-9999px",
        left: position?.left ?? "-9999px",
        width: TOOLTIP_WIDTH,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(4px)",
        transition: "opacity 140ms ease-out, transform 140ms ease-out",
        willChange: visible ? "opacity, transform" : undefined,
      }}
      className="
        pointer-events-none fixed z-[80]
        rounded-xl border border-white/[0.09]
        bg-[#14181d]
        px-4 py-3
        shadow-[0_24px_60px_-14px_rgba(0,0,0,0.9)]
      "
    >
      {children}
    </div>
  );
}