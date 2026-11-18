import { AlertCircle, AlertTriangle, CheckCircle2, Info, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/** Tone of an {@link Alert}. */
export type AlertTone = 'info' | 'success' | 'warning' | 'error'

/** Props of {@link Alert}. */
export interface AlertProps {
  tone?: AlertTone
  title?: string
  children?: ReactNode
  /** Renders without a live role, for a notice that is already on the page at load. */
  isStatic?: boolean
  className?: string
}

const tones: Record<AlertTone, { icon: LucideIcon; box: string; iconColor: string }> = {
  info: { icon: Info, box: 'border-rule-strong bg-paper-raised', iconColor: 'text-ink-muted' },
  success: { icon: CheckCircle2, box: 'border-success bg-success-soft', iconColor: 'text-success' },
  warning: { icon: AlertTriangle, box: 'border-warning bg-warning-soft', iconColor: 'text-warning' },
  error: { icon: AlertCircle, box: 'border-danger bg-danger-soft', iconColor: 'text-danger' },
}

/**
 * Message box. The tone is carried by an icon as well as the colour. `error` uses
 * `role="alert"`, the other tones `role="status"`; `isStatic` drops the role.
 */
export function Alert({ tone = 'info', title, children, isStatic = false, className = '' }: AlertProps) {
  const { icon: Icon, box, iconColor } = tones[tone]
  const role = isStatic ? undefined : tone === 'error' ? 'alert' : 'status'
  return (
    <div role={role} className={`flex gap-3 border p-3 font-ui text-ink ${box} ${className}`}>
      <Icon aria-hidden="true" className={`mt-0.5 h-5 w-5 shrink-0 ${iconColor}`} />
      <div className="text-base">
        {title && <p className="font-semibold">{title}</p>}
        {children}
      </div>
    </div>
  )
}
