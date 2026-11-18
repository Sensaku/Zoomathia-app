import { AlertCircle } from 'lucide-react'
import type { ReactNode } from 'react'

/** Props of {@link FieldShell}. */
interface FieldShellProps {
  fieldId: string
  label: string
  required?: boolean
  hint?: string
  hintId?: string
  error?: string
  errorId?: string
  children: ReactNode
}

/** Label, hint and error around a control: the part TextField and TextAreaField share. */
export function FieldShell({ fieldId, label, required, hint, hintId, error, errorId, children }: FieldShellProps) {
  return (
    <div className="font-ui">
      <label htmlFor={fieldId} className="mb-1 block text-sm font-medium text-ink">
        {label}
        {required && (
          <span className="text-danger" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {hint && (
        <p id={hintId} className="mb-1 text-sm text-ink-muted">
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p id={errorId} className="mt-1 flex items-start gap-1 text-sm font-medium text-danger">
          <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}
