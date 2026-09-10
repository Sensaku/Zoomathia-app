import React from 'react'
import { PawPrint, Activity, HeartPulse, MapPin, User, Sparkles, LucideIcon } from 'lucide-react'
import { ConceptCategory } from '../types'

export interface ConceptCategoryInfo {
  category: ConceptCategory
  label: string
  icon: LucideIcon
  colorClass: string
  bgClass: string
  borderClass: string
  textClass: string
}

// Identifiants des concepts racines et taxons clés TheZoo (Domestique, Sauvage, Ni domestique ni sauvage...)
const ROOT_ANIMAL_IDS = new Set([
  '4988', '106004', '107676', '105539', '105555', '105540', '105541',
  '107008', '106789', '107912', '105781', '105782', '106935', '106749',
  '106753', '108745', '106933', '107467', '107292', '107286', '108048',
  '108187', '108313', '108179', '108175', '108177', '107264', '107948',
  '107515', '107743', '107284', '108169', '108303', '108221', '108223',
  '107473', '5037', '105780', '4996', '15094',
  'pcrt3jcrAaRENB', 'pcrt4v7jKE3TVw', 'pcrt0wSiSXpLTf', 'pcrth4ik1YqDS1',
  '106951', '105804', '106949', '106492', '106516', '106512', '5071',
  '105993', '105994', '105996', 'pcrtDtJwUVaZ0I', 'pcrtLywf8Y5k0n',
  '106552', '106554', 'pcrtamWjqMqPWT', 'pcrtOl4a3UUtiu', 'pcrtDoQWOTMlW7',
  'pcrt6i8AcPBoY2', '106482', '106484', 'pcrtnpPag9iONJ', '107580',
  '107578', '107582', '107914', 'pcrtEOlJwpiHmn', 'pcrt1eSDN7pc4r',
  'pcrtoWmR7YcVct', '105904', 'pcrtRpEmyMyoAU', '106536', 'pcrtVibtZJlA99',
  '105918', '106647', 'pcrtva7NUywIgB', '105879', 'pcrt8q2AHnsLUr',
  'pcrt5TAeZsO7W4', '106524', 'pcrtlYnu8y5j62', '106620', 'pcrtRmvjGjzyOO',
  '106269', '105880', '106622', '106626', '105898', 'pcrtZtKktLIqkU',
  '107709', '105867', '105882', '106624'
])

export function getConceptCategoryInfo(
  category?: ConceptCategory,
  collection?: string | null,
  fallbackLabel?: string,
  conceptUri?: string
): ConceptCategoryInfo {
  let cat: ConceptCategory = category || 'general'

  // 1. Détection par identifiant URI de racine animale (Domestique, Sauvage, Ni domestique ni sauvage...)
  if (cat === 'general' && conceptUri) {
    const uriLower = conceptUri.toLowerCase()
    for (const rid of ROOT_ANIMAL_IDS) {
      if (uriLower.includes(`idc=${rid.toLowerCase()}`)) {
        cat = 'animal'
        break
      }
    }
  }

  // 2. Détection par libellé pour les concepts racines (DOMESTIQUE, SAUVAGE, animal domestique...)
  if (cat === 'general' && fallbackLabel) {
    const lbl = fallbackLabel.trim().toLowerCase()
    const exactRootAnimals = [
      'domestique', 'domestic', 'domesticus', 'domestico',
      'sauvage', 'wild', 'ferus', 'salvaje', 'selvatico',
      'ni domestique ni sauvage',
      'animal domestique', 'animal sauvage',
      'animal', 'animaux', 'faune', 'bête', 'bestiole', 'fauve',
      'eumetazoa', 'parazoa'
    ]
    if (exactRootAnimals.includes(lbl)) {
      cat = 'animal'
    } else if (
      lbl.startsWith('animal ') ||
      lbl.startsWith('animaux ') ||
      lbl.startsWith('faune ') ||
      lbl.startsWith('bête ') ||
      lbl.startsWith('bestiole ') ||
      lbl.startsWith('oiseau ') ||
      lbl.startsWith('poisson ') ||
      lbl.startsWith('reptile ') ||
      lbl.startsWith('insecte ') ||
      lbl.startsWith('squale ')
    ) {
      cat = 'animal'
    } else if (
      (lbl.endsWith(' sauvage') || lbl.endsWith(' domestique')) &&
      !['rosier', 'figuier', 'olivier', 'laitue', 'vigne', 'pommier', 'poirier'].some((p) => lbl.includes(p))
    ) {
      cat = 'animal'
    } else if (['éthologie', 'ethology', 'comportement', 'prédation', 'intelligence', 'parasitisme', 'hygiène', 'courage', 'sagesse'].includes(lbl)) {
      cat = 'behavior'
    }
  }

  // 3. Fallback heuristique si collection fournie
  if (cat === 'general' && collection) {
    const colLower = collection.toLowerCase()
    if (
      colLower.includes('zoonym') ||
      colLower.includes('archéotaxon') ||
      colLower.includes('archeotaxon') ||
      colLower.includes('ancient class') ||
      colLower.includes('mt_7') ||
      colLower.includes('mt_10')
    ) {
      cat = 'animal'
    } else if (
      colLower.includes('éthologie') ||
      colLower.includes('ethologie') ||
      colLower.includes('ethology') ||
      colLower.includes('comportement') ||
      colLower.includes('mt_13')
    ) {
      cat = 'behavior'
    } else if (
      colLower.includes('anatomie') ||
      colLower.includes('anatomy') ||
      colLower.includes('physiologie') ||
      colLower.includes('mt_8') ||
      colLower.includes('mt_11')
    ) {
      cat = 'anatomy'
    } else if (colLower.includes('lieu') || colLower.includes('place') || colLower.includes('mt_4')) {
      cat = 'place'
    } else if (
      colLower.includes('anthroponyme') ||
      colLower.includes('peuple') ||
      colLower.includes('people') ||
      colLower.includes('mt_1') ||
      colLower.includes('mt_5')
    ) {
      cat = 'person'
    }
  }

  switch (cat) {
    case 'animal':
      return {
        category: 'animal',
        label: 'Animal',
        icon: PawPrint,
        colorClass: 'text-amber-600',
        bgClass: 'bg-amber-50',
        borderClass: 'border-amber-200',
        textClass: 'text-amber-800'
      }
    case 'behavior':
      return {
        category: 'behavior',
        label: 'Comportement',
        icon: Activity,
        colorClass: 'text-indigo-600',
        bgClass: 'bg-indigo-50',
        borderClass: 'border-indigo-200',
        textClass: 'text-indigo-800'
      }
    case 'anatomy':
      return {
        category: 'anatomy',
        label: 'Anatomie',
        icon: HeartPulse,
        colorClass: 'text-rose-600',
        bgClass: 'bg-rose-50',
        borderClass: 'border-rose-200',
        textClass: 'text-rose-800'
      }
    case 'place':
      return {
        category: 'place',
        label: 'Lieu',
        icon: MapPin,
        colorClass: 'text-teal-600',
        bgClass: 'bg-teal-50',
        borderClass: 'border-teal-200',
        textClass: 'text-teal-800'
      }
    case 'person':
      return {
        category: 'person',
        label: 'Personne',
        icon: User,
        colorClass: 'text-sky-600',
        bgClass: 'bg-sky-50',
        borderClass: 'border-sky-200',
        textClass: 'text-sky-800'
      }
    default:
      return {
        category: 'general',
        label: 'Concept',
        icon: Sparkles,
        colorClass: 'text-[#9A6530]',
        bgClass: 'bg-[#faf6f0]',
        borderClass: 'border-[#ebdcc9]',
        textClass: 'text-[#634220]'
      }
  }
}

interface ConceptCategoryIconProps {
  category?: ConceptCategory
  collection?: string | null
  label?: string
  uri?: string
  className?: string
}

export const ConceptCategoryIcon: React.FC<ConceptCategoryIconProps> = ({
  category,
  collection,
  label,
  uri,
  className = 'w-3.5 h-3.5'
}) => {
  const info = getConceptCategoryInfo(category, collection, label, uri)
  const IconComponent = info.icon
  return <IconComponent className={`${className} ${info.colorClass}`} />
}

interface ConceptCategoryBadgeProps {
  category?: ConceptCategory
  collection?: string | null
  label?: string
  uri?: string
  showLabel?: boolean
  size?: 'sm' | 'md'
  className?: string
}

export const ConceptCategoryBadge: React.FC<ConceptCategoryBadgeProps> = ({
  category,
  collection,
  label,
  uri,
  showLabel = true,
  size = 'md',
  className = ''
}) => {
  const info = getConceptCategoryInfo(category, collection, label, uri)
  const IconComponent = info.icon

  const sizeClasses =
    size === 'sm'
      ? 'text-[11px] px-1.5 py-0.5 space-x-1'
      : 'text-xs px-2 py-0.5 space-x-1.5'

  const iconSizeClass = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'

  return (
    <span
      className={`inline-flex items-center justify-center rounded-md font-medium border leading-none shrink-0 ${sizeClasses} ${info.bgClass} ${info.borderClass} ${info.textClass} ${className}`}
      title={collection ? `Collection : ${collection}` : info.label}
    >
      <IconComponent className={`${iconSizeClass} shrink-0`} />
      {showLabel && <span>{info.label}</span>}
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

export const CATEGORY_BADGE_PINNED: Record<string, string> = {
  animal: 'bg-amber-600 text-white border border-amber-700',
  behavior: 'bg-indigo-600 text-white border border-indigo-700',
  anatomy: 'bg-rose-600 text-white border border-rose-700',
  place: 'bg-teal-600 text-white border border-teal-700',
  person: 'bg-sky-600 text-white border border-sky-700',
  general: 'bg-stone-600 text-white border border-stone-700',
}

export const CATEGORY_BADGE_HOVER: Record<string, string> = {
  animal: 'bg-amber-500 text-white border border-amber-600',
  behavior: 'bg-indigo-500 text-white border border-indigo-600',
  anatomy: 'bg-rose-500 text-white border border-rose-600',
  place: 'bg-teal-500 text-white border border-teal-600',
  person: 'bg-sky-500 text-white border border-sky-600',
  general: 'bg-stone-500 text-white border border-stone-600',
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

