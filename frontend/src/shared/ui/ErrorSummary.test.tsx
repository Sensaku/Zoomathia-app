import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vite-plus/test'
import { expectNoAxeViolations } from '../../test/axe'
import { ErrorSummary } from './ErrorSummary'
import { TextField } from './TextField'

const errors = [{ fieldId: 'email', message: 'Email is required' }]

describe('ErrorSummary', () => {
  it('renders nothing without errors', () => {
    const { container } = render(<ErrorSummary title="Errors" errors={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('takes the focus when it appears and when its errors change', () => {
    const { rerender } = render(<ErrorSummary title="Errors" errors={errors} />)
    const summary = screen.getByText('Errors').parentElement as HTMLElement
    expect(summary).toHaveFocus()
    expect(summary).toHaveAttribute('tabindex', '-1')
    ;(document.activeElement as HTMLElement).blur()
    rerender(<ErrorSummary title="Errors" errors={[...errors, { fieldId: 'name', message: 'Name is required' }]} />)
    expect(summary).toHaveFocus()
  })

  it('does not steal the focus on a rerender with the same errors', () => {
    const { rerender } = render(
      <>
        <ErrorSummary title="Errors" errors={errors} />
        <input aria-label="Other" />
      </>,
    )
    screen.getByRole('textbox', { name: 'Other' }).focus()
    rerender(
      <>
        <ErrorSummary title="Errors" errors={[...errors]} />
        <input aria-label="Other" />
      </>,
    )
    expect(screen.getByRole('textbox', { name: 'Other' })).toHaveFocus()
  })

  it('focuses the field when its link is clicked', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <>
        <ErrorSummary title="Errors" errors={errors} />
        <TextField id="email" label="Email" error="Email is required" />
      </>,
    )
    await user.click(screen.getByRole('link', { name: 'Email is required' }))
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveFocus()
    await expectNoAxeViolations(container)
  })
})
