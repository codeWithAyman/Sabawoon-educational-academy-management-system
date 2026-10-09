import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CalendarOff, Check, X } from "lucide-react";

/* ============================================================
   LEAVE COMMENT POPOVER

   Opened by double clicking a leave cell in the attendance
   register. It stays anchored next to that cell instead of
   taking over the screen, so the rest of the row stays visible
   while the reason is typed.

   The reason itself is saved with the register, so the comment
   travels with the attendance data rather than living in
   someone's head.
============================================================ */

const DIALOG_WIDTH = 340;
const DIALOG_GAP = 10;
const VIEWPORT_MARGIN = 12;

/*
  Anchors the popover to the cell that opened it: centred under the
  cell, flipped above it when there is no room below, and always kept
  inside the viewport.
*/
function getAnchoredPosition(rect, height) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  if (!rect) {
    return {
      top: Math.max(VIEWPORT_MARGIN, (viewportHeight - height) / 2),
      left: Math.max(VIEWPORT_MARGIN, (viewportWidth - DIALOG_WIDTH) / 2),
      placement: "center",
      arrowLeft: null,
    };
  }

  const cellCenter = rect.left + rect.width / 2;

  const left = Math.min(
    Math.max(VIEWPORT_MARGIN, cellCenter - DIALOG_WIDTH / 2),
    Math.max(VIEWPORT_MARGIN, viewportWidth - DIALOG_WIDTH - VIEWPORT_MARGIN),
  );

  let top = rect.bottom + DIALOG_GAP;
  let placement = "below";

  if (top + height > viewportHeight - VIEWPORT_MARGIN) {
    const above = rect.top - height - DIALOG_GAP;

    if (above >= VIEWPORT_MARGIN) {
      top = above;
      placement = "above";
    } else {
      top = Math.max(VIEWPORT_MARGIN, viewportHeight - height - VIEWPORT_MARGIN);
      placement = "center";
    }
  }

  const arrowLeft = Math.min(
    Math.max(16, cellCenter - left - 5),
    DIALOG_WIDTH - 16,
  );

  return { top, left, placement, arrowLeft };
}

export default function LeaveCommentDialog({
  dialog,
  text,
  onChange,
  onSave,
  onRemove,
  onCancel,
  disabled,
}) {
  const panelRef = useRef(null);

  const [position, setPosition] = useState(null);

  /*
    Measured after every change so the popover can flip above the
    cell when the reason text makes it too tall for the space below.
  */
  useLayoutEffect(() => {
    if (!dialog) {
      setPosition(null);
      return;
    }

    const height = panelRef.current?.offsetHeight || 260;

    setPosition(getAnchoredPosition(dialog.rect, height));
  }, [dialog, text]);

  useEffect(() => {
    if (!dialog) return;

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !disabled) {
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dialog, disabled, onCancel]);

  if (!dialog) return null;

  const trimmed = text.trim();

  return (
    <div
      className="fixed inset-0 z-[75] bg-black/40"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !disabled) {
          onCancel();
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Leave reason"
        style={{
          top: position?.top ?? "-9999px",
          left: position?.left ?? "-9999px",
          width: DIALOG_WIDTH,
          visibility: position ? "visible" : "hidden",
        }}
        className="
          fixed overflow-hidden rounded-xl
          border border-white/[0.09]
          bg-[#14181d]
          shadow-[0_24px_60px_-12px_rgba(0,0,0,0.95)]
        "
      >
        {position?.placement !== "center" && (
          <span
            style={{ left: position?.arrowLeft ?? 16 }}
            className={[
              "pointer-events-none absolute h-2.5 w-2.5 rotate-45",
              "border-white/[0.09] bg-[#14181d]",
              position?.placement === "above"
                ? "-bottom-[5px] border-r border-b"
                : "-top-[5px] border-l border-t",
            ].join(" ")}
          />
        )}

        <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-3.5 py-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-400">
            <CalendarOff size={13} />
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold leading-tight text-slate-200">
              {dialog.studentName}
            </p>

            <p className="mt-0.5 flex items-center gap-1.5 text-[9px] text-slate-500">
              <span className="rounded border border-amber-500/20 bg-amber-500/[0.08] px-1 py-px text-[8px] font-medium text-amber-400/90">
                Day {dialog.day}
              </span>

              <span>on leave</span>
            </p>
          </div>

          <button
            type="button"
            onClick={onCancel}
            disabled={disabled}
            aria-label="Close"
            className="shrink-0 rounded-md p-1 text-slate-600 transition hover:bg-white/5 hover:text-slate-300 disabled:opacity-50"
          >
            <X size={13} />
          </button>
        </div>

        <div className="px-3.5 py-3">
          <textarea
            id="leave-comment-input"
            autoFocus
            rows={3}
            maxLength={500}
            value={text}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                onSave();
              }
            }}
            disabled={disabled}
            placeholder="Sick, family emergency, travel..."
            className="
              w-full resize-none rounded-lg border border-white/[0.08]
              bg-[#0b0d10] px-2.5 py-2 text-[11px] leading-relaxed
              text-slate-200 outline-none transition
              placeholder:text-slate-700
              focus:border-amber-500/40 focus:ring-2 focus:ring-amber-500/[0.08]
              disabled:opacity-60
            "
          />

          <div className="mt-1.5 flex items-center justify-between text-[9px]">
            <span className="text-slate-700">Optional · Ctrl+Enter to save</span>

            <span className="tabular-nums text-slate-700">{text.length}/500</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] bg-black/20 px-3 py-2">
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled || !trimmed}
            className="
              rounded-md px-2 py-1 text-[10px] font-medium transition
              text-slate-600 hover:bg-red-500/[0.08] hover:text-red-400
              disabled:cursor-not-allowed disabled:opacity-40
              disabled:hover:bg-transparent disabled:hover:text-slate-600
            "
          >
            Clear
          </button>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onCancel}
              disabled={disabled}
              className="rounded-md px-2.5 py-1.5 text-[10px] font-medium text-slate-400 transition hover:bg-white/5 hover:text-slate-200 disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={onSave}
              disabled={disabled}
              className="
                inline-flex items-center gap-1 rounded-md
                bg-amber-500 px-2.5 py-1.5
                text-[10px] font-semibold text-black transition
                hover:bg-amber-400
                disabled:cursor-not-allowed disabled:opacity-50
              "
            >
              <Check size={11} strokeWidth={3} />
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}