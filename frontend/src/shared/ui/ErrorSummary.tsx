import { useEffect, useId, useRef, type MouseEvent } from 'react'

/** One entry of an {@link ErrorSummary}. */
export interface ErrorSummaryItem {
  fieldId: string
  message: string
}

/** Props of {@link ErrorSummary}. */
export interface ErrorSummaryProps {
  title: string
  errors: ErrorSummaryItem[]
  className?: string
}

/**
 * List of form errors shown after a failed submit (RGAA). It takes the focus when it appears
 * or when its errors change, and each item links to its field and focuses it.
 * Renders nothing when `errors` is empty.
 */
export function ErrorSummary({ title, errors, className = '' }: ErrorSummaryProps) {
  const ref = useRef<HTMLDivElement>(null)
  const headingId = useId()
  const signature = errors.map((e) => `${e.fieldId}:${e.message}`).join('|')

  useEffect(() => {
    if (signature) ref.current?.focus()
  }, [signature])

  if (errors.length === 0) return null

  // The default anchor jump does not focus a control in every browser.
  const focusField = (event: MouseEvent, fieldId: string) => {
    const field = document.getElementById(fieldId)
    if (!field) return
    event.preventDefault()
    field.focus()
  }

  return (
    <div
      ref={ref}
      tabIndex={-1}
      aria-labelledby={headingId}
      className={`border border-danger bg-danger-soft p-3 font-ui focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}
    >
      <h2 id={headingId} className="font-semibold text-danger">
        {title}
      </h2>
      <ul className="mt-1 list-disc pl-5">
        {errors.map((error) => (
          <li key={error.fieldId}>
            <a
              href={`#${error.fieldId}`}
              onClick={(event) => focusField(event, error.fieldId)}
              className="text-danger underline focus-visible:outline-2 focus-visible:outline-accent"
            >
              {error.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
