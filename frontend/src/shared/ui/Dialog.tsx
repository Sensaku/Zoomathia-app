import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

/** Props of {@link Dialog}. */
export interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: ReactNode
  /** Action buttons, shown under the content. */
  footer?: ReactNode
  /** Accessible name of the close button. */
  closeLabel: string
  /** Element to focus on open; the first focusable element otherwise. */
  initialFocusRef?: RefObject<HTMLElement | null>
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Modal dialog. Implemented with a portal and our own focus handling, not the native
 * `<dialog>`: jsdom 31 has no `showModal()`, so the native element could not be tested.
 *
 * On open, focus moves inside (the `initialFocusRef`, else the first focusable element). Tab
 * and Shift+Tab loop inside. Escape closes. On close, focus goes back to the element that had
 * it before. The page behind does not scroll. A click on the backdrop does nothing, so a
 * form never loses its input by accident.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  closeLabel,
  initialFocusRef,
}: DialogProps) {
  const panelRef = useRef<HTMLDialogElement>(null)
  const onCloseRef = useRef(onClose)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    if (!panel) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusables = () => Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
    ;(initialFocusRef?.current ?? focusables()[0] ?? panel).focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      const first = items[0] ?? panel
      const last = items[items.length - 1] ?? panel
      const active = document.activeElement
      if (!panel.contains(active)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      previous?.focus()
    }
  }, [open, initialFocusRef])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div aria-hidden="true" className="absolute inset-0 bg-ink/60" />
      {/* `open` without showModal(): we own the modal behaviour; the tag gives the dialog role. */}
      <dialog
        open
        ref={panelRef}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className="relative m-0 flex max-h-full w-full max-w-lg flex-col border border-rule-strong bg-paper font-ui text-ink shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-rule p-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-sm text-ink-muted">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label={closeLabel}
            onClick={onClose}
            className="p-1 text-ink-muted hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-accent"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-rule p-4">{footer}</div>}
      </dialog>
    </div>,
    document.body,
  )
}
