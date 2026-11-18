import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vite-plus/test'
import { expectNoAxeViolations } from '../../../test/axe'
import { renderWithProviders } from '../../accounts/components/testSupport'
import { TextSizeToggle } from './TextSizeToggle'

describe('TextSizeToggle', () => {
  it('names the group and presses the button of the current size only', async () => {
    const { container } = renderWithProviders(<TextSizeToggle value="large" onChange={() => undefined} />)

    expect(screen.getByRole('group', { name: 'Taille :' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'A+' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'A' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'A++' })).toHaveAttribute('aria-pressed', 'false')
    await expectNoAxeViolations(container)
  })

  it('calls onChange with the size of the clicked button', async () => {
    const onChange = vi.fn()
    renderWithProviders(<TextSizeToggle value="normal" onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'A++' }))

    expect(onChange).toHaveBeenCalledWith('xlarge')
  })
})
