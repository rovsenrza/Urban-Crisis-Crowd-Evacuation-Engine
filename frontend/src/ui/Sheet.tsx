import { useEffect, useRef, type ReactNode } from "react";
import { IconButton } from "./Button";
import "./sheet.css";

interface DockedProps {
  /** Accessible name of the region. */
  label: string;
  children: ReactNode;
  /** `bottom`: over the lower edge of the map. `side`: a column beside it on wide screens, bottom on narrow ones. */
  placement?: "bottom" | "side";
}

/**
 * A sheet that stays on screen next to the map and does not block it
 * (the citizen's current route, the dispatcher's detail panel).
 */
export function DockedSheet({ label, children, placement = "bottom" }: DockedProps) {
  return (
    <section className={`ui-sheet ui-sheet--docked ui-sheet--${placement}`} aria-label={label}>
      {children}
    </section>
  );
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Label of the close button. */
  closeLabel: string;
  children: ReactNode;
}

/**
 * A modal sheet: slides up from the bottom on phones, centred on wide
 * screens. Built on <dialog>, which gives the focus trap, Escape and the
 * scrim for free.
 */
export function ModalSheet({ open, onClose, title, closeLabel, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="ui-sheet ui-sheet--modal"
      aria-label={title}
      onClose={onClose}
      onClick={(event) => {
        // A press on the scrim (the dialog element itself) closes the sheet.
        if (event.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="ui-sheet__body">
          <header className="ui-sheet__header">
            <h2>{title}</h2>
            <IconButton icon="close" label={closeLabel} onClick={onClose} />
          </header>
          {children}
        </div>
      )}
    </dialog>
  );
}
