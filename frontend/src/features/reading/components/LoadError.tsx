import { getApiErrorMessage } from '../../../api/errors'
import { useI18n } from '../../../i18n/I18nContext'
import { Alert, Button } from '../../../shared/ui'

/** Props of {@link LoadError}. */
export interface LoadErrorProps {
  /** The failure of the query: the message comes from `getApiErrorMessage`, never from `error.message`. */
  error: unknown
  /** Reloads what failed (the `refetch` of the query). */
  onRetry: () => void
  /** `warning` for a part of the page that can fail while the rest stays usable (a translation). */
  tone?: 'error' | 'warning'
  /** True while the retry runs (`isFetching` of the failed query): the button shows it and is disabled. */
  isRetrying?: boolean
}

/**
 * A failed query, said plainly with a retry button, in the place of the data. A failure must never
 * look like an empty result (rule 9).
 */
export function LoadError({ error, onRetry, tone = 'error', isRetrying = false }: LoadErrorProps) {
  const { t } = useI18n()
  return (
    <div className="space-y-2">
      <Alert tone={tone}>{getApiErrorMessage(error, t)}</Alert>
      <Button variant="secondary" size="sm" onClick={onRetry} isLoading={isRetrying}>
        {t.common.retry}
      </Button>
    </div>
  )
}
