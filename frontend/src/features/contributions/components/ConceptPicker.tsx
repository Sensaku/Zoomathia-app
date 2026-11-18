import { X } from 'lucide-react'
import { useId, useState, type Ref } from 'react'
import { getApiErrorMessage } from '../../../api/errors'
import { useI18n } from '../../../i18n/I18nContext'
import { Alert, Button, TextField } from '../../../shared/ui'
import { MIN_CONCEPT_SEARCH_LENGTH, useConceptSuggestions } from '../hooks/useConceptSuggestions'

/** A chosen TheZoo concept. */
export interface PickedConcept {
  uri: string
  label: string
}

/** Props of {@link ConceptPicker}. */
export interface ConceptPickerProps {
  label: string
  value: PickedConcept | null
  onChange: (value: PickedConcept | null) => void
  hint?: string
  error?: string
  id?: string
  /** Shows a "remove" button, for an optional concept. */
  allowClear?: boolean
  /** Ref of the search field, for a dialog that focuses it on open. */
  inputRef?: Ref<HTMLInputElement>
}

/**
 * TheZoo concept picker: the chosen concept, a search field and the results as buttons in the
 * tab order. Choosing a result calls `onChange` and empties the search. The result count is
 * announced in a polite live region.
 */
export function ConceptPicker({
  label,
  value,
  onChange,
  hint,
  error,
  id,
  allowClear = false,
  inputRef,
}: ConceptPickerProps) {
  const { t } = useI18n()
  const text = t.contributions.conceptPicker
  const [term, setTerm] = useState('')
  const generated = useId()
  const fieldId = id ?? generated
  const query = useConceptSuggestions(term)
  const searching = term.trim().length >= MIN_CONCEPT_SEARCH_LENGTH
  const items = searching ? (query.data ?? []) : []
  const isLoading = searching && query.isFetching
  const failed = searching && query.isError
  const isEmpty = searching && query.isSuccess && !query.isFetching && items.length === 0

  const choose = (concept: PickedConcept) => {
    onChange(concept)
    setTerm('')
  }

  return (
    <div className="space-y-2 font-ui">
      <p className="text-base font-medium text-ink">{label}</p>
      <div className="flex items-start justify-between gap-3 border border-rule-strong bg-paper-raised p-3">
        <div className="min-w-0">
          <p className="sr-only">{text.chosen}</p>
          {value ? (
            <>
              <p className="text-base font-medium text-ink">{value.label}</p>
              <p className="text-sm break-all text-ink-subtle">{value.uri}</p>
            </>
          ) : (
            <p className="text-base text-ink-muted">{text.none}</p>
          )}
        </div>
        {allowClear && value && (
          <Button variant="secondary" size="sm" icon={X} onClick={() => onChange(null)}>
            {text.remove}
          </Button>
        )}
      </div>
      <TextField
        ref={inputRef}
        id={fieldId}
        label={text.searchLabel}
        hint={hint ?? text.searchHint}
        error={error}
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        autoComplete="off"
      />
      <div aria-live="polite" className="text-sm text-ink-muted">
        {isLoading && text.loading}
        {searching && !isLoading && !failed && !isEmpty && text.resultCount.replace('{count}', String(items.length))}
      </div>
      {failed && <Alert tone="error">{getApiErrorMessage(query.error, t)}</Alert>}
      {isEmpty && <p className="text-base text-ink-muted">{text.empty}</p>}
      {items.length > 0 && (
        <ul
          aria-label={text.resultsLabel}
          className="max-h-60 divide-y divide-rule overflow-auto border border-rule-strong"
        >
          {items.map((item) => (
            <li key={item.uri}>
              <button
                type="button"
                onClick={() => choose({ uri: item.uri, label: item.label })}
                className="block w-full px-3 py-2 text-left text-base text-ink hover:bg-paper-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
