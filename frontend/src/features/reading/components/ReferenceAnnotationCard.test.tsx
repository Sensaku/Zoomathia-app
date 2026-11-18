import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vite-plus/test'
import { expectNoAxeViolations } from '../../../test/axe'
import { renderWithProviders } from '../../accounts/components/testSupport'
import { ReferenceAnnotationCard } from './ReferenceAnnotationCard'

function Harness({ onHoverChange }: { onHoverChange?: (hovered: boolean) => void }) {
  const [pinned, setPinned] = useState(false)
  return (
    <ReferenceAnnotationCard
      label="LION"
      conceptUri="http://thezoo/lion"
      occurrences={3}
      isPinned={pinned}
      onTogglePin={() => setPinned((value) => !value)}
      onHoverChange={onHoverChange}
    >
      <span>Animal</span>
    </ReferenceAnnotationCard>
  )
}

describe('ReferenceAnnotationCard', () => {
  it('the follow toggle works with the keyboard and exposes aria-pressed', async () => {
    const user = userEvent.setup()
    const { container } = renderWithProviders(<Harness />)

    const toggle = screen.getByRole('button', { name: 'lion' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await user.tab()
    expect(toggle).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await user.keyboard(' ')
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expectNoAxeViolations(container)
  })

  it('highlights the concept while the toggle is focused, and says the occurrences and the TheZoo link', async () => {
    const user = userEvent.setup()
    const onHoverChange = vi.fn()
    renderWithProviders(<Harness onHoverChange={onHoverChange} />)

    await user.tab()
    expect(onHoverChange).toHaveBeenLastCalledWith(true)
    await user.tab()
    expect(onHoverChange).toHaveBeenLastCalledWith(false)
    expect(screen.getByText('3 occurrence(s)')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /TheZoo/ })).toHaveAttribute('href', 'http://thezoo/lion')
  })
})
