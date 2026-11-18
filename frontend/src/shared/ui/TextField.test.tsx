import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it } from 'vite-plus/test'
import { expectNoAxeViolations } from '../../test/axe'
import { CheckboxField } from './CheckboxField'
import { TextAreaField, TextField } from './TextField'

describe('TextField', () => {
  it('links the hint and the error with aria-describedby and flags the field invalid', async () => {
    const { container } = render(<TextField label="Email" hint="Work address" error="Invalid" />)
    const input = screen.getByRole('textbox', { name: 'Email' })
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Work address Invalid')
    await expectNoAxeViolations(container)
  })

  it('has no aria-invalid and no description without hint or error', () => {
    render(<TextField label="Email" />)
    const input = screen.getByRole('textbox', { name: 'Email' })
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(input).not.toHaveAttribute('aria-describedby')
  })

  it('shows the required marker only when required, keeping the name clean', () => {
    const { rerender } = render(<TextField label="Email" />)
    expect(screen.queryByText('*')).not.toBeInTheDocument()
    rerender(<TextField label="Email" required />)
    expect(screen.getByText('*')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Email' })).toBeRequired()
  })

  it('uses the given id and forwards the ref to the control', () => {
    const ref = createRef<HTMLInputElement>()
    render(<TextField ref={ref} id="my-id" label="Email" />)
    expect(ref.current).toBe(screen.getByRole('textbox'))
    expect(ref.current?.id).toBe('my-id')
  })
})

describe('TextAreaField', () => {
  it('is wired like TextField', () => {
    const ref = createRef<HTMLTextAreaElement>()
    render(<TextAreaField ref={ref} label="Reason" error="Too long" />)
    const area = screen.getByRole('textbox', { name: 'Reason' })
    expect(area).toHaveAttribute('aria-invalid', 'true')
    expect(area).toHaveAccessibleDescription('Too long')
    expect(ref.current).toBe(area)
  })
})

describe('CheckboxField', () => {
  it('is labelled and described by its hint', () => {
    render(<CheckboxField label="Show pending" hint="Not yet reviewed" />)
    expect(screen.getByRole('checkbox', { name: 'Show pending' })).toHaveAccessibleDescription('Not yet reviewed')
  })
})
