import { forwardRef, type InputHTMLAttributes } from 'react'
import { useFieldIds } from './fields'

/** Props of {@link CheckboxField}. */
export interface CheckboxFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string
  hint?: string
}

/** Native checkbox with its label and an optional hint. The ref goes to the `<input>`. */
export const CheckboxField = forwardRef<HTMLInputElement, CheckboxFieldProps>(function CheckboxField(
  { label, hint, id, className = '', ...rest },
  ref,
) {
  const { fieldId, hintId } = useFieldIds(id, hint)
  return (
    <div className="flex items-start gap-2 font-ui">
      <input
        ref={ref}
        id={fieldId}
        type="checkbox"
        aria-describedby={hintId}
        className={`mt-1 h-4 w-4 accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}
        {...rest}
      />
      <div>
        <label htmlFor={fieldId} className="text-base text-ink">
          {label}
        </label>
        {hint && (
          <p id={hintId} className="text-sm text-ink-muted">
            {hint}
          </p>
        )}
      </div>
    </div>
  )
})
