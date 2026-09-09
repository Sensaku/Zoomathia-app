import React from 'react'
import { PlusCircle, MinusCircle, Target, GitFork, X, Sparkles, Layers } from 'lucide-react'
import { ConceptCriterion, CollectionCriterion } from '../types'
import { ConceptCategoryIcon, ConceptCategoryBadge } from './ConceptCategoryBadge'

interface ConceptCriteriaCardProps {
  criterion: ConceptCriterion
  onUpdate: (updated: ConceptCriterion) => void
  onRemove: () => void
}

export const ConceptCriteriaCard: React.FC<ConceptCriteriaCardProps> = ({
  criterion,
  onUpdate,
  onRemove
}) => {
  const isIncluded = criterion.polarity === 'include'
  const hasTaxonomy = criterion.include_subconcepts

  const togglePolarity = () => {
    onUpdate({
      ...criterion,
      polarity: isIncluded ? 'exclude' : 'include'
    })
  }

  const toggleTaxonomy = () => {
    onUpdate({
      ...criterion,
      include_subconcepts: !hasTaxonomy
    })
  }

  return (
    <div
      className={`p-3.5 rounded-none border transition-all space-y-2.5 text-sm ${
        isIncluded
          ? 'bg-[#fcfbf9] border-[#e6dfd3] shadow-xs'
          : 'bg-rose-50/70 border-rose-200 shadow-xs'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start space-x-2.5 min-w-0">
          <div className="mt-0.5 shrink-0">
            <ConceptCategoryIcon
              category={criterion.category}
              collection={criterion.collection}
              label={criterion.label}
              uri={criterion.uri}
              className="w-4 h-4"
            />
          </div>
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
              <span
                className={`font-semibold text-sm sm:text-base block truncate ${
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
            <span className="text-xs text-[#736a5f] block truncate font-mono">
              {criterion.uri}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onRemove}
          title="Supprimer ce critère"
          className="text-[#8c8275] hover:text-rose-600 p-1.5 rounded-none transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Contrôles interactifs : Polarité & Taxonomie */}
      <div className="flex flex-wrap items-center gap-2 pt-1.5 border-t border-[#f0eae0]">
        {/* Commutateur Polarité : Inclure vs Exclure */}
        <button
          type="button"
          onClick={togglePolarity}
          className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-none text-xs font-medium transition-colors cursor-pointer ${
            isIncluded
              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-300'
              : 'bg-rose-100 text-rose-800 hover:bg-rose-200 border border-rose-300 font-semibold'
          }`}
        >
          {isIncluded ? (
            <>
              <PlusCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span>➕ Inclure dans le corpus</span>
            </>
          ) : (
            <>
              <MinusCircle className="w-3.5 h-3.5 text-rose-600" />
              <span>⛔ Exclure du corpus</span>
            </>
          )}
        </button>

        {/* Commutateur Taxonomie : Strict vs + Sous-concepts */}
        <button
          type="button"
          onClick={toggleTaxonomy}
          className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-none text-xs font-medium transition-colors cursor-pointer ${
            hasTaxonomy
              ? 'bg-[#eaddcb] text-[#543b22] hover:bg-[#dfcfb8] border border-[#cfc5b4] font-semibold'
              : 'bg-stone-100 text-stone-700 hover:bg-stone-200 border border-stone-200'
          }`}
        >
          {hasTaxonomy ? (
            <>
              <GitFork className="w-3.5 h-3.5 text-[#9A6530]" />
              <span>🌳 Avec taxonomie (skos:broader+)</span>
            </>
          ) : (
            <>
              <Target className="w-3.5 h-3.5 text-stone-500" />
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
  onRemove
}) => {
  const isIncluded = criterion.polarity === 'include'

  const togglePolarity = () => {
    onUpdate({
      ...criterion,
      polarity: isIncluded ? 'exclude' : 'include'
    })
  }

  return (
    <div
      className={`p-3.5 rounded-none border transition-all space-y-2.5 text-sm ${
        isIncluded
          ? 'bg-[#fcfbf9] border-[#e6dfd3] shadow-xs'
          : 'bg-rose-50/70 border-rose-200 shadow-xs'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start space-x-2.5 min-w-0">
          <div className="mt-0.5 text-[#3b6ea5] shrink-0">
            <Layers className="w-4 h-4" />
          </div>
          <div className="min-w-0 space-y-1">
            <span
              className={`font-semibold text-sm sm:text-base block truncate ${
                isIncluded ? 'text-[#2c2724]' : 'text-rose-900 line-through'
              }`}
            >
              Collection : {criterion.label || criterion.uri}
            </span>
            {memberCount !== undefined && (
              <span className="inline-flex items-center justify-center text-xs text-[#3b6ea5] bg-sky-50 border border-sky-200 px-2.5 py-0.5 rounded-full font-medium leading-none">
                {memberCount} membres répertoriés (skos:member)
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onRemove}
          title="Supprimer cette collection"
          className="text-[#8c8275] hover:text-rose-600 p-1.5 rounded-none transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 pt-1.5 border-t border-[#f0eae0]">
        <button
          type="button"
          onClick={togglePolarity}
          className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-none text-xs font-medium transition-colors cursor-pointer ${
            isIncluded
              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-300'
              : 'bg-rose-100 text-rose-800 hover:bg-rose-200 border border-rose-300 font-semibold'
          }`}
        >
          {isIncluded ? (
            <>
              <PlusCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span>➕ Inclure les membres</span>
            </>
          ) : (
            <>
              <MinusCircle className="w-3.5 h-3.5 text-rose-600" />
              <span>⛔ Exclure les membres</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
