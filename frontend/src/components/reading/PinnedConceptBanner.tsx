import React from 'react'
import { ConceptCategory } from '../../types'
import { ReadingParagraph } from './readingTypes'
import {
  ConceptCategoryIcon,
  CATEGORY_BADGE_PINNED,
  CATEGORY_PINNED_STYLES,
  CATEGORY_TAG_PINNED
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
  coveredPassagesText = 'Passages couverts :'
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
      className={`sticky top-0 z-20 -mx-1 mb-3 p-3 rounded-none bg-[#fffdfa] border shadow-md flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 select-none ${catBorder}`}
    >
      <div className="flex items-center space-x-2.5 min-w-0">
        <span
          className={`w-7 h-7 rounded-none text-white flex items-center justify-center shrink-0 shadow-xs text-xs font-bold ${
            CATEGORY_BADGE_PINNED[pinnedConceptCategory] || CATEGORY_BADGE_PINNED.general
          }`}
        >
          📌
        </span>
        <div className="min-w-0">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold text-[#2c2724] truncate flex items-center space-x-1.5">
              <span>{bannerTitle}</span>
              <span
                className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-none text-xs font-bold ${
                  CATEGORY_PINNED_STYLES[pinnedConceptCategory] || CATEGORY_PINNED_STYLES.general
                }`}
              >
                <ConceptCategoryIcon
                  uri={pinnedConcept}
                  category={pinnedConceptCategory}
                  className="w-3.5 h-3.5"
                />
                <span className="capitalize">{pinnedConceptLabel || 'Concept'}</span>
              </span>
            </span>
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                CATEGORY_TAG_PINNED[pinnedConceptCategory] || CATEGORY_TAG_PINNED.general
              }`}
            >
              {pinnedParagraphsList.length > 1
                ? `Couvre ${pinnedParagraphsList.length} paragraphes`
                : 'Présent sur 1 paragraphe'}
            </span>
          </div>

          {pinnedParagraphsList.length > 1 && (
            <div className="flex items-center space-x-1.5 mt-1 text-[11px] text-[#736a5f] flex-wrap">
              <span>{coveredPassagesText}</span>
              <div className="flex items-center flex-wrap gap-1">
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
                      className={`px-1.5 py-0.5 rounded-none text-[10px] font-mono font-bold transition-all border cursor-pointer ${
                        isCurrent
                          ? 'bg-[#9A6530] text-white border-[#855424] shadow-xs'
                          : 'bg-white hover:bg-amber-100 text-[#6e461f] border-amber-200'
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
        className="p-1.5 rounded-none text-[#736a5f] hover:text-[#2c2724] hover:bg-amber-100 transition-colors shrink-0 cursor-pointer"
        title="Désépingler l'annotation"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
