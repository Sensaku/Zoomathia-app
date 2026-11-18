/** Accounts feature: session state, authentication hooks and the safe `next` redirect. */

export {
  SESSION_KEY,
  SESSION_EXPIRED_KEY,
  VIEWER_QUERY_ROOTS,
  createSessionBridge,
  resetViewerQueries,
  markSessionExpired,
  clearSessionExpired,
} from './session'
export type { ViewerQueryRoot } from './session'
export { useSession } from './hooks/useSession'
export type { UseSession } from './hooks/useSession'
export { useSessionExpired } from './hooks/useSessionExpired'
export type { UseSessionExpired } from './hooks/useSessionExpired'
export { useLogin, useLogout, useChangePassword, useResetPassword } from './hooks/useAuthMutations'
export { safeNextPath } from './lib/nextPath'
export { AccountMenu } from './components/AccountMenu'
export type { AccountMenuProps } from './components/AccountMenu'
export { AccountPage } from './components/AccountPage'
export { LoginPage } from './components/LoginPage'
export { PasswordChangeForm } from './components/PasswordChangeForm'
export { ResetPasswordPage } from './components/ResetPasswordPage'
export { SessionExpiredNotice } from './components/SessionExpiredNotice'
export { SessionGate } from './components/SessionGate'
export type { SessionGateProps } from './components/SessionGate'
export { SignInPrompt } from './components/SignInPrompt'
export type { SignInPromptProps } from './components/SignInPrompt'
