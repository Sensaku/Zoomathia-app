import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { getApiErrorMessage } from '../../../api/errors'
import { useI18n } from '../../../i18n'
import { useDocumentTitle } from '../../../shared/lib/useDocumentTitle'
import { Alert, Button, ErrorSummary, TextField } from '../../../shared/ui'
import { useLogin } from '../hooks/useAuthMutations'
import { useSession } from '../hooks/useSession'
import { formText } from '../lib/formText'
import { safeNextPath } from '../lib/nextPath'

const EMAIL_ID = 'login-email'
const PASSWORD_ID = 'login-password'

interface LoginErrors {
  email?: string
  password?: string
}

/** The sign-in form. Checks the required fields, then signs in and follows the safe `next` path. */
function LoginForm() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const login = useLogin()
  const [errors, setErrors] = useState<LoginErrors>({})
  // A new key remounts the summary, so that it takes the focus again on a repeated failure.
  const [attempt, setAttempt] = useState(0)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const email = formText(data, 'email').trim()
    const password = formText(data, 'password')
    const next: LoginErrors = {}
    if (email === '') next.email = t.auth.emailRequired
    if (password === '') next.password = t.auth.passwordRequired
    setAttempt((count) => count + 1)
    setErrors(next)
    if (next.email || next.password) return
    login.mutate(
      { email, password },
      { onSuccess: () => navigate(safeNextPath(searchParams.get('next')), { replace: true }) },
    )
  }

  const summary = [
    errors.email ? { fieldId: EMAIL_ID, message: errors.email } : null,
    errors.password ? { fieldId: PASSWORD_ID, message: errors.password } : null,
  ].filter((item) => item !== null)

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-4">
      <ErrorSummary key={attempt} title={t.auth.errorsTitle} errors={summary} />
      {login.isError && <Alert tone="error">{getApiErrorMessage(login.error, t)}</Alert>}
      <TextField
        id={EMAIL_ID}
        name="email"
        type="email"
        label={t.auth.emailLabel}
        autoComplete="email"
        required
        error={errors.email}
      />
      <TextField
        id={PASSWORD_ID}
        name="password"
        type="password"
        label={t.auth.passwordLabel}
        autoComplete="current-password"
        required
        error={errors.password}
      />
      <Button type="submit" isLoading={login.isPending}>
        {t.auth.login.submit}
      </Button>
      <p className="font-ui text-sm text-ink-muted">{t.auth.login.forgot}</p>
    </form>
  )
}

/** Login page (`/login`). A signed-in user sees a notice instead of the form: no redirect, so no loop. */
export function LoginPage() {
  const { t } = useI18n()
  useDocumentTitle(t.auth.login.title)
  const { isSignedIn } = useSession()
  return (
    <div className="mx-auto max-w-md py-8">
      <h1 className="font-display mb-6 text-2xl text-ink">{t.auth.login.title}</h1>
      {isSignedIn ? (
        <Alert tone="info">
          <p>{t.auth.login.alreadySignedIn}</p>
          <Link to="/account" className="font-ui text-accent-strong underline">
            {t.auth.login.goToAccount}
          </Link>
        </Alert>
      ) : (
        <LoginForm />
      )}
    </div>
  )
}
