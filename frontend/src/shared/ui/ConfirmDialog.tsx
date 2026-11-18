import { useRef } from 'react'
import { Alert } from './Alert'
import { Button } from './Button'
import { Dialog } from './Dialog'

/** Props of {@link ConfirmDialog}. */
export interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  /** `danger` styles the confirm button for a destructive action. */
  tone?: 'default' | 'danger'
  onConfirm: () => void
  onCancel: () => void
  /** True while the action runs: the confirm button shows a spinner and both buttons block. */
  isPending?: boolean
  /** Failure of the last attempt, shown inside the dialog. */
  error?: string
}

/**
 * Yes/no question built on {@link Dialog}. Closing it (Escape or the close button) counts as
 * a cancel, except while the action is pending. Focus starts on "cancel", the safe choice.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone = 'default',
  onConfirm,
  onCancel,
  isPending = false,
  error,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!isPending) onCancel()
      }}
      title={title}
      initialFocusRef={cancelRef}
      closeLabel={cancelLabel}
      footer={
        <>
          <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={isPending}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} isLoading={isPending}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p>{message}</p>
      {error && (
        <Alert tone="error" className="mt-3">
          {error}
        </Alert>
      )}
    </Dialog>
  )
}
