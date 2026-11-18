import type { ReactNode } from 'react'
import { useI18n } from '../../../i18n'
import { Alert, Button } from '../../../shared/ui'
import { useSession } from '../hooks/useSession'
import { SignInPrompt } from './SignInPrompt'

/** Props of {@link SessionGate}. */
export interface SessionGateProps {
  /** What signing in allows, shown to a visitor, for example "Sign in to propose a term." */
  signInMessage: string
  /** The contribution form: shown only to a signed-in user. */
  children: ReactNode
}

/**
 * Shows its children to a signed-in user only. While the session loads it says so; when the
 * session could not be checked (5xx, network) it says that and offers a retry, instead of
 * showing a sign-in prompt to someone who may be signed in (AGENTS.md rule 9). A session that
 * is already known stays in use when only a later reload failed: the form is not torn down.
 */
export function SessionGate({ signInMessage, children }: SessionGateProps) {
  const { t } = useI18n()
  const { isSignedIn, isLoading, isError, refetch } = useSession()
  if (isLoading) return <p className="font-ui text-ink-muted">{t.common.loading}</p>
  if (isError && !isSignedIn) {
    return (
      <Alert tone="error">
        <p>{t.auth.session.checkFailed}</p>
        <Button size="sm" variant="secondary" className="mt-2" onClick={refetch}>
          {t.auth.session.retry}
        </Button>
      </Alert>
    )
  }
  if (!isSignedIn) return <SignInPrompt message={signInMessage} />
  return <>{children}</>
}
