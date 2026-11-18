import { Check, Pencil, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { getApiErrorMessage } from '../../../api/errors'
import { useI18n } from '../../../i18n/I18nContext'
import { Button, ConfirmDialog } from '../../../shared/ui'
import type { ContributionAction, ReviewInput } from '../../../types'
import {
  useDeleteAnnotation,
  useDeleteProposal,
  useReloadContributions,
  useReviewAnnotation,
  useReviewProposal,
} from '../hooks/useContributionMutations'
import { isContributionConflict } from '../lib/conflict'
import { fill } from '../lib/fill'
import { ConflictDialog } from './ConflictDialog'
import { RejectDialog } from './RejectDialog'

/** What the actions need from an annotation or a term proposal. */
export interface ActionableContribution {
  id: number
  version: number
  allowed_actions: ContributionAction[]
}

/** Props of {@link ContributionActions}. */
export interface ContributionActionsProps {
  kind: 'annotation' | 'proposal'
  contribution: ActionableContribution
  /** Concept label or term. It is part of every button name, so a long list stays clear for screen readers. */
  subject: string
  /** Opens the edit dialog of the caller. Without it, "edit" shows no button. */
  onEdit?: () => void
}

/** The open dialog and the version of the contribution when it opened: that one is sent (RM-CTB-05). */
type OpenDialog = { type: 'validate' | 'reject' | 'delete'; version: number } | null

/** Button whose visible text is the action and whose accessible name adds the subject. */
function ActionButton({
  icon,
  label,
  subject,
  onClick,
}: {
  icon: typeof Check
  label: string
  subject: string
  onClick: () => void
}) {
  return (
    <Button variant="secondary" size="sm" icon={icon} onClick={onClick}>
      {label}
      <span className="sr-only">: {subject}</span>
    </Button>
  )
}

/**
 * Review, edit and delete buttons of a contribution. A button shows only when the backend lists
 * the action in `allowed_actions` (RM-CTB-05, RM-MOD-01, RM-MOD-05); the browser never decides.
 * Review and deletion are final (RM-MOD-06), so each asks for a confirmation. The `version` sent
 * is the one at the moment the dialog opened, so an action on content that changed since fails
 * with a conflict instead of acting on what the user has not read. A conflict ends in a dialog
 * with one "Fermer" button, which reloads the lists (they are not reloaded earlier, as the item
 * may leave a filtered list and take its dialog with it).
 */
export function ContributionActions({ kind, contribution, subject, onEdit }: ContributionActionsProps) {
  const { t } = useI18n()
  const text = t.contributions.actions
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const reload = useReloadContributions()
  // Both kinds are called because hooks cannot be conditional; only one is used.
  const reviewAnnotation = useReviewAnnotation()
  const reviewProposal = useReviewProposal()
  const deleteAnnotation = useDeleteAnnotation()
  const deleteProposal = useDeleteProposal()
  const review = kind === 'annotation' ? reviewAnnotation : reviewProposal
  const remove = kind === 'annotation' ? deleteAnnotation : deleteProposal

  const { id, version, allowed_actions: allowed } = contribution
  const failure = dialog?.type === 'delete' ? remove.error : review.error
  const isConflict = isContributionConflict(failure)
  const message = failure ? getApiErrorMessage(failure, t) : undefined
  // A conflict has its own dialog; any other failure shows inside the open one.
  const error = isConflict ? undefined : message
  const isPending = review.isPending || remove.isPending
  const is = (type: NonNullable<OpenDialog>['type']) => dialog?.type === type && !isConflict

  const open = (type: NonNullable<OpenDialog>['type']) => {
    review.reset()
    remove.reset()
    setDialog({ type, version })
  }
  const close = () => setDialog(null)
  const closeAfterConflict = () => {
    void reload()
    close()
  }
  const sendReview = (input: ReviewInput) => review.mutate({ id, input }, { onSuccess: close })

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {allowed.includes('review') && (
          <>
            <ActionButton icon={Check} label={text.validate} subject={subject} onClick={() => open('validate')} />
            <ActionButton icon={X} label={text.reject} subject={subject} onClick={() => open('reject')} />
          </>
        )}
        {allowed.includes('edit') && onEdit && (
          <ActionButton icon={Pencil} label={text.edit} subject={subject} onClick={onEdit} />
        )}
        {allowed.includes('delete') && (
          <ActionButton icon={Trash2} label={text.delete} subject={subject} onClick={() => open('delete')} />
        )}
      </div>
      <ConfirmDialog
        open={is('validate')}
        title={fill(text.validateTitle, { subject })}
        message={text.validateMessage}
        confirmLabel={text.validate}
        cancelLabel={text.cancel}
        onConfirm={() => dialog && sendReview({ version: dialog.version, decision: 'validated' })}
        onCancel={close}
        isPending={isPending}
        error={error}
      />
      <ConfirmDialog
        open={is('delete')}
        title={fill(text.deleteTitle, { subject })}
        message={text.deleteMessage}
        confirmLabel={text.delete}
        cancelLabel={text.cancel}
        tone="danger"
        onConfirm={() => remove.mutate(id, { onSuccess: close })}
        onCancel={close}
        isPending={isPending}
        error={error}
      />
      {dialog && is('reject') && (
        <RejectDialog
          subject={subject}
          version={dialog.version}
          onSubmit={sendReview}
          onCancel={close}
          isPending={isPending}
          error={error}
        />
      )}
      {dialog && isConflict && message && <ConflictDialog message={message} onClose={closeAfterConflict} />}
    </>
  )
}
