import { useEffect, useRef } from 'react';
import styles from './EditorApp.module.css';

export interface ConfirmationRequest {
  kicker: string;
  marker: string;
  title: string;
  description: string;
  confirmLabel: string;
  tone: 'default' | 'danger';
}

interface ConfirmDialogProps {
  request: ConfirmationRequest | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({ request, onCancel, onConfirm }: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (request && !dialog.open) {
      dialog.showModal();
      window.requestAnimationFrame(() => cancelButtonRef.current?.focus());
    } else if (!request && dialog.open) {
      dialog.close();
    }
  }, [request]);

  return (
    <dialog
      ref={dialogRef}
      className={styles.confirmDialog}
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-description"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      {request ? (
        <div className={styles.confirmSurface} data-tone={request.tone}>
          <div className={styles.confirmHeading}>
            <span className={styles.confirmMarker} aria-hidden="true">{request.marker}</span>
            <span className={styles.eyebrow}>{request.kicker}</span>
          </div>
          <h2 id="confirm-dialog-title">{request.title}</h2>
          <p id="confirm-dialog-description">{request.description}</p>
          <div className={styles.confirmActions}>
            <button ref={cancelButtonRef} type="button" onClick={onCancel}>取消</button>
            <button type="button" data-tone={request.tone} onClick={onConfirm}>{request.confirmLabel}</button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
