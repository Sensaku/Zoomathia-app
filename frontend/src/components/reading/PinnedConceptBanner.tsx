import React from 'react'
import { ConceptCategory } from '../../types'
import { ReadingParagraph } from './readingTypes'
import {
  ConceptCategoryIcon,
  CATEGORY_BADGE_PINNED,
  CATEGORY_PINNED_STYLES,
  CATEGORY_TAG_PINNED,
} from '../ConceptCategoryBadge'
import { X } from 'lucide-react'

export interface PinnedConceptBannerProps {
  pinnedConcept: string | null
  pinnedConceptLabel: string | null
  pinnedConceptCategory: ConceptCategory
  pinnedParagraphsList: ReadingParagraph[]
  activeParagraphUri: string
  onFocusParagraph: (uri: string) => void
  onUnpin: () => void
  bannerTitle?: string
  coveredPassagesText?: string
}

export const PinnedConceptBanner: React.FC<PinnedConceptBannerProps> = ({
  pinnedConcept,
  pinnedConceptLabel,
  pinnedConceptCategory,
  pinnedParagraphsList,
  activeParagraphUri,
  onFocusParagraph,
  onUnpin,
  bannerTitle = 'Annotation épinglée (verrouillée) :',
  coveredPassagesText = 'Passages couverts :',
}) => {
  if (!pinnedConcept) return null

  const catBorder =
    pinnedConceptCategory === 'anatomy'
      ? 'border-rose-300'
      : pinnedConceptCategory === 'behavior'
        ? 'border-indigo-300'
        : pinnedConceptCategory === 'place'
          ? 'border-teal-300'
          : pinnedConceptCategory === 'person'
            ? 'border-sky-300'
            : pinnedConceptCategory === 'general'
              ? 'border-stone-300'
              : 'border-amber-300'

  return (
    <div
      className={`animate-in fade-in slide-in-from-top-2 sticky top-0 z-20 -mx-1 mb-3 flex items-center justify-between gap-3 rounded-none border bg-[#fffdfa] p-3 shadow-md select-none ${catBorder}`}
    >
      <div className="flex min-w-0 items-center space-x-2.5">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-none text-xs font-bold text-white shadow-xs ${
            CATEGORY_BADGE_PINNED[pinnedConceptCategory] || CATEGORY_BADGE_PINNED.general
          }`}
        >
          📌
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
            <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs font-bold text-[#2c2724]">
              <span>{bannerTitle}</span>
              <span
                className={`inline-flex flex-wrap items-center gap-x-1 rounded-none px-2 py-0.5 text-xs font-bold break-words whitespace-normal ${
                  CATEGORY_PINNED_STYLES[pinnedConceptCategory] || CATEGORY_PINNED_STYLES.general
                }`}
              >
                <ConceptCategoryIcon uri={pinnedConcept} category={pinnedConceptCategory} className="h-3.5 w-3.5" />
                <span className="capitalize">{pinnedConceptLabel || 'Concept'}</span>
              </span>
            </span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                CATEGORY_TAG_PINNED[pinnedConceptCategory] || CATEGORY_TAG_PINNED.general
              }`}
            >
              {pinnedParagraphsList.length > 1
                ? `Couvre ${pinnedParagraphsList.length} paragraphes`
                : 'Présent sur 1 paragraphe'}
            </span>
          </div>

          {pinnedParagraphsList.length > 1 && (
            <div className="mt-1 flex flex-wrap items-center space-x-1.5 text-[11px] text-[#736a5f]">
              <span>{coveredPassagesText}</span>
              <div className="flex flex-wrap items-center gap-1">
                {pinnedParagraphsList.map((pItem) => {
                  const isCurrent = activeParagraphUri === pItem.uri
                  return (
                    <button
                      key={pItem.uri}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onFocusParagraph(pItem.uri)
                      }}
                      className={`cursor-pointer rounded-none border px-1.5 py-0.5 font-mono text-[10px] font-bold transition-all ${
                        isCurrent
                          ? 'border-[#855424] bg-[#9A6530] text-white shadow-xs'
                          : 'border-amber-200 bg-white text-[#6e461f] hover:bg-amber-100'
                      }`}
                      title={`Aller au § ${pItem.id}`}
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
        className="shrink-0 cursor-pointer rounded-none p-1.5 text-[#736a5f] transition-colors hover:bg-amber-100 hover:text-[#2c2724]"
        title="Désépingler l'annotation"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
