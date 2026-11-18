import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { fetchAnnotationPage } from '../../../api/client'
import { getApiErrorMessage } from '../../../api/errors'
import { useI18n } from '../../../i18n/I18nContext'
import { Alert, Button } from '../../../shared/ui'
import { fill } from '../lib/fill'
import { contributionKeys } from '../queryKeys'
import { StagedAnnotationCard } from './StagedAnnotationCard'

/** Most rejected annotations of a paragraph the list asks for (the server allows up to 200). */
const REJECTED_LIMIT = 50

/** Props of {@link RejectedAnnotationList}. */
export interface RejectedAnnotationListProps {
  /** IRI of the active paragraph: the list holds its rejected annotations only. */
  paragraphUri: string
}

/**
 * The "Rejetées" tab of the studio: the rejected annotations of one paragraph with their public
 * reason (RM-ACC-04). They never come with the section and are never highlighted in the text, so
 * the cards cannot be followed. It owns its query and shows its loading, failure (never read as
 * "nothing rejected", rule 9) and empty states. When the server holds more than the page, it says
 * so (rule 10).
 */
export function RejectedAnnotationList({ paragraphUri }: RejectedAnnotationListProps) {
  const { t } = useI18n()
  const text = t.contributions.rejectedList
  const params = { paragraph_uri: paragraphUri, status: 'rejected', limit: REJECTED_LIMIT } as const
  const list = useQuery({
    queryKey: contributionKeys.annotationPage(params),
    queryFn: ({ signal }) => fetchAnnotationPage(params, signal),
  })

  if (list.isPending) {
    return (
      <output className="flex items-center justify-center gap-2 p-4 font-ui text-sm text-ink-muted">
        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        {text.loading}
      </output>
    )
  }
  if (list.isError) {
    return (
      <div className="space-y-2">
        <Alert tone="error">{getApiErrorMessage(list.error, t)}</Alert>
        <Button variant="secondary" size="sm" onClick={() => void list.refetch()}>
          {text.retry}
        </Button>
      </div>
    )
  }

  const { items, total } = list.data
  if (items.length === 0) {
    return <p className="p-4 text-center font-ui text-sm text-ink-muted italic">{text.empty}</p>
  }
  return (
    <div className="space-y-2.5">
      {items.map((annotation) => (
        <StagedAnnotationCard
          key={annotation.id}
          annotation={annotation}
          canPin={false}
          isPinned={false}
          onTogglePin={() => undefined}
        />
      ))}
      {total > items.length && (
        <Alert tone="info">{fill(text.partial, { shown: String(items.length), total: String(total) })}</Alert>
      )}
    </div>
  )
}
