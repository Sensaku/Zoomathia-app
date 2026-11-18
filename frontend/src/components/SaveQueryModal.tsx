import React, { useId, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Bookmark, Plus, RefreshCw } from 'lucide-react'
import { createSavedQuery, updateSavedQuery } from '../api/client'
import { getApiErrorMessage } from '../api/errors'
import { SAVED_QUERIES_ROOT } from '../features/contributions'
import { SessionGate, useSession } from '../features/accounts'
import { useI18n } from '../i18n'
import { Alert, Button, Dialog, ErrorSummary, TextAreaField, TextField } from '../shared/ui'
import { FieldShell } from '../shared/ui/FieldShell'
import { controlClass } from '../shared/ui/fields'
import type { SavedSparqlQuery } from '../types'

const DEFAULT_CATEGORY = 'Recherche personnalisée'

interface SaveQueryModalProps {
  isOpen: boolean
  onClose: () => void
  queryText: string
  initialTitle?: string
  initialDescription?: string
  queryId?: number | ''
  /** True when the backend lists `edit` for the selected query: only then can "update" run (RM-QC-06). */
  canUpdate?: boolean
  onSuccess?: (newId: number) => void
}

/**
 * Saves a SPARQL query as a new one, or updates the selected one when `canUpdate` is true.
 * No author field: the server sets it from the account (RM-CTB-03, RM-QC-06). A visitor sees a
 * sign-in prompt instead of the form.
 */
export const SaveQueryModal: React.FC<SaveQueryModalProps> = ({ isOpen, onClose, ...rest }) =>
  isOpen ? <SaveQueryDialog onClose={onClose} {...rest} /> : null

function SaveQueryDialog({
  onClose,
  queryText,
  initialTitle = '',
  initialDescription = '',
  queryId,
  canUpdate = false,
  onSuccess,
}: Omit<SaveQueryModalProps, 'isOpen'>) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const { isSignedIn } = useSession()
  const updatable = canUpdate && queryId !== undefined && queryId !== ''
  const [title, setTitle] = useState(initialTitle)
  const [description, setDescription] = useState(initialDescription)
  const [category, setCategory] = useState(DEFAULT_CATEGORY)
  const [saveMode, setSaveMode] = useState<'update' | 'create'>(updatable ? 'update' : 'create')
  const [titleError, setTitleError] = useState<string>()
  // Remounts the summary on each failed submit, so it takes the focus again (RGAA).
  const [attempt, setAttempt] = useState(0)
  const formId = useId()

  const save = useMutation({
    mutationFn: (): Promise<SavedSparqlQuery> => {
      const input = {
        title: title.trim(),
        description: description.trim() || undefined,
        query_text: queryText.trim(),
        category: category.trim() || DEFAULT_CATEGORY,
      }
      return saveMode === 'update' && updatable ? updateSavedQuery(Number(queryId), input) : createSavedQuery(input)
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: [SAVED_QUERIES_ROOT] })
      onSuccess?.(saved.id)
      onClose()
    },
  })

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!title.trim()) {
      setTitleError(t.sparql.titleRequired)
      setAttempt((count) => count + 1)
      return
    }
    setTitleError(undefined)
    save.mutate()
  }

  const titleId = `${formId}-title`
  const showForm = isSignedIn
  const heading = saveMode === 'update' && updatable ? t.sparql.updateModalTitle : t.sparql.saveModalTitle

  return (
    <Dialog
      open
      onClose={() => {
        if (!save.isPending) onClose()
      }}
      title={heading}
      closeLabel={t.common.close}
      footer={
        showForm && (
          <>
            <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
              {t.common.cancel}
            </Button>
            <Button type="submit" form={formId} icon={Bookmark} isLoading={save.isPending}>
              {saveMode === 'update' && updatable ? t.sparql.updateBtn : t.common.save}
            </Button>
          </>
        )
      }
    >
      <SessionGate signInMessage={t.sparql.signInToSave}>
        <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
          {titleError && (
            <ErrorSummary
              key={attempt}
              title={t.sparql.formErrorsTitle}
              errors={[{ fieldId: titleId, message: titleError }]}
            />
          )}
          {save.error && <Alert tone="error">{getApiErrorMessage(save.error, t)}</Alert>}
          {updatable && (
            <fieldset className="m-0 flex min-w-0 gap-2 border-0 p-0">
              <legend className="sr-only">{t.sparql.saveModeLabel}</legend>
              <Button
                variant={saveMode === 'update' ? 'primary' : 'secondary'}
                size="sm"
                icon={RefreshCw}
                aria-pressed={saveMode === 'update'}
                onClick={() => setSaveMode('update')}
              >
                {t.sparql.updateModeBtn}
              </Button>
              <Button
                variant={saveMode === 'create' ? 'primary' : 'secondary'}
                size="sm"
                icon={Plus}
                aria-pressed={saveMode === 'create'}
                onClick={() => setSaveMode('create')}
              >
                {t.sparql.copyModeBtn}
              </Button>
            </fieldset>
          )}
          <TextField
            id={titleId}
            label={t.sparql.queryTitleLabel}
            required
            maxLength={200}
            placeholder={t.sparql.queryTitlePlaceholder}
            value={title}
            error={titleError}
            onChange={(event) => setTitle(event.target.value)}
          />
          <TextAreaField
            label={t.sparql.queryGoalLabel}
            rows={3}
            placeholder={t.sparql.queryGoalPlaceholder}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <FieldShell fieldId={`${formId}-category`} label={t.sparql.categoryLabel}>
            <select
              id={`${formId}-category`}
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className={`${controlClass} border-rule-strong`}
            >
              <option value="Recherche personnalisée">{t.sparql.catCustom}</option>
              <option value="Faune terrestre">{t.sparql.catLandFauna}</option>
              <option value="Faune marine">{t.sparql.catMarineFauna}</option>
              <option value="Oiseaux & Rapaces">{t.sparql.catBirds}</option>
              <option value="Cooccurrences">{t.sparql.catCooccurrences}</option>
              <option value="Géographie & Lieux">{t.sparql.catGeography}</option>
              <option value="Alimentation & Usages">{t.sparql.catFoodDiet}</option>
            </select>
          </FieldShell>
        </form>
      </SessionGate>
    </Dialog>
  )
}
