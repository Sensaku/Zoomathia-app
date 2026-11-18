import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronUp, Plus } from 'lucide-react'
import { useId, useRef, useState, type FormEvent, type RefObject } from 'react'
import { createAnnotation, createThesaurusProposal } from '../../../api/client'
import { getApiErrorMessage } from '../../../api/errors'
import { SessionGate, useSession } from '../../accounts'
import { useReloadContributions } from '../hooks/useContributionMutations'
import { ConceptPicker, type PickedConcept } from './ConceptPicker'
import { ProposalFields, type ProposalFieldValues } from './ProposalFields'
import { fill } from '../lib/fill'
import { areAltLabelsValid, parseAltLabels } from '../lib/altLabels'
import { useI18n } from '../../../i18n'
import { Alert, Button, Dialog, ErrorSummary, TextAreaField } from '../../../shared/ui'
import type { AnnotationScopeType, CreateAnnotationInput, TargetParagraphDetail } from '../../../types'

/** Props of {@link AnnotationCreateDialog}. */
export interface AnnotationCreateDialogProps {
  open: boolean
  onClose: () => void
  paragraphUri: string
  targetText: string
  startOffset: number
  endOffset: number
  endParagraphUri?: string
  targetParagraphs?: string[]
  targetParagraphDetails?: TargetParagraphDetail[]
  initialScopeType?: AnnotationScopeType
  onSuccess?: () => void
}

const MIN_PREF_LABEL_LENGTH = 2
const MAX_JUSTIFICATION_LENGTH = 5000
const NEW_CONCEPT_PREFIX = 'http://zoomathia.i3s.unice.fr/concept/proposal/'
const EMPTY_PROPOSAL: ProposalFieldValues = {
  prefLabel: '',
  language: 'la',
  altLabels: '',
  broader: null,
  definition: '',
}

/** Granularity recommended for a selection when the caller does not impose one. */
function defaultScope({
  initialScopeType,
  targetParagraphs,
  targetText,
  startOffset,
  endOffset,
}: Pick<
  AnnotationCreateDialogProps,
  'initialScopeType' | 'targetParagraphs' | 'targetText' | 'startOffset' | 'endOffset'
>): AnnotationScopeType {
  const trimmed = targetText.trim()
  if (initialScopeType) return initialScopeType
  if (targetParagraphs && targetParagraphs.length > 1) return 'multi_paragraph'
  if (startOffset === 0 && endOffset === targetText.length && targetText.length > 100) return 'paragraph'
  if (trimmed.endsWith('.') || trimmed.endsWith(';')) return 'sentence'
  if (!trimmed.includes(' ')) return 'word'
  return 'word_sequence'
}

/** The selected text, or each selected paragraph with its number and length. */
function SelectedExtract({
  targetText,
  startOffset,
  endOffset,
  targetParagraphs,
  targetParagraphDetails,
}: Pick<
  AnnotationCreateDialogProps,
  'targetText' | 'startOffset' | 'endOffset' | 'targetParagraphs' | 'targetParagraphDetails'
>) {
  const { t } = useI18n()
  const text = t.modal
  const count = targetParagraphDetails?.length ?? 0
  const several = count > 1
  const total = several ? count : (targetParagraphs?.length ?? 1)
  return (
    <section className="space-y-2 border border-rule bg-paper-raised p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-ink-muted">
        <h3>
          {text.selectedExtract} ({startOffset} - {endOffset})
        </h3>
        <span className="bg-paper-sunken px-1.5 py-0.5 font-mono text-ink-muted">
          {total > 1 ? fill(text.paragraphCount, { count: String(total) }) : text.oneParagraph}
        </span>
      </div>
      {several ? (
        <ul className="max-h-52 space-y-2 overflow-y-auto pr-1">
          {targetParagraphDetails?.map((tp, index) => (
            <li key={tp.uri || index} className="space-y-1 border border-rule bg-paper p-2.5">
              <div className="flex items-center justify-between text-sm">
                <span className="bg-paper-sunken px-2 py-0.5 font-mono font-bold text-accent-strong">§ {tp.id}</span>
                <span className="font-mono text-ink-muted">
                  {fill(text.characters, { count: String(tp.text.length) })}
                </span>
              </div>
              <blockquote className="ancient-text text-sm leading-relaxed text-ink italic">« {tp.text} »</blockquote>
            </li>
          ))}
        </ul>
      ) : (
        <div className="max-h-44 overflow-y-auto pr-1">
          <blockquote className="ancient-text text-base leading-relaxed font-semibold text-ink italic">
            « {targetText} »
          </blockquote>
        </div>
      )}
    </section>
  )
}

/** Props of {@link NewConceptPanel}. */
interface NewConceptPanelProps {
  idPrefix: string
  values: ProposalFieldValues
  onChange: (patch: Partial<ProposalFieldValues>) => void
  onCreated: (concept: PickedConcept) => void
}

/**
 * Proposes a TheZoo term from the annotation dialog and hands it back as the chosen concept.
 * It sits outside the annotation `<form>` (forms cannot nest), so Enter in its fields never
 * saves the annotation.
 */
function NewConceptPanel({ idPrefix, values, onChange, onCreated }: NewConceptPanelProps) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [errors, setErrors] = useState<{ prefLabel?: string; altLabels?: string }>({})
  const create = useMutation({
    mutationFn: createThesaurusProposal,
    onSuccess: (proposal) => {
      onCreated({ uri: `${NEW_CONCEPT_PREFIX}${proposal.id}`, label: proposal.pref_label })
      void queryClient.invalidateQueries({ queryKey: ['thesaurusProposals'] })
    },
  })

  const submit = () => {
    const altLabels = parseAltLabels(values.altLabels)
    const next: typeof errors = {}
    if (values.prefLabel.trim().length < MIN_PREF_LABEL_LENGTH) next.prefLabel = t.thesaurus.prefLabelRequired
    if (!areAltLabelsValid(altLabels)) next.altLabels = t.thesaurus.altLabelsInvalid
    setErrors(next)
    if (next.prefLabel || next.altLabels) return
    create.mutate({
      pref_label: values.prefLabel.trim(),
      language: values.language,
      alt_labels: altLabels,
      broader_concept_uri: values.broader?.uri,
      broader_concept_label: values.broader?.label,
      definition: values.definition.trim() || undefined,
    })
  }

  return (
    <fieldset className="min-w-0 space-y-4 border border-rule-strong bg-paper-sunken p-4">
      <legend className="px-1 text-base font-semibold text-ink">{t.modal.newConceptTitle}</legend>
      <ProposalFields idPrefix={idPrefix} values={values} errors={errors} onChange={onChange} />
      {create.error && <Alert tone="error">{getApiErrorMessage(create.error, t)}</Alert>}
      <div className="flex justify-end">
        <Button type="button" icon={Plus} isLoading={create.isPending} onClick={submit}>
          {t.modal.createConceptBtn}
        </Button>
      </div>
    </fieldset>
  )
}

/** Props of {@link AnnotationForm}. */
interface AnnotationFormProps extends Omit<AnnotationCreateDialogProps, 'open'> {
  formId: string
  focusRef: RefObject<HTMLInputElement | null>
  onPendingChange: (pending: boolean) => void
}

/**
 * The annotation form. It is mounted by the open dialog, so its state starts from the props
 * on each opening. The payload carries no author and no status: the server decides
 * (RM-CTB-03).
 */
function AnnotationForm({ formId, focusRef, onPendingChange, ...props }: AnnotationFormProps) {
  const { t } = useI18n()
  const text = t.modal
  const reloadContributions = useReloadContributions()
  const [scopeType] = useState(() => defaultScope(props))
  const [concept, setConcept] = useState<PickedConcept | null>(null)
  const [justification, setJustification] = useState('')
  const [missingConcept, setMissingConcept] = useState(false)
  // Remounts the summary on each failed submit, so it takes the focus again (RGAA).
  const [attempt, setAttempt] = useState(0)
  const [isDefining, setIsDefining] = useState(false)
  const [proposal, setProposal] = useState(EMPTY_PROPOSAL)
  const conceptId = useId()
  const panelId = useId()
  const proposalPrefix = useId()

  const create = useMutation({
    mutationFn: (input: CreateAnnotationInput) => createAnnotation(input),
    onMutate: () => onPendingChange(true),
    onSettled: () => onPendingChange(false),
    onSuccess: () => {
      // The new annotation is pending: every list of the contribution roots may show it.
      void reloadContributions()
      props.onSuccess?.()
      props.onClose()
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!concept) {
      setMissingConcept(true)
      setAttempt((count) => count + 1)
      return
    }
    create.mutate({
      paragraph_uri: props.paragraphUri,
      target_text: props.targetText,
      start_offset: props.startOffset,
      end_offset: props.endOffset,
      concept_uri: concept.uri,
      concept_label: concept.label,
      justification: justification.trim() || undefined,
      scope_type: scopeType,
      end_paragraph_uri: props.endParagraphUri,
      target_paragraphs: props.targetParagraphs,
    })
  }

  // Prefilled when the panel opens, not in an effect; what the user typed stays.
  const toggleDefining = () => {
    if (!isDefining && !proposal.prefLabel) setProposal({ ...proposal, prefLabel: props.targetText.slice(0, 40) })
    setIsDefining(!isDefining)
  }

  return (
    <div className="flex flex-col gap-4">
      <SelectedExtract {...props} />
      <div className="space-y-3">
        <Button
          variant="secondary"
          size="sm"
          icon={isDefining ? ChevronUp : Plus}
          aria-expanded={isDefining}
          aria-controls={panelId}
          onClick={toggleDefining}
        >
          {isDefining ? text.defineOnTheFlyHide : text.defineOnTheFly}
        </Button>
        <div id={panelId} hidden={!isDefining}>
          {isDefining && (
            <NewConceptPanel
              idPrefix={proposalPrefix}
              values={proposal}
              onChange={(patch) => setProposal((previous) => ({ ...previous, ...patch }))}
              onCreated={(created) => {
                setConcept(created)
                setMissingConcept(false)
                setIsDefining(false)
              }}
            />
          )}
        </div>
      </div>
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
        {missingConcept && (
          <ErrorSummary
            key={attempt}
            title={text.errorSummaryTitle}
            errors={[{ fieldId: conceptId, message: text.selectConceptError }]}
          />
        )}
        {create.error && <Alert tone="error">{getApiErrorMessage(create.error, t)}</Alert>}
        <div className="space-y-2">
          <ConceptPicker
            id={conceptId}
            inputRef={focusRef}
            label={text.conceptLabel}
            value={concept}
            onChange={(next) => {
              setConcept(next)
              setMissingConcept(false)
            }}
            error={missingConcept ? text.selectConceptError : undefined}
          />
          {concept && (
            <p className="text-sm text-ink-muted">
              {concept.uri.startsWith(NEW_CONCEPT_PREFIX) ? text.newConceptSource : text.conceptSource}
            </p>
          )}
        </div>
        <TextAreaField
          label={text.justificationLabel}
          placeholder={text.justificationPlaceholder}
          maxLength={MAX_JUSTIFICATION_LENGTH}
          rows={3}
          value={justification}
          onChange={(event) => setJustification(event.target.value)}
        />
      </form>
    </div>
  )
}

/**
 * Dialog to annotate a selection with a TheZoo concept (RM-CTB-03: accounts only; a visitor
 * sees the sign-in prompt). The user searches a concept or proposes a new one on the fly, adds
 * a justification, and saves; the annotation is created pending, awaiting a peer review.
 */
export function AnnotationCreateDialog({ open, onClose, ...props }: AnnotationCreateDialogProps) {
  const { t } = useI18n()
  const { isSignedIn } = useSession()
  const [pending, setPending] = useState(false)
  const formId = useId()
  const focusRef = useRef<HTMLInputElement>(null)

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!pending) onClose()
      }}
      title={t.modal.title}
      closeLabel={t.modal.cancelBtn}
      initialFocusRef={focusRef}
      footer={
        isSignedIn && (
          <>
            <Button variant="secondary" onClick={onClose} disabled={pending}>
              {t.modal.cancelBtn}
            </Button>
            <Button type="submit" form={formId} isLoading={pending}>
              {t.modal.submitBtn}
            </Button>
          </>
        )
      }
    >
      {isSignedIn ? (
        <AnnotationForm {...props} onClose={onClose} formId={formId} focusRef={focusRef} onPendingChange={setPending} />
      ) : (
        // RM-CTB-03: only an account contributes; a visitor is sent to the login.
        <SessionGate signInMessage={t.modal.signInMessage}>{null}</SessionGate>
      )}
    </Dialog>
  )
}
