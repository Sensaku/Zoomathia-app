import { Pin, Tag } from 'lucide-react'
import { ConceptCategoryIcon } from '../../../components/ConceptCategoryBadge'
import type { ReadingSpan } from '../../../components/reading'
import { useI18n } from '../../../i18n'

/** Props of {@link PassageThemes}. */
export interface PassageThemesProps {
  /** The concepts of the passage that have no place in the text. */
  themes: ReadingSpan[]
  hoveredConcept?: string | null
  pinnedConcept?: string | null
  onHoverConcept?: (uri: string | null) => void
  onPinConcept?: (uri: string) => void
}

function themeClass(isPinned: boolean, isHovered: boolean) {
  if (isPinned) return 'border-accent-strong bg-accent text-white ring-2 ring-accent-strong'
  if (isHovered) return 'border-accent bg-accent text-white'
  return 'border-rule-strong bg-paper-sunken text-ink hover:border-accent'
}

/**
 * The themes of a passage, one toggle button each. Focus or hover previews the concept in the
 * text, Enter or a click pins it (`aria-pressed`): the keyboard path of the pointer shortcuts of
 * the highlighted words. The click is not stopped, so it also makes the paragraph active.
 */
export function PassageThemes({
  themes,
  hoveredConcept,
  pinnedConcept,
  onHoverConcept,
  onPinConcept,
}: PassageThemesProps) {
  const { t } = useI18n()
  if (themes.length === 0) return null

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-rule pb-3 select-none">
      <span className="mr-1 flex items-center space-x-1.5 text-xs font-bold tracking-wider text-ink-muted uppercase sm:text-sm">
        <Tag aria-hidden="true" className="h-4 w-4 shrink-0 text-accent" />
        <span>{t.work.globalThemes}</span>
      </span>
      {themes.map((sp) => {
        const isPinned = pinnedConcept === sp.concept
        const isHovered = hoveredConcept === sp.concept
        return (
          <button
            key={`theme-${sp.concept}`}
            type="button"
            aria-pressed={isPinned}
            onClick={() => onPinConcept?.(sp.concept)}
            onMouseEnter={() => onHoverConcept?.(sp.concept)}
            onFocus={() => onHoverConcept?.(sp.concept)}
            onMouseLeave={() => onHoverConcept?.(null)}
            onBlur={() => onHoverConcept?.(null)}
            className={`inline-flex cursor-pointer items-center space-x-1.5 rounded-none border px-3 py-1 text-xs font-semibold shadow-2xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:text-sm ${themeClass(isPinned, isHovered)}`}
            title={`${sp.label} (${sp.concept})`}
          >
            <ConceptCategoryIcon category={sp.category} className="h-3.5 w-3.5 shrink-0" />
            <span>{sp.label}</span>
            {isPinned && <Pin aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />}
          </button>
        )
      })}
    </div>
  )
}
