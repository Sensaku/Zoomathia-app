import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vite-plus/test'
import { expectNoAxeViolations } from '../test/axe'
import { Catalogue } from './Catalogue'

describe('Catalogue', () => {
  it('shows each token value read from the stylesheet, not a copy (rule 5)', () => {
    document.documentElement.style.setProperty('--color-ink', '#123456')
    try {
      render(<Catalogue />)
      expect(screen.getByText('#123456')).toBeInTheDocument()
    } finally {
      document.documentElement.style.removeProperty('--color-ink')
    }
  })

  it('has no axe violation', async () => {
    const { container } = render(<Catalogue />)
    await expectNoAxeViolations(container)
  })

  it('lists the tokens and opens a dialog without axe violation', async () => {
    const user = userEvent.setup()
    render(<Catalogue />)
    expect(screen.getByText('rule-strong')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open dialog' }))
    await expectNoAxeViolations(document.body)
    expect(screen.getByRole('dialog', { name: 'Sample dialog' })).toBeInTheDocument()
  })
})
