import { Link, useLocation } from 'react-router-dom'
import { useI18n } from '../../../i18n'
import { Alert } from '../../../shared/ui'
import { loginLink } from '../lib/loginLink'

/** Props of {@link SignInPrompt}. */
export interface SignInPromptProps {
  /** What signing in allows, for example "Sign in to propose a term." */
  message: string
  className?: string
}

/**
 * Shown to a visitor instead of a contribution form. Its link leads to the login page and
 * back to the current path, search and hash afterwards.
 */
export function SignInPrompt({ message, className }: SignInPromptProps) {
  const { t } = useI18n()
  const location = useLocation()
  return (
    <Alert tone="info" isStatic className={className}>
      <p>{message}</p>
      <Link to={loginLink(location)} className="font-ui text-accent-strong underline">
        {t.auth.signInPrompt}
      </Link>
    </Alert>
  )
}
