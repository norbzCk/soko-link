import { ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * Modal component with enhanced dismissal behavior:
 * - Click on the overlay (outside the modal content) closes the modal.
 * - Pressing the Escape key closes the modal.
 * - The close button also closes the modal.
 */
export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  // Do not render anything if the modal is not open.
  if (!isOpen) {
    return null;
  }

  // Attach a keydown listener to close the modal when Escape is pressed.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // Find the modal root element where the portal will be rendered.
  const modalRoot = document.getElementById("modal-root");
  if (!modalRoot) {
    console.error(
      "Modal root element not found in the DOM. Please add <div id='modal-root'></div> to your index.html."
    );
    return null;
  }

  /**
   * Handle clicks on the overlay. If the click target is the overlay itself
   * (i.e., not a descendant of the modal content), close the modal.
   */
  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return createPortal(
    <div className="modal-overlay" onClick={handleOverlayClick}>
      {/* Stop propagation on the content so clicks inside the modal don't trigger the overlay handler */}
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button
            className="modal-close-button"
            onClick={onClose}
            aria-label="Close modal"
          >
            &times;
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    modalRoot
  );
}
