import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { getApiErrorMessage } from '../../../api/errors'
import { useI18n } from '../../../i18n/I18nContext'
import { Alert, Button, Dialog, ErrorSummary, TextAreaField } from '../../../shared/ui'
import type { AnnotationUpdateInput, StagedAnnotation } from '../../../types'
import { useEditAnnotation, useReloadContributions } from '../hooks/useContributionMutations'
import { isContributionConflict } from '../lib/conflict'
import { fill } from '../lib/fill'
import { ConceptPicker, type PickedConcept } from './ConceptPicker'
import { ConflictAlert } from './ConflictDialog'

/** Longest justification the backend accepts. */
const MAX_JUSTIFICATION_LENGTH = 5000

/** Props of {@link AnnotationEditDialog}. */
export interface AnnotationEditDialogProps {
  /** The annotation as listed when the dialog opens: its `version` and values are kept from then on. */
  annotation: Pick<StagedAnnotation, 'id' | 'version' | 'concept_uri' | 'concept_label' | 'justification'>
  onClose: () => void
}

/**
 * Edit of a pending annotation (RM-CTB-05): only the concept and the justification. It sends
 * the version and the fields that changed, both compared with what the user saw when the dialog
 * opened: if the annotation changed since, the server answers with a conflict instead of
 * accepting content the user has not read. A conflict (any error that `isContributionConflict`
 * accepts) leaves the message and a "Fermer" button only; closing reloads the lists. Mount it only while it is
 * open, so it starts from the current values each time.
 */
export function AnnotationEditDialog({ annotation, onClose }: AnnotationEditDialogProps) {
  const { t } = useI18n()
  const text = t.contributions.annotationEdit
  const edit = useEditAnnotation()
  const reload = useReloadContributions()
  // Frozen at open: later props (a reload, a change from another tab) must not move the baseline.
  const [opened] = useState(() => annotation)
  const [concept, setConcept] = useState<PickedConcept | null>({
    uri: opened.concept_uri,
    label: opened.concept_label,
  })
  const [justification, setJustification] = useState(opened.justification ?? '')
  const [problem, setProblem] = useState<'concept' | 'unchanged' | null>(null)
  // Remounts the summary on each failed submit, so it takes the focus again (RGAA).
  const [attempt, setAttempt] = useState(0)
  const isConflict = isContributionConflict(edit.error)
  const justificationRef = useRef<HTMLTextAreaElement>(null)
  const conflictCloseRef = useRef<HTMLButtonElement>(null)
  const conceptId = useId()
  const formId = useId()

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
    if (!concept) {
      setProblem('concept')
      setAttempt((count) => count + 1)
      return
    }
    const input: AnnotationUpdateInput = { version: opened.version }
    let changed = false
    if (concept.uri !== opened.concept_uri || concept.label !== opened.concept_label) {
      input.concept_uri = concept.uri
      input.concept_label = concept.label
      changed = true
    }
    const cleaned = justification.trim()
    if (cleaned !== (opened.justification ?? '')) {
      input.justification = cleaned || null
      changed = true
    }
    if (!changed) {
      setProblem('unchanged')
      return
    }
    setProblem(null)
    edit.mutate({ id: opened.id, input }, { onSuccess: onClose })
  }

  const conceptError = problem === 'concept' ? text.conceptRequired : undefined

  return (
    <Dialog
      open
      onClose={() => {
        if (!edit.isPending) close()
      }}
      title={fill(text.title, { subject: opened.concept_label })}
      closeLabel={isConflict ? t.contributions.conflict.closeWindow : t.contributions.actions.cancel}
      initialFocusRef={justificationRef}
      footer={
        isConflict ? (
          <Button ref={conflictCloseRef} variant="secondary" onClick={close}>
            {t.common.close}
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close} disabled={edit.isPending}>
              {t.contributions.actions.cancel}
            </Button>
            <Button type="submit" form={formId} isLoading={edit.isPending}>
              {text.submit}
            </Button>
          </>
        )
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
        {conceptError && (
          <ErrorSummary
            key={attempt}
            title={text.errorSummaryTitle}
            errors={[{ fieldId: conceptId, message: conceptError }]}
          />
        )}
        <ConceptPicker
          id={conceptId}
          label={text.conceptLabel}
          value={concept}
          onChange={(next) => {
            setConcept(next)
            setProblem(null)
          }}
          error={conceptError}
        />
        <TextAreaField
          ref={justificationRef}
          label={text.justificationLabel}
          hint={text.justificationHint}
          maxLength={MAX_JUSTIFICATION_LENGTH}
          rows={4}
          value={justification}
          onChange={(event) => {
            setJustification(event.target.value)
            setProblem(null)
          }}
        />
        {problem === 'unchanged' && <Alert tone="info">{text.unchanged}</Alert>}
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
