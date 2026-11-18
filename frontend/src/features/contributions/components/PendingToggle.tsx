import { useState } from 'react'
import { useI18n } from '../../../i18n/I18nContext'
import { CheckboxField } from '../../../shared/ui'
import { usePendingFilter } from '../hooks/usePendingFilter'

/**
 * Checkbox that shows or hides the unreviewed contributions (RM-ACC-03), wired to the URL.
 * React Router applies a URL change in a transition, a tick late: the box keeps its own state,
 * which switches at once and follows the URL whenever the URL changes (for example Back).
 */
export function PendingToggle() {
  const { t } = useI18n()
  const { includePending, setIncludePending } = usePendingFilter()
  const [checked, setChecked] = useState(includePending)
  const [lastUrlValue, setLastUrlValue] = useState(includePending)
  // Derived state during render (no effect): a new URL value replaces the local one.
  if (lastUrlValue !== includePending) {
    setLastUrlValue(includePending)
    setChecked(includePending)
  }
  return (
    <CheckboxField
      label={t.contributions.pendingFilter.label}
      hint={t.contributions.pendingFilter.hint}
      checked={checked}
      onChange={(event) => {
        setChecked(event.target.checked)
        setIncludePending(event.target.checked)
      }}
    />
  )
}
