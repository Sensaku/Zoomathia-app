import { useId, useRef, useState, type FormEvent } from 'react'
import { useI18n } from '../../../i18n/I18nContext'
import { Alert, Button, Dialog, ErrorSummary, TextAreaField } from '../../../shared/ui'
import type { ReviewInput } from '../../../types'
import { fill } from '../lib/fill'

/** Longest rejection reason the backend accepts (RM-MOD-03). */
const MAX_REASON_LENGTH = 2000

/** Props of {@link RejectDialog}. */
export interface RejectDialogProps {
  /** Concept label or term, named in the title. */
  subject: string
  /** Current version of the contribution, sent back with the review. */
  version: number
  onSubmit: (input: ReviewInput) => void
  onCancel: () => void
  /** True while the request runs. */
  isPending?: boolean
  /** Failure of the last attempt, shown inside the dialog. */
  error?: string
}

/**
 * Rejection dialog (RM-MOD-03): a required reason, with a warning that it will be public
 * (RM-ACC-04). An empty or blank reason shows an error summary and sends nothing. Mount it
 * only while it is open, so it starts empty each time.
 */
export function RejectDialog({ subject, version, onSubmit, onCancel, isPending = false, error }: RejectDialogProps) {
  const { t } = useI18n()
  const text = t.contributions
  const [reason, setReason] = useState('')
  const [showRequired, setShowRequired] = useState(false)
  // Remounts the summary on each failed submit, so it takes the focus again (RGAA).
  const [attempt, setAttempt] = useState(0)
  const reasonRef = useRef<HTMLTextAreaElement>(null)
  const fieldId = useId()
  const formId = useId()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = reason.trim()
    if (!trimmed) {
      setShowRequired(true)
      setAttempt((count) => count + 1)
      return
    }
    onSubmit({ version, decision: 'rejected', reason: trimmed })
  }

  const requiredMessage = showRequired ? text.reject.reasonRequired : undefined

  return (
    <Dialog
      open
      onClose={() => {
        if (!isPending) onCancel()
      }}
      title={fill(text.reject.title, { subject })}
      closeLabel={text.actions.cancel}
      initialFocusRef={reasonRef}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={isPending}>
            {text.actions.cancel}
          </Button>
          <Button type="submit" form={formId} variant="danger" isLoading={isPending}>
            {text.actions.reject}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-3">
        {requiredMessage && (
          <ErrorSummary
            key={attempt}
            title={text.reject.errorSummaryTitle}
            errors={[{ fieldId, message: requiredMessage }]}
          />
        )}
        <Alert tone="warning" isStatic>
          {text.reject.publicWarning}
        </Alert>
        <TextAreaField
          ref={reasonRef}
          id={fieldId}
          label={text.reject.reasonLabel}
          required
          maxLength={MAX_REASON_LENGTH}
          value={reason}
          error={requiredMessage}
          onChange={(event) => {
            setReason(event.target.value)
            setShowRequired(false)
          }}
        />
        {error && <Alert tone="error">{error}</Alert>}
      </form>
    </Dialog>
  )
}
