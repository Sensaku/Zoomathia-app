import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vite-plus/test'
import { expectNoAxeViolations } from '../../test/axe'
import { Dialog } from './Dialog'

function Harness({ onClose = vi.fn(), withInitial = false }: { onClose?: () => void; withInitial?: boolean }) {
  const [open, setOpen] = useState(false)
  const initial = useRef<HTMLInputElement>(null)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Dialog
        open={open}
        onClose={() => {
          onClose()
          setOpen(false)
        }}
        title="Edit"
        description="Change the value"
        closeLabel="Close"
        initialFocusRef={withInitial ? initial : undefined}
        footer={<button type="button">Save</button>}
      >
        <input aria-label="First" />
        <input ref={initial} aria-label="Second" />
      </Dialog>
    </>
  )
}

describe('Dialog', () => {
  it('is a labelled, described modal and has no axe violation', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Open' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleDescription('Change the value')
    await expectNoAxeViolations(document.body)
  })

  it('moves the focus to the first focusable element, or to the initial ref', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Open' }))
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
    unmount()
    render(<Harness withInitial />)
    await user.click(screen.getByRole('button', { name: 'Open' }))
    expect(screen.getByRole('textbox', { name: 'Second' })).toHaveFocus()
  })

  it('keeps Tab and Shift+Tab inside', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Open' }))
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
  })

  it('closes with Escape and gives the focus back to the opener', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    const opener = screen.getByRole('button', { name: 'Open' })
    await user.click(opener)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('does not close on a backdrop click and locks the page scroll while open', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: 'Open' }))
    expect(document.body.style.overflow).toBe('hidden')
    await user.click(screen.getByRole('dialog').parentElement as HTMLElement)
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(document.body.style.overflow).toBe('')
  })
})
