import { ChevronDown, LogIn, LogOut, RefreshCw, User } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useI18n } from '../../../i18n'
import { useLogout } from '../hooks/useAuthMutations'
import { useSession } from '../hooks/useSession'
import { loginLink } from '../lib/loginLink'

/** Props of {@link AccountMenu}. */
export interface AccountMenuProps {
  /** `desktop`: a disclosure panel in the bar. `mobile`: plain entries for the mobile menu. */
  variant?: 'desktop' | 'mobile'
  /** Called when the user picks an entry, so that the mobile menu can close. */
  onNavigate?: () => void
}

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-on-chrome'
const entryClass = `flex w-full items-center gap-2 px-3 py-2 text-left font-ui text-sm text-on-chrome hover:bg-chrome-line ${focusRing}`

/** Logout with its failure message: a failed logout leaves the user signed in and must say so. */
function useSignOut(onDone?: () => void) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const logout = useLogout()
  const signOut = () =>
    logout.mutate(undefined, {
      onSuccess: () => {
        onDone?.()
        // The account page is not for visitors.
        if (location.pathname === '/account') void navigate('/', { replace: true })
      },
    })
  return { signOut, isPending: logout.isPending, failure: logout.isError ? t.nav.signOutFailed : null }
}

/** Account entry of the navbar: a sign-in link for a visitor, the account menu when signed in. */
export function AccountMenu({ variant = 'desktop', onNavigate }: AccountMenuProps) {
  const { t } = useI18n()
  const location = useLocation()
  const { user, isSignedIn, isLoading, isError, refetch } = useSession()
  // The panel is open for one place only: a route change closes it without an effect.
  const place = location.pathname + location.search
  const [openAt, setOpenAt] = useState<string | null>(null)
  const open = openAt === place
  const setOpen = (value: boolean) => setOpenAt(value ? place : null)
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const { signOut, isPending, failure } = useSignOut(() => {
    setOpen(false)
    onNavigate?.()
  })

  // A click or the focus moving outside the menu closes it; Escape closes it and refocuses the button.
  useEffect(() => {
    if (!open) return
    const closeIfOutside = (event: Event) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpenAt(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpenAt(null)
      buttonRef.current?.focus()
    }
    document.addEventListener('mousedown', closeIfOutside)
    document.addEventListener('focusin', closeIfOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeIfOutside)
      document.removeEventListener('focusin', closeIfOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  if (isLoading) return null

  // The session could not be checked: a "Sign in" link would be wrong, the user may be signed in.
  if (isError && !isSignedIn) {
    return (
      <button
        type="button"
        onClick={refetch}
        className={`flex items-center gap-1.5 px-3 py-2 font-ui text-sm font-medium text-on-chrome hover:bg-chrome-raised ${focusRing}`}
      >
        <RefreshCw aria-hidden="true" className="h-4 w-4" />
        {t.auth.session.unavailableRetry}
      </button>
    )
  }

  if (!isSignedIn || !user) {
    return (
      <Link
        to={loginLink(location, false)}
        onClick={onNavigate}
        className={`flex items-center gap-1.5 px-3 py-2 font-ui text-sm font-medium text-on-chrome hover:bg-chrome-raised ${focusRing}`}
      >
        <LogIn aria-hidden="true" className="h-4 w-4" />
        {t.nav.signIn}
      </Link>
    )
  }

  if (variant === 'mobile') {
    return (
      <div className="space-y-1">
        <p className="px-3 py-1.5 font-ui text-xs font-semibold tracking-wider text-on-chrome-muted uppercase">
          {user.display_name}
        </p>
        <Link to="/account" onClick={onNavigate} className={entryClass}>
          <User aria-hidden="true" className="h-4 w-4" />
          {t.nav.myAccount}
        </Link>
        <button type="button" onClick={signOut} disabled={isPending} className={entryClass}>
          <LogOut aria-hidden="true" className="h-4 w-4" />
          {t.nav.signOut}
        </button>
        {failure && (
          <p role="alert" className="px-3 font-ui text-sm text-on-chrome">
            {failure}
          </p>
        )}
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${t.nav.accountMenu}: ${user.display_name}`}
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 border border-chrome-line bg-chrome-raised px-3 py-2 font-ui text-sm font-medium text-on-chrome ${focusRing}`}
      >
        <User aria-hidden="true" className="h-4 w-4" />
        <span className="max-w-40 truncate">{user.display_name}</span>
        <ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          id={panelId}
          className="absolute top-full right-0 z-50 mt-1 w-64 border border-chrome-line bg-chrome-raised py-2 shadow-2xl"
        >
          <div className="px-3 pb-2 font-ui">
            <p className="font-semibold break-words text-on-chrome">{user.display_name}</p>
            <p className="text-sm break-words text-on-chrome-muted">{user.affiliation}</p>
          </div>
          <Link to="/account" className={entryClass}>
            <User aria-hidden="true" className="h-4 w-4" />
            {t.nav.myAccount}
          </Link>
          <button type="button" onClick={signOut} disabled={isPending} className={entryClass}>
            <LogOut aria-hidden="true" className="h-4 w-4" />
            {t.nav.signOut}
          </button>
          {failure && (
            <p role="alert" className="px-3 pt-1 font-ui text-sm text-on-chrome">
              {failure}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
