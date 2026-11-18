import { useI18n } from '../../../i18n/I18nContext'
import { TextAreaField, TextField } from '../../../shared/ui'
import { FieldShell } from '../../../shared/ui/FieldShell'
import { controlClass } from '../../../shared/ui/fields'
import { ConceptPicker, type PickedConcept } from './ConceptPicker'

/** Languages a term can be proposed in (RM-THE-05). */
export const PROPOSAL_LANGUAGES = ['fr', 'en', 'la', 'grc'] as const

/** What the user types in the proposal fields. */
export interface ProposalFieldValues {
  prefLabel: string
  language: string
  /** Comma-separated text. */
  altLabels: string
  broader: PickedConcept | null
  definition: string
}

/** Field ids of a proposal form, so an error summary can link to them. */
export function proposalFieldIds(prefix: string) {
  return { prefLabel: `${prefix}-pref-label`, altLabels: `${prefix}-alt-labels` }
}

/** Props of {@link ProposalFields}. */
export interface ProposalFieldsProps {
  /** Prefix of the field ids: two forms may be on the same page. */
  idPrefix: string
  values: ProposalFieldValues
  onChange: (patch: Partial<ProposalFieldValues>) => void
  errors?: { prefLabel?: string; altLabels?: string }
}

/**
 * The five fields of a term proposal, shared by the creation form and the edit dialog
 * (RM-THE-04, RM-THE-05, RM-CTB-05). The broader concept is searched in TheZoo only after the
 * user types.
 */
export function ProposalFields({ idPrefix, values, onChange, errors = {} }: ProposalFieldsProps) {
  const { t } = useI18n()
  const text = t.thesaurus
  const ids = proposalFieldIds(idPrefix)
  const languageId = `${idPrefix}-language`

  return (
    <div className="flex flex-col gap-4">
      <TextField
        id={ids.prefLabel}
        label={text.prefLabel}
        required
        maxLength={200}
        placeholder={text.prefLabelPlaceholder}
        value={values.prefLabel}
        error={errors.prefLabel}
        onChange={(event) => onChange({ prefLabel: event.target.value })}
      />
      <FieldShell fieldId={languageId} label={text.languageLabel}>
        <select
          id={languageId}
          value={values.language}
          onChange={(event) => onChange({ language: event.target.value })}
          className={`${controlClass} border-rule-strong`}
        >
          {PROPOSAL_LANGUAGES.map((code) => (
            <option key={code} value={code}>
              {text.languageNames[code]} ({code})
            </option>
          ))}
        </select>
      </FieldShell>
      <TextField
        id={ids.altLabels}
        label={text.altLabels}
        hint={text.altLabelsHint}
        value={values.altLabels}
        error={errors.altLabels}
        onChange={(event) => onChange({ altLabels: event.target.value })}
      />
      <ConceptPicker
        label={text.broaderLabel}
        value={values.broader}
        onChange={(broader) => onChange({ broader })}
        allowClear
      />
      <TextAreaField
        label={text.definition}
        placeholder={text.definitionPlaceholder}
        maxLength={5000}
        value={values.definition}
        onChange={(event) => onChange({ definition: event.target.value })}
      />
    </div>
  )
}
