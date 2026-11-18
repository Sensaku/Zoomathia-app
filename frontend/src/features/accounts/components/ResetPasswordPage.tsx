import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { getApiErrorMessage } from '../../../api/errors'
import { useI18n } from '../../../i18n'
import { useDocumentTitle } from '../../../shared/lib/useDocumentTitle'
import { Alert, Button, ErrorSummary, TextField } from '../../../shared/ui'
import { useResetPassword } from '../hooks/useAuthMutations'
import { formText } from '../lib/formText'
import { validateNewPassword, type NewPasswordErrors } from '../lib/validateNewPassword'

const NEW_ID = 'reset-new'
const CONFIRM_ID = 'reset-confirm'

/** The reset token of a URL fragment (`#token=...`), or an empty string. */
function readToken(hash: string): string {
  return new URLSearchParams(hash.slice(1)).get('token') ?? ''
}

/**
 * Reset page (`/reset-password`). The administrator's token travels in the URL fragment, so it
 * never reaches a server log. It is read once, then removed from the router location (and so
 * from the address bar and the history entry): no link built from the location can copy it.
 */
export function ResetPasswordPage() {
  const { t } = useI18n()
  useDocumentTitle(t.auth.reset.title)
  const location = useLocation()
  const navigate = useNavigate()
  const [token] = useState(() => readToken(location.hash))
  const reset = useResetPassword()
  const [attempt, setAttempt] = useState(0)
  const [errors, setErrors] = useState<NewPasswordErrors>({})

  useEffect(() => {
    if (location.hash === '') return
    void navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: location.state })
  }, [location, navigate])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const newPassword = formText(data, 'new')
    const next = validateNewPassword(t, newPassword, formText(data, 'confirm'))
    setAttempt((count) => count + 1)
    setErrors(next)
    if (next.newPassword || next.confirm) return
    reset.mutate({ token, new_password: newPassword })
  }

  const summary = [
    errors.newPassword ? { fieldId: NEW_ID, message: errors.newPassword } : null,
    errors.confirm ? { fieldId: CONFIRM_ID, message: errors.confirm } : null,
  ].filter((item) => item !== null)

  let body: ReactNode
  if (token === '') {
    body = (
      <Alert tone="warning" title={t.auth.reset.missingTitle}>
        {t.auth.reset.missingText}
      </Alert>
    )
  } else if (reset.isSuccess) {
    body = (
      <Alert tone="success">
        <p>{t.auth.reset.success}</p>
        <Link to="/login" className="font-ui text-accent-strong underline">
          {t.auth.reset.goToLogin}
        </Link>
      </Alert>
    )
  } else {
    body = (
      <form noValidate onSubmit={handleSubmit} className="space-y-4">
        <ErrorSummary key={attempt} title={t.auth.errorsTitle} errors={summary} />
        {reset.isError && <Alert tone="error">{getApiErrorMessage(reset.error, t)}</Alert>}
        <TextField
          id={NEW_ID}
          name="new"
          type="password"
          label={t.auth.password.new}
          hint={t.auth.newPasswordHint}
          autoComplete="new-password"
          required
          error={errors.newPassword}
        />
        <TextField
          id={CONFIRM_ID}
          name="confirm"
          type="password"
          label={t.auth.confirmLabel}
          autoComplete="new-password"
          required
          error={errors.confirm}
        />
        <Button type="submit" isLoading={reset.isPending}>
          {t.auth.reset.submit}
        </Button>
      </form>
    )
  }

  return (
    <div className="mx-auto max-w-md py-8">
      <h1 className="font-display mb-6 text-2xl text-ink">{t.auth.reset.title}</h1>
      {body}
    </div>
  )
}
