import { useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusCircle } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { createThesaurusProposal } from '../../../api/client'
import { getApiErrorMessage } from '../../../api/errors'
import { useI18n } from '../../../i18n/I18nContext'
import { Alert, Button, ErrorSummary } from '../../../shared/ui'
import type { CreateThesaurusProposalInput } from '../../../types'
import { SessionGate } from '../../accounts'
import { areAltLabelsValid, parseAltLabels } from '../lib/altLabels'
import { ProposalFields, proposalFieldIds, type ProposalFieldValues } from './ProposalFields'

const MIN_PREF_LABEL_LENGTH = 2
const EMPTY: ProposalFieldValues = { prefLabel: '', language: 'fr', altLabels: '', broader: null, definition: '' }

/** Props of {@link ProposalForm}. */
export interface ProposalFormProps {
  /** Opens the pending tab of the list, from the notice shown after a proposal. */
  onShowPending: () => void
}

/**
 * Form to propose a term (RM-THE-04). A visitor sees a sign-in prompt instead. The author and
 * the status are never sent: the server decides (RM-CTB-03, RM-CTB-04). After success a notice
 * says the proposal waits for a peer review (RM-MOD-01).
 */
export function ProposalForm({ onShowPending }: ProposalFormProps) {
  const { t } = useI18n()
  const text = t.thesaurus
  const queryClient = useQueryClient()
  const [values, setValues] = useState(EMPTY)
  const [errors, setErrors] = useState<{ prefLabel?: string; altLabels?: string }>({})
  const [created, setCreated] = useState(false)
  // Counts the submits: the error summary is remounted each time, so that it takes the focus again.
  const [attempt, setAttempt] = useState(0)
  const formId = useId()
  const ids = proposalFieldIds(formId)

  const create = useMutation({
    mutationFn: (input: CreateThesaurusProposalInput) => createThesaurusProposal(input),
    onSuccess: async () => {
      setValues(EMPTY)
      setCreated(true)
      await queryClient.invalidateQueries({ queryKey: ['thesaurusProposals'] })
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const next: typeof errors = {}
    const altLabels = parseAltLabels(values.altLabels)
    if (values.prefLabel.trim().length < MIN_PREF_LABEL_LENGTH) next.prefLabel = text.prefLabelRequired
    if (!areAltLabelsValid(altLabels)) next.altLabels = text.altLabelsInvalid
    setErrors(next)
    setAttempt((count) => count + 1)
    if (next.prefLabel || next.altLabels) return
    setCreated(false)
    create.mutate({
      pref_label: values.prefLabel.trim(),
      language: values.language,
      alt_labels: altLabels,
      broader_concept_uri: values.broader?.uri,
      broader_concept_label: values.broader?.label,
      definition: values.definition.trim() || undefined,
    })
  }

  const summary = [
    errors.prefLabel && { fieldId: ids.prefLabel, message: errors.prefLabel },
    errors.altLabels && { fieldId: ids.altLabels, message: errors.altLabels },
  ].filter((item): item is { fieldId: string; message: string } => Boolean(item))

  return (
    <SessionGate signInMessage={text.signInToPropose}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <ErrorSummary key={attempt} title={text.errorsTitle} errors={summary} />
        {created && (
          <Alert tone="success">
            <p>{text.successMessage}</p>
            <Button variant="ghost" size="sm" onClick={onShowPending}>
              {text.showPending}
            </Button>
          </Alert>
        )}
        {create.error && <Alert tone="error">{getApiErrorMessage(create.error, t)}</Alert>}
        <ProposalFields
          idPrefix={formId}
          values={values}
          errors={errors}
          onChange={(patch) => setValues((previous) => ({ ...previous, ...patch }))}
        />
        <Button type="submit" icon={PlusCircle} isLoading={create.isPending}>
          {create.isPending ? text.submitting : text.submitBtn}
        </Button>
      </form>
    </SessionGate>
  )
}
