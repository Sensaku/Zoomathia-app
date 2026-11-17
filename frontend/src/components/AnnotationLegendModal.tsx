import React from 'react'
import {
  PawPrint,
  Activity,
  HeartPulse,
  MapPin,
  User,
  Sparkles,
  X,
  Layers,
  HelpCircle,
  Highlighter,
  CheckCircle2,
} from 'lucide-react'

interface AnnotationLegendModalProps {
  isOpen: boolean
  onClose: () => void
}

export const AnnotationLegendModal: React.FC<AnnotationLegendModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null

  const categories = [
    {
      id: 'animal',
      label: 'Animaux & Taxons',
      icon: PawPrint,
      badgeClass: 'bg-amber-100 border-b-2 border-amber-600 text-amber-950',
      iconClass: 'text-amber-700 bg-amber-100/70',
      desc: 'Zoonymes, espèces, genres et taxons anciens (ex: elephas, canis, aquila, leo).',
    },
    {
      id: 'behavior',
      label: 'Comportements & Éthologie',
      icon: Activity,
      badgeClass: 'bg-indigo-100 border-b-2 border-indigo-600 text-indigo-950',
      iconClass: 'text-indigo-700 bg-indigo-100/70',
      desc: 'Mœurs animales, prédation, ruse, alimentation, reproduction, sommeil.',
    },
    {
      id: 'anatomy',
      label: 'Anatomie & Organes',
      icon: HeartPulse,
      badgeClass: 'bg-rose-100 border-b-2 border-rose-600 text-rose-950',
      iconClass: 'text-rose-700 bg-rose-100/70',
      desc: 'Parties corporelles, membres, organes des sens, cornes, dents, ailes.',
    },
    {
      id: 'place',
      label: 'Lieux & Habitats',
      icon: MapPin,
      badgeClass: 'bg-teal-100 border-b-2 border-teal-600 text-teal-950',
      iconClass: 'text-teal-700 bg-teal-100/70',
      desc: 'Zones géographiques, biotopes, cours d’eau, mers (ex: Mauretania, Africa).',
    },
    {
      id: 'person',
      label: 'Auteurs & Autorités',
      icon: User,
      badgeClass: 'bg-sky-100 border-b-2 border-sky-600 text-sky-950',
      iconClass: 'text-sky-700 bg-sky-100/70',
      desc: 'Auteurs cités, témoins historiques, souverains (ex: Aristoteles, Caesar).',
    },
    {
      id: 'general',
      label: 'Général & Autres',
      icon: Sparkles,
      badgeClass: 'bg-stone-100 border-b-2 border-stone-500 text-stone-900',
      iconClass: 'text-stone-700 bg-stone-100/70',
      desc: 'Notions ontologiques mixtes, rituels ou termes non classifiés ailleurs.',
    },
  ]

  return (
    <div className="animate-in fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs duration-150">
      <div className="animate-in zoom-in-95 flex w-full max-w-xl flex-col overflow-hidden rounded-none border border-[#d8cebf] bg-white shadow-xl duration-150">
        {/* En-tête */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#ebdcc7] bg-[#fbf8f4] p-4 sm:p-5">
          <div className="flex items-center space-x-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-none bg-[#9A6530] text-white shadow-inner">
              <HelpCircle className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-serif text-base leading-tight font-bold text-[#2c2724]">
                Légende des annotations sémantiques
              </h2>
              <p className="text-xs text-[#8c8275]">Code couleur par typologie de concept et repères visuels</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-none p-1.5 text-[#8c8275] transition-colors hover:bg-[#f4ede2] hover:text-[#2c2724]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Contenu explicatif */}
        <div className="max-h-[75vh] scrollbar-thin space-y-5 overflow-y-auto p-5 text-xs text-[#423b32]">
          {/* Section 1 : Catégories & Couleurs */}
          <div className="space-y-2.5">
            <h3 className="flex items-center space-x-1.5 text-xs font-semibold tracking-wider text-[#9A6530] uppercase">
              <Highlighter className="h-3.5 w-3.5" />
              <span>1. Catégories thématiques TheZoo</span>
            </h3>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {categories.map((cat) => {
                const Icon = cat.icon
                return (
                  <div key={cat.id} className="space-y-1 rounded-none border border-[#ede4d4] bg-[#fdfbf9] p-2.5">
                    <div className="flex items-center justify-between">
                      <span
                        className={`inline-flex items-center space-x-1.5 rounded-none px-2 py-0.5 text-xs font-semibold ${cat.badgeClass}`}
                      >
                        <Icon className="h-3 w-3" />
                        <span>{cat.label}</span>
                      </span>
                    </div>
                    <p className="pt-0.5 text-[11px] leading-relaxed text-[#6d6458]">{cat.desc}</p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Section 2 : Chevauchements & Strates */}
          <div className="space-y-2.5 border-t border-[#f0eae0] pt-2">
            <h3 className="flex items-center space-x-1.5 text-xs font-semibold tracking-wider text-[#9A6530] uppercase">
              <Layers className="h-3.5 w-3.5" />
              <span>2. Chevauchements & Délimitations</span>
            </h3>

            <div className="space-y-2">
              <div className="space-y-1 rounded-none border border-amber-300 bg-amber-50/70 p-3">
                <div className="flex items-center space-x-2">
                  <span className="rounded-none border-b-2 border-double border-[#9A6530] bg-amber-100/90 px-1.5 py-0.5 text-xs font-medium text-[#2c2013]">
                    Texte superposé
                  </span>
                  <span className="inline-flex items-center rounded-none bg-[#9A6530]/20 px-1 py-0 align-super font-mono text-[9px] font-bold text-[#6e461f]">
                    2
                  </span>
                  <span className="text-xs font-semibold text-[#784d1e]">Chevauchement de plusieurs concepts</span>
                </div>
                <p className="text-[11px] leading-relaxed text-[#6e5d48]">
                  Lorsque 2 concepts ou plus se superposent sur un même extrait, la bordure inférieure devient{' '}
                  <strong>double</strong> et un indicateur numérique en exposant (ex: <strong>×2</strong>) s'affiche.
                </p>
              </div>

              <div className="space-y-1 rounded-none border border-[#ebdcc7] bg-[#fbf9f6] p-3">
                <div className="flex flex-wrap items-center space-x-2 gap-y-1">
                  <span className="rounded-none border-r-2 border-l-2 border-r-rose-600 border-l-rose-600 bg-rose-50/80 px-1.5 py-0.5 font-mono text-[11px] text-rose-950">
                    | Anatomie |
                  </span>
                  <span className="rounded-none border-r-2 border-l-2 border-r-indigo-600 border-l-indigo-600 bg-indigo-50/80 px-1.5 py-0.5 font-mono text-[11px] text-indigo-950">
                    | Éthologie |
                  </span>
                  <span className="text-xs font-semibold text-[#2c2724]">Bornes verticales par catégorie</span>
                </div>
                <p className="text-[11px] leading-relaxed text-[#6e6355]">
                  Des repères verticaux fins reprennent la <strong>couleur exacte de chaque catégorie</strong> (rose,
                  indigo, ambre, teal, sky) pour marquer le premier et le dernier mot de chaque emprise. Ils permettent
                  d'identifier instantanément les frontières d'annotations contiguës ou imbriquées.
                </p>
              </div>

              <div className="space-y-1 rounded-none border border-[#ebdcc7] bg-[#fbf9f6] p-3">
                <div className="flex flex-wrap items-center space-x-2 gap-y-1">
                  <span className="rounded-none border-b-2 border-rose-700 bg-rose-200 px-1.5 py-0.5 text-[11px] text-rose-950">
                    Survol anatomie
                  </span>
                  <span className="rounded-none border-b-2 border-indigo-800 bg-indigo-300 px-1.5 py-0.5 text-[11px] text-indigo-950 ring-1 ring-indigo-700/50">
                    📌 Épinglé éthologie
                  </span>
                  <span className="text-xs font-semibold text-[#2c2724]">Illumination thématique propre</span>
                </div>
                <p className="text-[11px] leading-relaxed text-[#6e6355]">
                  Au survol ou à l'épinglage d'un concept, le texte s'illumine dans la{' '}
                  <strong>couleur spécifique de sa catégorie</strong> (sans modification de graisse pour éliminer tout
                  saut de ligne). Cela évite qu'un concept ne masque l'identité visuelle des autres. L'ensemble des
                  paragraphes couverts dans l'œuvre s'accordent également à cette teinte pour faciliter le suivi
                  continu.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Pied de modal */}
        <div className="flex shrink-0 justify-end border-t border-[#ebdcc7] bg-[#fbf8f4] p-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-none bg-[#9A6530] px-4 py-1.5 text-xs font-semibold text-white shadow-xs transition-all hover:bg-[#855424]"
          >
            Fermer la légende
          </button>
        </div>
      </div>
    </div>
  )
}
