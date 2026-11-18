import { Loader2, type LucideIcon } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes } from 'react'

/** Visual weight of a {@link Button}. */
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

/** Props of {@link Button}. */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  /** Icon shown before the label (decorative). */
  icon?: LucideIcon
  /** Keeps the label, shows a spinner and blocks clicks. */
  isLoading?: boolean
}

const variants: Record<ButtonVariant, string> = {
  primary: 'border-accent bg-accent text-white hover:border-accent-strong hover:bg-accent-strong',
  secondary: 'border-rule-strong bg-paper text-ink hover:bg-paper-sunken',
  danger: 'border-danger bg-danger text-white hover:opacity-90',
  ghost: 'border-transparent bg-transparent text-accent-strong hover:bg-paper-sunken',
}

const sizes = { sm: 'px-2.5 py-1 text-sm', md: 'px-4 py-2 text-base' }

/**
 * Action button. Defaults to `type="button"` so it never submits a form by accident, and
 * forwards its ref. While `isLoading` it is disabled and marked `aria-busy`.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    icon: Icon,
    isLoading = false,
    type = 'button',
    disabled,
    className = '',
    children,
    ...rest
  },
  ref,
) {
  const Leading = isLoading ? Loader2 : Icon
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={`inline-flex items-center justify-center gap-2 border font-ui font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {Leading && <Leading aria-hidden="true" className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />}
      {children}
    </button>
  )
})
