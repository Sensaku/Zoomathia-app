import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { getApiErrorMessage } from '../../../api/errors'
import { useI18n } from '../../../i18n/I18nContext'
import { Alert, Button, Dialog, ErrorSummary } from '../../../shared/ui'
import type { ProposalUpdateInput, ThesaurusProposal } from '../../../types'
import { useEditProposal, useReloadContributions } from '../hooks/useContributionMutations'
import { areAltLabelsValid, parseAltLabels } from '../lib/altLabels'
import { isContributionConflict } from '../lib/conflict'
import { fill } from '../lib/fill'
import { ConflictAlert } from './ConflictDialog'
import { ProposalFields, proposalFieldIds, type ProposalFieldValues } from './ProposalFields'

const MIN_PREF_LABEL_LENGTH = 2

function toValues(proposal: ThesaurusProposal): ProposalFieldValues {
  return {
    prefLabel: proposal.pref_label,
    language: proposal.language,
    altLabels: proposal.alt_labels.join(', '),
    broader: proposal.broader_concept_uri
      ? { uri: proposal.broader_concept_uri, label: proposal.broader_concept_label ?? proposal.broader_concept_uri }
      : null,
    definition: proposal.definition ?? '',
  }
}

/**
 * The fields that differ from what the dialog opened with. A cleared optional field is sent as
 * `null`. The broader concept moves as a pair (URI and label).
 */
function changedFields(initial: ProposalFieldValues, now: ProposalFieldValues): Omit<ProposalUpdateInput, 'version'> {
  const changes: Omit<ProposalUpdateInput, 'version'> = {}
  const prefLabel = now.prefLabel.trim()
  if (prefLabel !== initial.prefLabel) changes.pref_label = prefLabel
  if (now.language !== initial.language) changes.language = now.language
  const before = parseAltLabels(initial.altLabels)
  const after = parseAltLabels(now.altLabels)
  if (before.join('\n') !== after.join('\n')) changes.alt_labels = after
  if (now.broader?.uri !== initial.broader?.uri) {
    changes.broader_concept_uri = now.broader?.uri ?? null
    changes.broader_concept_label = now.broader?.label ?? null
  }
  const definition = now.definition.trim()
  if (definition !== initial.definition.trim()) changes.definition = definition || null
  return changes
}

/** Props of {@link ProposalEditDialog}. */
export interface ProposalEditDialogProps {
  /** The proposal as listed when the dialog opens: its `version` and values are kept from then on. */
  proposal: ThesaurusProposal
  onClose: () => void
}

/**
 * Edit dialog of a pending term proposal: every field may change (RM-CTB-05). It sends the
 * version the user saw when the dialog opened and only the changed fields; nothing changed means
 * a message and no request. A failure shows inside the dialog and success closes it. A conflict
 * (any error that `isContributionConflict` accepts) leaves the message and a "Fermer" button only; closing reloads the lists, so the user never
 * saves over content they have not read. Mount it only while it is open, so it starts from the
 * proposal each time.
 */
export function ProposalEditDialog({ proposal, onClose }: ProposalEditDialogProps) {
  const { t } = useI18n()
  const text = t.thesaurus
  const edit = useEditProposal()
  const reload = useReloadContributions()
  // The reference of the diff and the version sent: what the user saw when the dialog opened.
  const [opened] = useState(() => ({ initial: toValues(proposal), version: proposal.version }))
  const { initial } = opened
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState<{ prefLabel?: string; altLabels?: string }>({})
  const [unchanged, setUnchanged] = useState(false)
  // Remounts the summary on each failed submit, so it takes the focus again (RGAA).
  const [attempt, setAttempt] = useState(0)
  const isConflict = isContributionConflict(edit.error)
  const conflictCloseRef = useRef<HTMLButtonElement>(null)
  const formId = useId()
  const ids = proposalFieldIds(formId)

  // The focused submit button unmounts on a conflict: move the focus to the new button.
  useEffect(() => {
    if (isConflict) conflictCloseRef.current?.focus()
  }, [isConflict])

  const close = () => {
    if (isConflict) void reload()
    onClose()
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (isConflict) return
    const next: typeof errors = {}
    if (values.prefLabel.trim().length < MIN_PREF_LABEL_LENGTH) next.prefLabel = text.prefLabelRequired
    if (!areAltLabelsValid(parseAltLabels(values.altLabels))) next.altLabels = text.altLabelsInvalid
    setErrors(next)
    if (next.prefLabel || next.altLabels) {
      setAttempt((count) => count + 1)
      return
    }
    const changes = changedFields(initial, values)
    setUnchanged(Object.keys(changes).length === 0)
    if (Object.keys(changes).length === 0) return
    edit.mutate({ id: proposal.id, input: { version: opened.version, ...changes } }, { onSuccess: onClose })
  }

  const summary = [
    errors.prefLabel && { fieldId: ids.prefLabel, message: errors.prefLabel },
    errors.altLabels && { fieldId: ids.altLabels, message: errors.altLabels },
  ].filter((item): item is { fieldId: string; message: string } => Boolean(item))

  return (
    <Dialog
      open
      onClose={() => {
        if (!edit.isPending) close()
      }}
      title={fill(text.editTitle, { subject: initial.prefLabel })}
      closeLabel={isConflict ? t.contributions.conflict.closeWindow : t.common.close}
      footer={
        isConflict ? (
          <Button ref={conflictCloseRef} variant="secondary" onClick={close}>
            {t.common.close}
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close} disabled={edit.isPending}>
              {t.common.cancel}
            </Button>
            <Button type="submit" form={formId} isLoading={edit.isPending}>
              {t.common.save}
            </Button>
          </>
        )
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <ErrorSummary key={attempt} title={text.errorsTitle} errors={summary} />
        <ProposalFields
          idPrefix={formId}
          values={values}
          errors={errors}
          onChange={(patch) => {
            setValues((previous) => ({ ...previous, ...patch }))
            setUnchanged(false)
          }}
        />
        {unchanged && <Alert tone="info">{text.editNothing}</Alert>}
        {edit.error &&
          (isConflict ? (
            <ConflictAlert message={getApiErrorMessage(edit.error, t)} />
          ) : (
            <Alert tone="error">{getApiErrorMessage(edit.error, t)}</Alert>
          ))}
      </form>
    </Dialog>
  )
}
