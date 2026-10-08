/**
 * Drawer — slide-in panel from the right, used for "Add purpose" and other
 * detail forms (ui.md §3: "Add purpose drawer").
 *
 * - Overlays the content area with a semi-transparent scrim.
 * - Traps focus inside while open (a11y).
 * - Closes on Escape or scrim click.
 * - radius-pass (20px) on the top-left / bottom-left corners.
 * - No animation library needed: CSS transition on the translate.
 * - Respects prefers-reduced-motion by removing the transition.
 */

import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Width class. Default: "w-[420px] max-w-full". */
  widthClass?: string;
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  widthClass = "w-[420px] max-w-full",
}: DrawerProps): ReactNode {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Lock body scroll while open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      // Focus the close button on open
      setTimeout(() => closeBtnRef.current?.focus(), 50);
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Trap focus inside panel
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = panel.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  }

  return (
    <>
      {/* Scrim */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-ink/40 transition-opacity duration-200 motion-reduce:transition-none
          ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={handleKeyDown}
        className={`fixed inset-y-0 right-0 z-50 flex flex-col bg-surface shadow-xl transition-transform duration-200 motion-reduce:transition-none
          rounded-l-pass ${widthClass}
          ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-5">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="flex h-8 w-8 items-center justify-center rounded-pill text-mute transition-colors hover:bg-paper hover:text-ink"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </>
  );
}
