import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vite-plus/test'
import { expectNoAxeViolations } from '../test/axe'
import { MultiSelectCombobox } from './MultiSelectCombobox'

const options = [
  { value: 'a', label: 'Aristote' },
  { value: 'b', label: 'Pline' },
]

const setup = () => {
  const onChange = vi.fn()
  const view = render(
    <MultiSelectCombobox
      label="Auteurs"
      placeholder="Choisir"
      options={options}
      selectedValues={[]}
      onChange={onChange}
    />,
  )
  return { onChange, ...view }
}

describe('MultiSelectCombobox', () => {
  it('filters the options with the search field and selects one with the pointer', async () => {
    const user = userEvent.setup()
    const { onChange } = setup()
    await user.click(screen.getByText('Choisir'))
    await user.type(screen.getByPlaceholderText('Filtrer dans la liste...'), 'plin')
    expect(screen.queryByText('Aristote')).not.toBeInTheDocument()
    await user.click(screen.getByText('Pline'))
    expect(onChange).toHaveBeenCalledWith(['b'])
  })

  // Known defect (RGAA 7.1, 12.8): the trigger is a clickable div, so a keyboard user cannot open
  // the list. Remove .fails when the component becomes a real combobox (jsx-a11y legacy override).
  it.fails('opens from the keyboard', async () => {
    const user = userEvent.setup()
    setup()
    await user.tab()
    await user.keyboard('{Enter}')
    expect(screen.getByPlaceholderText('Filtrer dans la liste...')).toBeInTheDocument()
  })

  it('has no axe violation once opened', async () => {
    const user = userEvent.setup()
    const { container } = setup()
    await user.click(screen.getByText('Choisir'))
    await expectNoAxeViolations(container)
  })
})
