import { useId } from 'react'
import { useI18n } from '../../../i18n/I18nContext'

/** The reading text sizes. */
export type TextSize = 'normal' | 'large' | 'xlarge'

/** Props of {@link TextSizeToggle}. */
export interface TextSizeToggleProps {
  /** The size in use. */
  value: TextSize
  /** Called with the size the reader chose. */
  onChange: (size: TextSize) => void
}

/**
 * The text size buttons of the reader and the studio: a group named by its visible label, one pressed
 * button (`aria-pressed`), shown bold and underlined so that colour is not the only cue.
 */
export function TextSizeToggle({ value, onChange }: TextSizeToggleProps) {
  const { t } = useI18n()
  const labelId = useId()
  const sizes: { size: TextSize; label: string; title: string }[] = [
    { size: 'normal', label: 'A', title: t.work.sizeNormal },
    { size: 'large', label: 'A+', title: t.work.sizeLarge },
    { size: 'xlarge', label: 'A++', title: t.work.sizeXLarge },
  ]
  return (
    <fieldset
      aria-labelledby={labelId}
      className="m-0 flex shrink-0 items-center space-x-1 rounded-none border border-rule-strong bg-paper-sunken p-1 text-xs"
    >
      <span id={labelId} className="px-1 text-[11px] font-semibold text-ink-muted">
        {t.work.textSize}
      </span>
      {sizes.map(({ size, label, title }) => (
        <button
          key={size}
          type="button"
          aria-pressed={value === size}
          onClick={() => onChange(size)}
          title={title}
          className={`rounded-none px-2 py-0.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
            value === size
              ? 'bg-accent font-extrabold text-white underline underline-offset-2'
              : 'font-medium text-ink hover:bg-white'
          }`}
        >
          {label}
        </button>
      ))}
    </fieldset>
  )
}
