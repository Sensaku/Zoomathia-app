import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vite-plus/test'
import { ConfirmDialog } from './ConfirmDialog'

const setup = (props: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) => {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <ConfirmDialog
      open
      title="Delete?"
      message="Cannot be undone"
      confirmLabel="Delete"
      cancelLabel="Cancel"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  )
  return { onConfirm, onCancel }
}

describe('ConfirmDialog', () => {
  it('starts on cancel and calls onConfirm or onCancel', async () => {
    const user = userEvent.setup()
    const { onConfirm, onCancel } = setup()
    // The close button of the header has the same name; the text button comes last.
    const cancel = screen.getAllByRole('button', { name: 'Cancel' }).at(-1)!
    expect(cancel).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    await user.click(cancel)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('cancels on Escape', async () => {
    const user = userEvent.setup()
    const { onCancel } = setup()
    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('blocks both actions and ignores Escape while pending', async () => {
    const user = userEvent.setup()
    const { onConfirm, onCancel } = setup({ isPending: true })
    const confirm = screen.getByRole('button', { name: 'Delete' })
    expect(confirm).toBeDisabled()
    expect(confirm).toHaveAttribute('aria-busy', 'true')
    await user.keyboard('{Escape}')
    expect(onCancel).not.toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('shows the error in an alert inside the dialog', () => {
    setup({ error: 'Refused', tone: 'danger' })
    expect(screen.getByRole('dialog')).toContainElement(screen.getByRole('alert'))
    expect(screen.getByRole('alert')).toHaveTextContent('Refused')
  })
})
