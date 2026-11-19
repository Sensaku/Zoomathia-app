import { useId } from 'react'
import { Pin, X } from 'lucide-react'
import {
  ConceptCategoryIcon,
  CATEGORY_PINNED_STYLES,
  CATEGORY_TAG_PINNED,
} from '../../../components/ConceptCategoryBadge'
import type { ReadingParagraph } from '../../../components/reading'
import { useI18n } from '../../../i18n'
import type { ConceptCategory } from '../../../types'

const CATEGORY_BORDER: Record<string, string> = {
  anatomy: 'border-rose-300',
  behavior: 'border-indigo-300',
  place: 'border-teal-300',
  person: 'border-sky-300',
  general: 'border-stone-300',
  animal: 'border-amber-300',
}

/** Props of {@link PinnedConceptBanner}. */
export interface PinnedConceptBannerProps {
  pinnedConcept: string | null
  pinnedConceptLabel: string | null
  pinnedConceptCategory: ConceptCategory
  /** The paragraphs of the section that carry the concept. */
  pinnedParagraphsList: ReadingParagraph[]
  activeParagraphUri: string
  onFocusParagraph: (uri: string) => void
  onUnpin: () => void
}

/**
 * The followed (pinned) concept and the paragraphs that carry it, as a named region.
 * Renders nothing without a pinned concept. The buttons are the keyboard path to each paragraph.
 */
export function PinnedConceptBanner({
  pinnedConcept,
  pinnedConceptLabel,
  pinnedConceptCategory,
  pinnedParagraphsList,
  activeParagraphUri,
  onFocusParagraph,
  onUnpin,
}: PinnedConceptBannerProps) {
  const { t } = useI18n()
  const titleId = useId()
  if (!pinnedConcept) return null

  const border = CATEGORY_BORDER[pinnedConceptCategory] || CATEGORY_BORDER.general
  const tag = CATEGORY_TAG_PINNED[pinnedConceptCategory] || CATEGORY_TAG_PINNED.general
  const chip = CATEGORY_PINNED_STYLES[pinnedConceptCategory] || CATEGORY_PINNED_STYLES.general

  return (
    <section
      aria-labelledby={titleId}
      className={`sticky top-0 z-20 -mx-1 mb-3 flex items-center justify-between gap-3 rounded-none border bg-paper-raised p-3 text-ink shadow-md select-none ${border}`}
    >
      <div className="flex min-w-0 items-center space-x-2.5">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-none shadow-xs ${tag}`}>
          <Pin className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
            <p id={titleId} className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs font-bold">
              <span>{t.annotate.pinnedAnnotationBanner}</span>{' '}
              <span
                className={`inline-flex flex-wrap items-center gap-x-1 rounded-none px-2 py-0.5 text-xs font-bold break-words whitespace-normal ${chip}`}
              >
                <ConceptCategoryIcon category={pinnedConceptCategory} className="h-3.5 w-3.5" />
                <span className="capitalize">{pinnedConceptLabel || t.annotate.conceptFallback}</span>
              </span>
            </p>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tag}`}>
              {t.annotate.pinnedParagraphCount.replace('{count}', String(pinnedParagraphsList.length))}
            </span>
          </div>

          {pinnedParagraphsList.length > 1 && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-subtle">
              <span>{t.annotate.coveredPassages}</span>
              <div className="flex flex-wrap items-center gap-1">
                {pinnedParagraphsList.map((pItem) => {
                  const isCurrent = activeParagraphUri === pItem.uri
                  return (
                    <button
                      key={pItem.uri}
                      type="button"
                      aria-current={isCurrent || undefined}
                      title={t.work.goToParagraph.replace('{number}', String(pItem.id))}
                      onClick={(e) => {
                        e.stopPropagation()
                        onFocusParagraph(pItem.uri)
                      }}
                      className={`cursor-pointer border px-1.5 py-0.5 font-mono text-[11px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                        isCurrent
                          ? 'border-accent-strong bg-accent text-white'
                          : 'border-rule-strong bg-paper text-ink hover:bg-paper-sunken'
                      }`}
                    >
                      § {pItem.id}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onUnpin}
        aria-label={t.annotate.unpinAnnotationTooltip}
        title={t.annotate.unpinAnnotationTooltip}
        className="shrink-0 cursor-pointer rounded-none p-1.5 text-ink-muted hover:bg-paper-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </section>
  )
}
