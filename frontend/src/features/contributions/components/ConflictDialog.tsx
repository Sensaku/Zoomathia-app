import { useRef } from 'react'
import { useI18n } from '../../../i18n/I18nContext'
import { Alert, Button, Dialog } from '../../../shared/ui'

/**
 * The conflict message with the one hint that closing reloads the list. The hint lives here
 * only, so the messages of `getApiErrorMessage` stay usable elsewhere.
 */
export function ConflictAlert({ message }: { message: string }) {
  const { t } = useI18n()
  return (
    <Alert tone="error">
      <p>{message}</p>
      <p>{t.contributions.conflict.reloadHint}</p>
    </Alert>
  )
}

/** Props of {@link ConflictDialog}. */
export interface ConflictDialogProps {
  /** The translated conflict message (`getApiErrorMessage`). */
  message: string
  /** Closes the dialog. The caller reloads the contributions here (RM-CTB-05). */
  onClose: () => void
}

/**
 * Ends a review or a deletion that a 409 refused (RM-CTB-05, RM-MOD-02): the message and one
 * "Fermer" button, no way to retry on content the user has not read. Closing it by any means
 * (button, Escape, cross) reloads the lists through `onClose`.
 */
export function ConflictDialog({ message, onClose }: ConflictDialogProps) {
  const { t } = useI18n()
  const closeRef = useRef<HTMLButtonElement>(null)
  return (
    <Dialog
      open
      onClose={onClose}
      title={t.contributions.conflict.title}
      // Not "Fermer": the footer button keeps that name alone.
      closeLabel={t.contributions.conflict.closeWindow}
      initialFocusRef={closeRef}
      footer={
        <Button ref={closeRef} variant="secondary" onClick={onClose}>
          {t.common.close}
        </Button>
      }
    >
      <ConflictAlert message={message} />
    </Dialog>
  )
}
