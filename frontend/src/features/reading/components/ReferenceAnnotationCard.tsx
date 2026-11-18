import { ExternalLink, Pin } from 'lucide-react'
import type { ReactNode } from 'react'
import { ConceptCategoryIcon } from '../../../components/ConceptCategoryBadge'
import { useI18n } from '../../../i18n/I18nContext'
import type { ConceptCategory } from '../../../types'

/** Props of {@link ReferenceAnnotationCard}. */
export interface ReferenceAnnotationCardProps {
  /** Label of the concept. */
  label: string
  /** IRI of the concept in TheZoo. */
  conceptUri: string
  category?: ConceptCategory
  collection?: string | null
  /** Number of places of the paragraph where the concept is annotated. */
  occurrences: number
  /** True when the user follows this concept (the toggle is pressed). */
  isPinned: boolean
  /** True while the concept is hovered somewhere on the page. */
  isHighlighted?: boolean
  onTogglePin: () => void
  /** Highlights the concept in the text while the toggle is hovered or focused. */
  onHoverChange?: (hovered: boolean) => void
  /** Page-specific badges (category, type, origin). */
  children?: ReactNode
}

/**
 * An annotation of the reference graph (Corese) in the reader panel and the studio list. Following
 * the concept is a toggle button, reachable and operable with the keyboard; the pinned state is
 * said by `aria-pressed` and a pin icon, not by colour alone.
 */
export function ReferenceAnnotationCard({
  label,
  conceptUri,
  category,
  collection,
  occurrences,
  isPinned,
  isHighlighted = false,
  onTogglePin,
  onHoverChange,
  children,
}: ReferenceAnnotationCardProps) {
  const { t } = useI18n()
  const ring = isPinned ? 'border-accent ring-2 ring-accent' : isHighlighted ? 'border-accent ring-1 ring-accent' : ''

  return (
    <article
      className={`space-y-2 border bg-paper-raised p-3 font-ui text-xs text-ink ${ring || 'border-rule-strong'}`}
    >
      <button
        type="button"
        aria-pressed={isPinned}
        title={isPinned ? t.annotate.unpinAnnotationTooltip : t.annotate.pinAnnotationTooltip}
        className="flex w-full min-w-0 items-start gap-1.5 text-left text-sm leading-snug font-semibold break-words hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        onClick={onTogglePin}
        onMouseEnter={() => onHoverChange?.(true)}
        onMouseLeave={() => onHoverChange?.(false)}
        onFocus={() => onHoverChange?.(true)}
        onBlur={() => onHoverChange?.(false)}
      >
        <ConceptCategoryIcon
          category={category}
          collection={collection}
          label={label}
          uri={conceptUri}
          className="mt-0.5 h-4 w-4 shrink-0"
        />
        <span className="min-w-0 flex-1 capitalize">{label.toLowerCase()}</span>
        {isPinned && <Pin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" />}
      </button>

      {children && <div className="flex flex-wrap items-center justify-end gap-1.5">{children}</div>}

      <div className="flex items-center justify-between border-t border-rule pt-2 text-[11px]">
        <span className="inline-flex items-center justify-center rounded-full bg-paper-sunken px-2 py-0.5 text-center leading-none font-medium text-ink-muted">
          {occurrences} {t.work.occurrencesCount}
        </span>
        <a
          href={conceptUri}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-medium text-accent-strong underline"
        >
          {t.work.viewOnTheZoo}
          <ExternalLink aria-hidden="true" className="h-3 w-3" />
        </a>
      </div>
    </article>
  )
}
