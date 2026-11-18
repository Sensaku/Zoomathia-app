import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vite-plus/test'
import { Alert } from './Alert'
import { Button } from './Button'

describe('Button', () => {
  it('is type="button" by default and forwards its ref', () => {
    const ref = createRef<HTMLButtonElement>()
    render(<Button ref={ref}>Save</Button>)
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button')
    expect(ref.current).toBe(screen.getByRole('button'))
  })

  it('keeps its label, is busy and ignores clicks while loading', async () => {
    const onClick = vi.fn()
    render(
      <Button isLoading onClick={onClick}>
        Save
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    await userEvent.setup().click(button)
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('Alert', () => {
  it('uses role alert for errors and status for the other tones', () => {
    const { rerender } = render(<Alert tone="error">Failed</Alert>)
    expect(screen.getByRole('alert')).toHaveTextContent('Failed')
    rerender(<Alert tone="success">Done</Alert>)
    expect(screen.getByRole('status')).toHaveTextContent('Done')
  })

  it('renders no live role when static', () => {
    render(
      <Alert tone="error" isStatic>
        Failed
      </Alert>,
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
