import { Link, useLocation } from 'react-router-dom'
import { useI18n } from '../../../i18n'
import { Alert, Button } from '../../../shared/ui'
import { useSessionExpired } from '../hooks/useSessionExpired'
import { loginLink } from '../lib/loginLink'

/**
 * Notice shown under the navbar when a write was refused because the session ended. It links to
 * the login page and brings the user back to the current page afterwards.
 */
export function SessionExpiredNotice() {
  const { t } = useI18n()
  const location = useLocation()
  const { expired, dismiss } = useSessionExpired()
  if (!expired) return null
  return (
    <Alert tone="error" className="mx-2 mt-2 sm:mx-4 lg:mx-6">
      <p>{t.auth.expired.message}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Link to={loginLink(location)} className="text-accent-strong underline">
          {t.auth.expired.signInAgain}
        </Link>
        <Button size="sm" variant="secondary" onClick={dismiss}>
          {t.auth.expired.dismiss}
        </Button>
      </div>
    </Alert>
  )
}
