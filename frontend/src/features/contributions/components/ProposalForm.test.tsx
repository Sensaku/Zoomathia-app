import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vite-plus/test'
import { SESSION, renderWithProviders } from '../../accounts/components/testSupport'
import { ProposalForm } from './ProposalForm'

function setup(session: typeof SESSION | null = SESSION) {
  return renderWithProviders(<ProposalForm onShowPending={() => {}} />, { session })
}

describe('ProposalForm', () => {
  it('RM-CTB-03: shows a visitor the sign-in prompt and no form', () => {
    setup(null)
    expect(screen.getByText('Connectez-vous pour proposer un terme.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Soumettre la proposition' })).toBeNull()
  })

  it('moves the focus to the error summary again on each failed submit, even with the same errors (RGAA)', async () => {
    const user = userEvent.setup()
    setup()
    const submit = screen.getByRole('button', { name: 'Soumettre la proposition' })
    await user.click(submit)
    const summaryOf = () => screen.getByRole('heading', { name: 'Le formulaire contient des erreurs' }).parentElement
    expect(summaryOf()).toHaveFocus()
    await user.click(submit)
    expect(summaryOf()).toHaveFocus()
  })
})
