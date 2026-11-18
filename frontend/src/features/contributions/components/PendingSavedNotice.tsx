import { useI18n } from '../../../i18n/I18nContext'
import { Alert, Button } from '../../../shared/ui'
import { usePendingFilter } from '../hooks/usePendingFilter'

/** Props of {@link PendingSavedNotice}. */
export interface PendingSavedNoticeProps {
  /** Called when the notice is closed, or after its button turned the filter on. */
  onDismiss: () => void
}

/**
 * Shown after the user saved an annotation while the unreviewed ones are hidden (RM-ACC-03): a
 * new annotation is pending, so the author would not see it. It says the annotation waits for a
 * peer review and offers to turn the filter on. The page shows it only while the filter is off.
 */
export function PendingSavedNotice({ onDismiss }: PendingSavedNoticeProps) {
  const { t } = useI18n()
  const { setIncludePending } = usePendingFilter()
  return (
    <Alert tone="success">
      <p>{t.contributions.pendingNotice.message}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => {
            setIncludePending(true)
            onDismiss()
          }}
        >
          {t.contributions.pendingFilter.label}
        </Button>
        <Button variant="secondary" size="sm" onClick={onDismiss}>
          {t.common.close}
        </Button>
      </div>
    </Alert>
  )
}
