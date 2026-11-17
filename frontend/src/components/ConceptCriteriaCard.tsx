import React from 'react'
import { PlusCircle, MinusCircle, Target, GitFork, X, Sparkles, Layers } from 'lucide-react'
import { ConceptCriterion, CollectionCriterion } from '../types'
import { ConceptCategoryIcon, ConceptCategoryBadge } from './ConceptCategoryBadge'

interface ConceptCriteriaCardProps {
  criterion: ConceptCriterion
  onUpdate: (updated: ConceptCriterion) => void
  onRemove: () => void
}

export const ConceptCriteriaCard: React.FC<ConceptCriteriaCardProps> = ({ criterion, onUpdate, onRemove }) => {
  const isIncluded = criterion.polarity === 'include'
  const hasTaxonomy = criterion.include_subconcepts

  const togglePolarity = () => {
    onUpdate({
      ...criterion,
      polarity: isIncluded ? 'exclude' : 'include',
    })
  }

  const toggleTaxonomy = () => {
    onUpdate({
      ...criterion,
      include_subconcepts: !hasTaxonomy,
    })
  }

  return (
    <div
      className={`space-y-2.5 rounded-none border p-3.5 text-sm transition-all ${
        isIncluded ? 'border-[#e6dfd3] bg-[#fcfbf9] shadow-xs' : 'border-rose-200 bg-rose-50/70 shadow-xs'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start space-x-2.5">
          <div className="mt-0.5 shrink-0">
            <ConceptCategoryIcon
              category={criterion.category}
              collection={criterion.collection}
              label={criterion.label}
              uri={criterion.uri}
              className="h-4 w-4"
            />
          </div>
          <div className="min-w-0 space-y-0.5">
            <div className="flex flex-wrap items-center space-x-2 gap-y-1">
              <span
                className={`block truncate text-sm font-semibold sm:text-base ${
                  isIncluded ? 'text-[#2c2724]' : 'text-rose-900 line-through'
                }`}
              >
                {criterion.label || criterion.uri}
              </span>
              <ConceptCategoryBadge
                category={criterion.category}
                collection={criterion.collection}
                label={criterion.label}
                uri={criterion.uri}
              />
            </div>
            <span className="block truncate font-mono text-xs text-[#736a5f]">{criterion.uri}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onRemove}
          title="Supprimer ce critère"
          className="cursor-pointer rounded-none p-1.5 text-[#8c8275] transition-colors hover:text-rose-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Contrôles interactifs : Polarité & Taxonomie */}
      <div className="flex flex-wrap items-center gap-2 border-t border-[#f0eae0] pt-1.5">
        {/* Commutateur Polarité : Inclure vs Exclure */}
        <button
          type="button"
          onClick={togglePolarity}
          className={`inline-flex cursor-pointer items-center space-x-1.5 rounded-none px-3 py-1.5 text-xs font-medium transition-colors ${
            isIncluded
              ? 'border border-emerald-300 bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
              : 'border border-rose-300 bg-rose-100 font-semibold text-rose-800 hover:bg-rose-200'
          }`}
        >
          {isIncluded ? (
            <>
              <PlusCircle className="h-3.5 w-3.5 text-emerald-600" />
              <span>➕ Inclure dans le corpus</span>
            </>
          ) : (
            <>
              <MinusCircle className="h-3.5 w-3.5 text-rose-600" />
              <span>⛔ Exclure du corpus</span>
            </>
          )}
        </button>

        {/* Commutateur Taxonomie : Strict vs + Sous-concepts */}
        <button
          type="button"
          onClick={toggleTaxonomy}
          className={`inline-flex cursor-pointer items-center space-x-1.5 rounded-none px-3 py-1.5 text-xs font-medium transition-colors ${
            hasTaxonomy
              ? 'border border-[#cfc5b4] bg-[#eaddcb] font-semibold text-[#543b22] hover:bg-[#dfcfb8]'
              : 'border border-stone-200 bg-stone-100 text-stone-700 hover:bg-stone-200'
          }`}
        >
          {hasTaxonomy ? (
            <>
              <GitFork className="h-3.5 w-3.5 text-[#9A6530]" />
              <span>🌳 Avec taxonomie (skos:broader+)</span>
            </>
          ) : (
            <>
              <Target className="h-3.5 w-3.5 text-stone-500" />
              <span>🎯 Terme strict uniquement</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}

interface CollectionCriteriaCardProps {
  criterion: CollectionCriterion
  memberCount?: number
  onUpdate: (updated: CollectionCriterion) => void
  onRemove: () => void
}

export const CollectionCriteriaCard: React.FC<CollectionCriteriaCardProps> = ({
  criterion,
  memberCount,
  onUpdate,
  onRemove,
}) => {
  const isIncluded = criterion.polarity === 'include'

  const togglePolarity = () => {
    onUpdate({
      ...criterion,
      polarity: isIncluded ? 'exclude' : 'include',
    })
  }

  return (
    <div
      className={`space-y-2.5 rounded-none border p-3.5 text-sm transition-all ${
        isIncluded ? 'border-[#e6dfd3] bg-[#fcfbf9] shadow-xs' : 'border-rose-200 bg-rose-50/70 shadow-xs'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start space-x-2.5">
          <div className="mt-0.5 shrink-0 text-[#3b6ea5]">
            <Layers className="h-4 w-4" />
          </div>
          <div className="min-w-0 space-y-1">
            <span
              className={`block truncate text-sm font-semibold sm:text-base ${
                isIncluded ? 'text-[#2c2724]' : 'text-rose-900 line-through'
              }`}
            >
              Collection : {criterion.label || criterion.uri}
            </span>
            {memberCount !== undefined && (
              <span className="inline-flex items-center justify-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs leading-none font-medium text-[#3b6ea5]">
                {memberCount} membres répertoriés (skos:member)
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onRemove}
          title="Supprimer cette collection"
          className="cursor-pointer rounded-none p-1.5 text-[#8c8275] transition-colors hover:text-rose-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 border-t border-[#f0eae0] pt-1.5">
        <button
          type="button"
          onClick={togglePolarity}
          className={`inline-flex cursor-pointer items-center space-x-1.5 rounded-none px-3 py-1.5 text-xs font-medium transition-colors ${
            isIncluded
              ? 'border border-emerald-300 bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
              : 'border border-rose-300 bg-rose-100 font-semibold text-rose-800 hover:bg-rose-200'
          }`}
        >
          {isIncluded ? (
            <>
              <PlusCircle className="h-3.5 w-3.5 text-emerald-600" />
              <span>➕ Inclure les membres</span>
            </>
          ) : (
            <>
              <MinusCircle className="h-3.5 w-3.5 text-rose-600" />
              <span>⛔ Exclure les membres</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
