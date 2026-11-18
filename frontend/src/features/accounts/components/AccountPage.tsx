import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/lib/dates'
import { useDocumentTitle } from '../../../shared/lib/useDocumentTitle'
import { Alert } from '../../../shared/ui'
import { useSession } from '../hooks/useSession'
import { PasswordChangeForm } from './PasswordChangeForm'

/** Account page (`/account`): read-only profile (RM-CPT-05: the email is shown to its owner only) and password change. */
export function AccountPage() {
  const { t, language } = useI18n()
  useDocumentTitle(t.auth.account.title)
  const { user, isLoading, isError } = useSession()

  let body: ReactNode
  if (isLoading) {
    body = <output>{t.auth.account.loading}</output>
  } else if (user) {
    const rows = [
      [t.auth.account.name, user.display_name],
      [t.auth.account.affiliation, user.affiliation],
      [t.auth.account.email, user.email],
      [t.auth.account.role, user.role === 'admin' ? t.auth.account.roleAdmin : t.auth.account.roleContributor],
      [t.auth.account.memberSince, formatDate(user.activated_at ?? user.created_at, language)],
    ]
    body = (
      <>
        <section aria-labelledby="account-profile" className="mb-8">
          <h2 id="account-profile" className="font-display mb-3 text-xl text-ink">
            {t.auth.account.profileTitle}
          </h2>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 font-ui">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-ink-muted">{label}</dt>
                <dd className="text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <PasswordChangeForm />
      </>
    )
  } else if (isError) {
    body = <Alert tone="error">{t.auth.account.loadFailed}</Alert>
  } else {
    // A visitor: sign in first, then come back here.
    body = <Navigate to={`/login?next=${encodeURIComponent('/account')}`} replace />
  }

  return (
    <div className="mx-auto max-w-xl py-8">
      <h1 className="font-display mb-6 text-2xl text-ink">{t.auth.account.title}</h1>
      {body}
    </div>
  )
}
