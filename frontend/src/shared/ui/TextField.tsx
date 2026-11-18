import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { FieldShell } from './FieldShell'
import { controlClass, useFieldIds } from './fields'

/** Props shared by {@link TextField} and {@link TextAreaField}. */
interface FieldProps {
  label: string
  hint?: string
  /** Error message; sets `aria-invalid` and is linked with `aria-describedby`. */
  error?: string
}

/** Props of {@link TextField}. */
export type TextFieldProps = FieldProps & InputHTMLAttributes<HTMLInputElement>

/** Props of {@link TextAreaField}. */
export type TextAreaFieldProps = FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>

/**
 * Labelled text input. The id comes from props or `useId`. A `*` marker shows only when
 * `required` is set. The ref goes to the `<input>`.
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, id, required, className = '', ...rest },
  ref,
) {
  const ids = useFieldIds(id, hint, error)
  return (
    <FieldShell {...ids} label={label} required={required} hint={hint} error={error}>
      <input
        ref={ref}
        id={ids.fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={ids.describedBy}
        className={`${controlClass} ${error ? 'border-danger' : 'border-rule-strong'} ${className}`}
        {...rest}
      />
    </FieldShell>
  )
})

/** Labelled multi-line input, wired like {@link TextField}. The ref goes to the `<textarea>`. */
export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(function TextAreaField(
  { label, hint, error, id, required, className = '', rows = 4, ...rest },
  ref,
) {
  const ids = useFieldIds(id, hint, error)
  return (
    <FieldShell {...ids} label={label} required={required} hint={hint} error={error}>
      <textarea
        ref={ref}
        id={ids.fieldId}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={ids.describedBy}
        className={`${controlClass} ${error ? 'border-danger' : 'border-rule-strong'} ${className}`}
        {...rest}
      />
    </FieldShell>
  )
})
