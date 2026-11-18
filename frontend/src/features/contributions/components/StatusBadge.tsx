import { CheckCircle2, Clock, XCircle, type LucideIcon } from 'lucide-react'
import { useI18n } from '../../../i18n/I18nContext'
import type { ContributionStatus } from '../../../types'

const STYLES: Record<ContributionStatus, { icon: LucideIcon; classes: string }> = {
  pending: { icon: Clock, classes: 'border-warning bg-warning-soft text-warning' },
  validated: { icon: CheckCircle2, classes: 'border-success bg-success-soft text-success' },
  rejected: { icon: XCircle, classes: 'border-danger bg-danger-soft text-danger' },
}

/**
 * Review status of a contribution (RM-MOD-01, RM-ACC-03): an icon and the translated label,
 * so the colour is never the only cue.
 */
export function StatusBadge({ status }: { status: ContributionStatus }) {
  const { t } = useI18n()
  const { icon: Icon, classes } = STYLES[status]
  return (
    <span className={`inline-flex items-center gap-1 border px-2 py-0.5 font-ui text-sm font-medium ${classes}`}>
      <Icon aria-hidden="true" className="h-4 w-4" />
      {t.contributions.status[status]}
    </span>
  )
}
