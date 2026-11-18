import { useRef, useState, type FormEvent } from 'react'
import { ApiError, getApiErrorMessage } from '../../../api/errors'
import { useI18n } from '../../../i18n'
import { Alert, Button, ErrorSummary, TextField } from '../../../shared/ui'
import { useChangePassword } from '../hooks/useAuthMutations'
import { formText } from '../lib/formText'
import { validateNewPassword, type NewPasswordErrors } from '../lib/validateNewPassword'

const CURRENT_ID = 'password-current'
const NEW_ID = 'password-new'
const CONFIRM_ID = 'password-confirm'

type Errors = NewPasswordErrors & { current?: string }

/**
 * Password change for the signed-in account. The server closes the other sessions and keeps
 * this one. On this route a 403 `invalid_credentials` means the current password is wrong,
 * not a failed login, so it gets its own message.
 */
export function PasswordChangeForm() {
  const { t } = useI18n()
  const change = useChangePassword()
  const formRef = useRef<HTMLFormElement>(null)
  const [attempt, setAttempt] = useState(0)
  const [errors, setErrors] = useState<Errors>({})

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const current = formText(data, 'current')
    const newPassword = formText(data, 'new')
    const next: Errors = validateNewPassword(t, newPassword, formText(data, 'confirm'))
    if (current === '') next.current = t.auth.password.currentRequired
    setAttempt((count) => count + 1)
    setErrors(next)
    if (next.current || next.newPassword || next.confirm) return
    change.mutate(
      { current_password: current, new_password: newPassword },
      { onSuccess: () => formRef.current?.reset() },
    )
  }

  const summary = [
    errors.current ? { fieldId: CURRENT_ID, message: errors.current } : null,
    errors.newPassword ? { fieldId: NEW_ID, message: errors.newPassword } : null,
    errors.confirm ? { fieldId: CONFIRM_ID, message: errors.confirm } : null,
  ].filter((item) => item !== null)

  const wrongCurrent = change.error instanceof ApiError && change.error.code === 'invalid_credentials'

  return (
    <form ref={formRef} noValidate onSubmit={handleSubmit} className="space-y-4">
      <h2 className="font-display text-xl text-ink">{t.auth.password.title}</h2>
      <ErrorSummary key={attempt} title={t.auth.errorsTitle} errors={summary} />
      {change.isError && (
        <Alert tone="error">{wrongCurrent ? t.auth.password.currentWrong : getApiErrorMessage(change.error, t)}</Alert>
      )}
      {change.isSuccess && <Alert tone="success">{t.auth.password.success}</Alert>}
      <TextField
        id={CURRENT_ID}
        name="current"
        type="password"
        label={t.auth.password.current}
        autoComplete="current-password"
        required
        error={errors.current}
      />
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
      <Button type="submit" isLoading={change.isPending}>
        {t.auth.password.submit}
      </Button>
    </form>
  )
}
