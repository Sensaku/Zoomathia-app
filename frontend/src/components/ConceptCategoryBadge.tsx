import React from 'react'
import { PawPrint, Activity, HeartPulse, MapPin, User, Sparkles, LucideIcon } from 'lucide-react'
import { useI18n, type Language } from '../i18n'
import { ConceptCategory, ConceptCollection } from '../types'

/** Icon and classes of a concept category. The label comes from i18n (`conceptCategories`). */
export interface ConceptCategoryStyle {
  category: ConceptCategory
  icon: LucideIcon
  colorClass: string
  bgClass: string
  borderClass: string
  textClass: string
}

/**
 * The icon and the classes of a category (RM-CON-02). The category is computed by the backend and
 * only displayed here: a missing one reads as `general`, and nothing is guessed from a label or an IRI.
 */
export function categoryStyle(category?: ConceptCategory): ConceptCategoryStyle {
  switch (category) {
    case 'animal':
      return {
        category: 'animal',
        icon: PawPrint,
        colorClass: 'text-amber-600',
        bgClass: 'bg-amber-50',
        borderClass: 'border-amber-200',
        textClass: 'text-amber-800',
      }
    case 'behavior':
      return {
        category: 'behavior',
        icon: Activity,
        colorClass: 'text-indigo-600',
        bgClass: 'bg-indigo-50',
        borderClass: 'border-indigo-200',
        textClass: 'text-indigo-800',
      }
    case 'anatomy':
      return {
        category: 'anatomy',
        icon: HeartPulse,
        colorClass: 'text-rose-600',
        bgClass: 'bg-rose-50',
        borderClass: 'border-rose-200',
        textClass: 'text-rose-800',
      }
    case 'place':
      return {
        category: 'place',
        icon: MapPin,
        colorClass: 'text-teal-600',
        bgClass: 'bg-teal-50',
        borderClass: 'border-teal-200',
        textClass: 'text-teal-800',
      }
    case 'person':
      return {
        category: 'person',
        icon: User,
        colorClass: 'text-sky-600',
        bgClass: 'bg-sky-50',
        borderClass: 'border-sky-200',
        textClass: 'text-sky-800',
      }
    default:
      return {
        category: 'general',
        icon: Sparkles,
        colorClass: 'text-[#9A6530]',
        bgClass: 'bg-[#faf6f0]',
        borderClass: 'border-[#ebdcc9]',
        textClass: 'text-[#634220]',
      }
  }
}

/** The SKOS label of a collection in the interface language, else in the other language, else its IRI. */
export function collectionLabel(collection: ConceptCollection, language: Language): string {
  const other: Language = language === 'fr' ? 'en' : 'fr'
  return collection.labels[language] || collection.labels[other] || collection.iri
}

/** The labels of the collections joined for a tooltip, or an empty string without collection. */
export function collectionLabels(collections: ConceptCollection[] | undefined, language: Language): string {
  return (collections ?? []).map((c) => collectionLabel(c, language)).join(', ')
}

interface ConceptCategoryIconProps {
  category?: ConceptCategory
  className?: string
}

/** The icon of a category, coloured for it. */
export const ConceptCategoryIcon: React.FC<ConceptCategoryIconProps> = ({ category, className = 'w-3.5 h-3.5' }) => {
  const style = categoryStyle(category)
  const IconComponent = style.icon
  return <IconComponent className={`${className} ${style.colorClass}`} />
}

interface ConceptCategoryBadgeProps {
  category?: ConceptCategory
  /** The TheZoo collections of the concept: they fill the title of the badge. */
  collections?: ConceptCollection[]
  showLabel?: boolean
  size?: 'sm' | 'md'
  className?: string
}

/**
 * The category of a concept: icon, colour and a label translated by the app. The title names the
 * collections of the concept in the interface language (RM-CON-02), or the category when it has none.
 */
export const ConceptCategoryBadge: React.FC<ConceptCategoryBadgeProps> = ({
  category,
  collections,
  showLabel = true,
  size = 'md',
  className = '',
}) => {
  const { t, language } = useI18n()
  const style = categoryStyle(category)
  const IconComponent = style.icon
  const label = t.conceptCategories[style.category]
  const list = collectionLabels(collections, language)

  const sizeClasses = size === 'sm' ? 'text-[11px] px-1.5 py-0.5 space-x-1' : 'text-xs px-2 py-0.5 space-x-1.5'

  const iconSizeClass = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-md border leading-none font-medium ${sizeClasses} ${style.bgClass} ${style.borderClass} ${style.textClass} ${className}`}
      title={list ? t.conceptCategories.collectionsTitle.replace('{list}', () => list) : label}
    >
      <IconComponent className={`${iconSizeClass} shrink-0`} />
      {showLabel && <span>{label}</span>}
      {list && <span className="sr-only">{t.conceptCategories.collectionsTitle.replace('{list}', () => list)}</span>}
    </span>
  )
}

// Palettes et classes CSS complètes pour le surlignage sémantique TheZoo (zéro saut de texte / zero layout shift)
export const CATEGORY_STYLES: Record<string, string> = {
  animal: 'bg-amber-100/75 hover:bg-amber-200 border-b-2 border-amber-600 hover:border-amber-700 text-amber-950',
  behavior: 'bg-indigo-100/75 hover:bg-indigo-200 border-b-2 border-indigo-600 hover:border-indigo-700 text-indigo-950',
  anatomy: 'bg-rose-100/75 hover:bg-rose-200 border-b-2 border-rose-600 hover:border-rose-700 text-rose-950',
  place: 'bg-teal-100/75 hover:bg-teal-200 border-b-2 border-teal-600 hover:border-teal-700 text-teal-950',
  person: 'bg-sky-100/75 hover:bg-sky-200 border-b-2 border-sky-600 hover:border-sky-700 text-sky-950',
  general: 'bg-stone-100/80 hover:bg-stone-200 border-b-2 border-stone-500 hover:border-stone-600 text-stone-900',
}

export const CATEGORY_HOVER_STYLES: Record<string, string> = {
  animal: 'bg-amber-200 text-amber-950 border-b-2 border-amber-700 shadow-2xs',
  behavior: 'bg-indigo-200 text-indigo-950 border-b-2 border-indigo-700 shadow-2xs',
  anatomy: 'bg-rose-200 text-rose-950 border-b-2 border-rose-700 shadow-2xs',
  place: 'bg-teal-200 text-teal-950 border-b-2 border-teal-700 shadow-2xs',
  person: 'bg-sky-200 text-sky-950 border-b-2 border-sky-700 shadow-2xs',
  general: 'bg-stone-200 text-stone-950 border-b-2 border-stone-600 shadow-2xs',
}

export const CATEGORY_PINNED_STYLES: Record<string, string> = {
  animal: 'bg-amber-300 text-amber-950 border-b-2 border-amber-800 ring-1 ring-amber-700/50 shadow-xs',
  behavior: 'bg-indigo-300 text-indigo-950 border-b-2 border-indigo-800 ring-1 ring-indigo-700/50 shadow-xs',
  anatomy: 'bg-rose-300 text-rose-950 border-b-2 border-rose-800 ring-1 ring-rose-700/50 shadow-xs',
  place: 'bg-teal-300 text-teal-950 border-b-2 border-teal-800 ring-1 ring-teal-700/50 shadow-xs',
  person: 'bg-sky-300 text-sky-950 border-b-2 border-sky-800 ring-1 ring-sky-700/50 shadow-xs',
  general: 'bg-stone-300 text-stone-950 border-b-2 border-stone-700 ring-1 ring-stone-600/50 shadow-xs',
}

export const CATEGORY_OVERLAP_STYLES: Record<string, string> = {
  animal: 'bg-amber-100/90 hover:bg-amber-200 border-b-2 border-double border-amber-700 text-amber-950',
  behavior: 'bg-indigo-100/90 hover:bg-indigo-200 border-b-2 border-double border-indigo-700 text-indigo-950',
  anatomy: 'bg-rose-100/90 hover:bg-rose-200 border-b-2 border-double border-rose-700 text-rose-950',
  place: 'bg-teal-100/90 hover:bg-teal-200 border-b-2 border-double border-teal-700 text-teal-950',
  person: 'bg-sky-100/90 hover:bg-sky-200 border-b-2 border-double border-sky-700 text-sky-950',
  general: 'bg-stone-100/90 hover:bg-stone-200 border-b-2 border-double border-stone-600 text-stone-900',
}

export const CATEGORY_DELIMITER_LEFT: Record<string, string> = {
  animal: 'border-l-2 border-l-amber-600 pl-0.5',
  behavior: 'border-l-2 border-l-indigo-600 pl-0.5',
  anatomy: 'border-l-2 border-l-rose-600 pl-0.5',
  place: 'border-l-2 border-l-teal-600 pl-0.5',
  person: 'border-l-2 border-l-sky-600 pl-0.5',
  general: 'border-l-2 border-l-stone-500 pl-0.5',
}

export const CATEGORY_DELIMITER_RIGHT: Record<string, string> = {
  animal: 'border-r-2 border-r-amber-600 pr-0.5',
  behavior: 'border-r-2 border-r-indigo-600 pr-0.5',
  anatomy: 'border-r-2 border-r-rose-600 pr-0.5',
  place: 'border-r-2 border-r-teal-600 pr-0.5',
  person: 'border-r-2 border-r-sky-600 pr-0.5',
  general: 'border-r-2 border-r-stone-500 pr-0.5',
}

export const CATEGORY_ACTIVE_DELIMITER_LEFT: Record<string, string> = {
  animal: 'border-l-2 border-l-amber-800 pl-0.5',
  behavior: 'border-l-2 border-l-indigo-800 pl-0.5',
  anatomy: 'border-l-2 border-l-rose-800 pl-0.5',
  place: 'border-l-2 border-l-teal-800 pl-0.5',
  person: 'border-l-2 border-l-sky-800 pl-0.5',
  general: 'border-l-2 border-l-stone-800 pl-0.5',
}

export const CATEGORY_ACTIVE_DELIMITER_RIGHT: Record<string, string> = {
  animal: 'border-r-2 border-r-amber-800 pr-0.5',
  behavior: 'border-r-2 border-r-indigo-800 pr-0.5',
  anatomy: 'border-r-2 border-r-rose-800 pr-0.5',
  place: 'border-r-2 border-r-teal-800 pr-0.5',
  person: 'border-r-2 border-r-sky-800 pr-0.5',
  general: 'border-r-2 border-r-stone-800 pr-0.5',
}

export const CATEGORY_PARA_PINNED: Record<string, string> = {
  animal: 'border-amber-600 border-l-amber-600 bg-amber-50/90 shadow-md ring-2 ring-amber-500',
  behavior: 'border-indigo-600 border-l-indigo-600 bg-indigo-50/90 shadow-md ring-2 ring-indigo-500',
  anatomy: 'border-rose-600 border-l-rose-600 bg-rose-50/90 shadow-md ring-2 ring-rose-500',
  place: 'border-teal-600 border-l-teal-600 bg-teal-50/90 shadow-md ring-2 ring-teal-500',
  person: 'border-sky-600 border-l-sky-600 bg-sky-50/90 shadow-md ring-2 ring-sky-500',
  general: 'border-stone-600 border-l-stone-600 bg-stone-50/90 shadow-md ring-2 ring-stone-500',
}

export const CATEGORY_PARA_HOVER: Record<string, string> = {
  animal: 'border-amber-500 border-l-amber-500 bg-amber-50/80 shadow-sm ring-2 ring-amber-400',
  behavior: 'border-indigo-500 border-l-indigo-500 bg-indigo-50/80 shadow-sm ring-2 ring-indigo-400',
  anatomy: 'border-rose-500 border-l-rose-500 bg-rose-50/80 shadow-sm ring-2 ring-rose-400',
  place: 'border-teal-500 border-l-teal-500 bg-teal-50/80 shadow-sm ring-2 ring-teal-400',
  person: 'border-sky-500 border-l-sky-500 bg-sky-50/80 shadow-sm ring-2 ring-sky-400',
  general: 'border-stone-500 border-l-stone-500 bg-stone-50/80 shadow-sm ring-2 ring-stone-400',
}

export const CATEGORY_TAG_PINNED: Record<string, string> = {
  animal: 'bg-amber-200/90 text-amber-950 border border-amber-400',
  behavior: 'bg-indigo-200/90 text-indigo-950 border border-indigo-400',
  anatomy: 'bg-rose-200/90 text-rose-950 border border-rose-400',
  place: 'bg-teal-200/90 text-teal-950 border border-teal-400',
  person: 'bg-sky-200/90 text-sky-950 border border-sky-400',
  general: 'bg-stone-200/90 text-stone-950 border border-stone-400',
}

export const CATEGORY_TAG_HOVER: Record<string, string> = {
  animal: 'bg-amber-100 text-amber-950 border border-amber-300',
  behavior: 'bg-indigo-100 text-indigo-950 border border-indigo-300',
  anatomy: 'bg-rose-100 text-rose-950 border border-rose-300',
  place: 'bg-teal-100 text-teal-950 border border-teal-300',
  person: 'bg-sky-100 text-sky-950 border border-sky-300',
  general: 'bg-stone-100 text-stone-950 border border-stone-300',
}

export const CATEGORY_TOC_PINNED: Record<string, string> = {
  animal: 'bg-amber-300 text-amber-950 border border-amber-500 shadow-xs ring-1 ring-amber-500',
  behavior: 'bg-indigo-300 text-indigo-950 border border-indigo-500 shadow-xs ring-1 ring-indigo-500',
  anatomy: 'bg-rose-300 text-rose-950 border border-rose-500 shadow-xs ring-1 ring-rose-500',
  place: 'bg-teal-300 text-teal-950 border border-teal-500 shadow-xs ring-1 ring-teal-500',
  person: 'bg-sky-300 text-sky-950 border border-sky-500 shadow-xs ring-1 ring-sky-500',
  general: 'bg-stone-300 text-stone-950 border border-stone-500 shadow-xs ring-1 ring-stone-500',
}

export const CATEGORY_TOC_HOVER: Record<string, string> = {
  animal: 'bg-amber-200 text-amber-950 border border-amber-400 shadow-2xs',
  behavior: 'bg-indigo-200 text-indigo-950 border border-indigo-400 shadow-2xs',
  anatomy: 'bg-rose-200 text-rose-950 border border-rose-400 shadow-2xs',
  place: 'bg-teal-200 text-teal-950 border border-teal-400 shadow-2xs',
  person: 'bg-sky-200 text-sky-950 border border-sky-400 shadow-2xs',
  general: 'bg-stone-200 text-stone-950 border border-stone-400 shadow-2xs',
}
