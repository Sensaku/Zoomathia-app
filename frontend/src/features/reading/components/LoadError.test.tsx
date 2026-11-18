import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vite-plus/test'
import { ApiError } from '../../../api/errors'
import { expectNoAxeViolations } from '../../../test/axe'
import { renderWithProviders } from '../../accounts/components/testSupport'
import { LoadError } from './LoadError'

describe('LoadError', () => {
  it('rule 9: says the failure with the translated message, never the raw one, and retries on click', async () => {
    const onRetry = vi.fn()
    const { container } = renderWithProviders(
      <LoadError error={new ApiError(502, 'raw upstream detail')} onRetry={onRetry} />,
    )

    expect(screen.getByRole('alert')).not.toHaveTextContent('raw upstream detail')
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    await expectNoAxeViolations(container)
  })

  it('while the retry runs, the button is busy and disabled', () => {
    renderWithProviders(<LoadError error={new ApiError(502, 'x')} onRetry={() => undefined} isRetrying />)

    const button = screen.getByRole('button', { name: 'Réessayer' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })

  it('a warning keeps the page usable: it is a status, not an alert', () => {
    renderWithProviders(<LoadError error={new ApiError(504, 'x')} onRetry={() => undefined} tone="warning" />)

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
