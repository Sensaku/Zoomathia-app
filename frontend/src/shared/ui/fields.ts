import { useId } from 'react'

/** Ids that link a control to its label, hint and error message. */
export function useFieldIds(id: string | undefined, hint?: string, error?: string) {
  const generated = useId()
  const fieldId = id ?? generated
  const hintId = hint ? `${fieldId}-hint` : undefined
  const errorId = error ? `${fieldId}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  return { fieldId, hintId, errorId, describedBy }
}

/** Shared control look: border in `rule-strong` (3:1 on paper), `danger` when invalid. */
export const controlClass =
  'block w-full border bg-paper px-3 py-2 font-ui text-base text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60'
