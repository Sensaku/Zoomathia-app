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
  CheckCircle2
} from 'lucide-react'

interface AnnotationLegendModalProps {
  isOpen: boolean
  onClose: () => void
}

export const AnnotationLegendModal: React.FC<AnnotationLegendModalProps> = ({
  isOpen,
  onClose
}) => {
  if (!isOpen) return null

  const categories = [
    {
      id: 'animal',
      label: 'Animaux & Taxons',
      icon: PawPrint,
      badgeClass: 'bg-amber-100 border-b-2 border-amber-600 text-amber-950',
      iconClass: 'text-amber-700 bg-amber-100/70',
      desc: 'Zoonymes, espèces, genres et taxons anciens (ex: elephas, canis, aquila, leo).'
    },
    {
      id: 'behavior',
      label: 'Comportements & Éthologie',
      icon: Activity,
      badgeClass: 'bg-indigo-100 border-b-2 border-indigo-600 text-indigo-950',
      iconClass: 'text-indigo-700 bg-indigo-100/70',
      desc: 'Mœurs animales, prédation, ruse, alimentation, reproduction, sommeil.'
    },
    {
      id: 'anatomy',
      label: 'Anatomie & Organes',
      icon: HeartPulse,
      badgeClass: 'bg-rose-100 border-b-2 border-rose-600 text-rose-950',
      iconClass: 'text-rose-700 bg-rose-100/70',
      desc: 'Parties corporelles, membres, organes des sens, cornes, dents, ailes.'
    },
    {
      id: 'place',
      label: 'Lieux & Habitats',
      icon: MapPin,
      badgeClass: 'bg-teal-100 border-b-2 border-teal-600 text-teal-950',
      iconClass: 'text-teal-700 bg-teal-100/70',
      desc: 'Zones géographiques, biotopes, cours d’eau, mers (ex: Mauretania, Africa).'
    },
    {
      id: 'person',
      label: 'Auteurs & Autorités',
      icon: User,
      badgeClass: 'bg-sky-100 border-b-2 border-sky-600 text-sky-950',
      iconClass: 'text-sky-700 bg-sky-100/70',
      desc: 'Auteurs cités, témoins historiques, souverains (ex: Aristoteles, Caesar).'
    },
    {
      id: 'general',
      label: 'Général & Autres',
      icon: Sparkles,
      badgeClass: 'bg-stone-100 border-b-2 border-stone-500 text-stone-900',
      iconClass: 'text-stone-700 bg-stone-100/70',
      desc: 'Notions ontologiques mixtes, rituels ou termes non classifiés ailleurs.'
    }
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-none max-w-xl w-full border border-[#d8cebf] shadow-xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        
        {/* En-tête */}
        <div className="p-4 sm:p-5 border-b border-[#ebdcc7] bg-[#fbf8f4] flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-none bg-[#9A6530] text-white flex items-center justify-center shadow-inner">
              <HelpCircle className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-serif font-bold text-base text-[#2c2724] leading-tight">
                Légende des annotations sémantiques
              </h2>
              <p className="text-xs text-[#8c8275]">
                Code couleur par typologie de concept et repères visuels
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#8c8275] hover:text-[#2c2724] p-1.5 rounded-none hover:bg-[#f4ede2] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenu explicatif */}
        <div className="p-5 overflow-y-auto max-h-[75vh] space-y-5 text-xs text-[#423b32] scrollbar-thin">
          
          {/* Section 1 : Catégories & Couleurs */}
          <div className="space-y-2.5">
            <h3 className="font-semibold text-xs uppercase tracking-wider text-[#9A6530] flex items-center space-x-1.5">
              <Highlighter className="w-3.5 h-3.5" />
              <span>1. Catégories thématiques TheZoo</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {categories.map((cat) => {
                const Icon = cat.icon
                return (
                  <div
                    key={cat.id}
                    className="p-2.5 rounded-none border border-[#ede4d4] bg-[#fdfbf9] space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-none text-xs font-semibold ${cat.badgeClass}`}>
                        <Icon className="w-3 h-3" />
                        <span>{cat.label}</span>
                      </span>
                    </div>
                    <p className="text-[11px] text-[#6d6458] leading-relaxed pt-0.5">
                      {cat.desc}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Section 2 : Chevauchements & Strates */}
          <div className="space-y-2.5 pt-2 border-t border-[#f0eae0]">
            <h3 className="font-semibold text-xs uppercase tracking-wider text-[#9A6530] flex items-center space-x-1.5">
              <Layers className="w-3.5 h-3.5" />
              <span>2. Chevauchements & Délimitations</span>
            </h3>

            <div className="space-y-2">
              <div className="p-3 rounded-none border border-amber-300 bg-amber-50/70 space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="bg-amber-100/90 border-b-2 border-double border-[#9A6530] text-[#2c2013] px-1.5 py-0.5 rounded-none font-medium text-xs">
                    Texte superposé
                  </span>
                  <span className="inline-flex items-center text-[9px] font-mono font-bold px-1 py-0 rounded-none bg-[#9A6530]/20 text-[#6e461f] align-super">
                    2
                  </span>
                  <span className="font-semibold text-xs text-[#784d1e]">
                    Chevauchement de plusieurs concepts
                  </span>
                </div>
                <p className="text-[11px] text-[#6e5d48] leading-relaxed">
                  Lorsque 2 concepts ou plus se superposent sur un même extrait, la bordure inférieure devient <strong>double</strong> et un indicateur numérique en exposant (ex: <strong>×2</strong>) s'affiche.
                </p>
              </div>

              <div className="p-3 rounded-none border border-[#ebdcc7] bg-[#fbf9f6] space-y-1">
                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                  <span className="border-l-2 border-l-rose-600 border-r-2 border-r-rose-600 bg-rose-50/80 text-rose-950 px-1.5 py-0.5 rounded-none text-[11px] font-mono">
                    | Anatomie |
                  </span>
                  <span className="border-l-2 border-l-indigo-600 border-r-2 border-r-indigo-600 bg-indigo-50/80 text-indigo-950 px-1.5 py-0.5 rounded-none text-[11px] font-mono">
                    | Éthologie |
                  </span>
                  <span className="font-semibold text-xs text-[#2c2724]">
                    Bornes verticales par catégorie
                  </span>
                </div>
                <p className="text-[11px] text-[#6e6355] leading-relaxed">
                  Des repères verticaux fins reprennent la <strong>couleur exacte de chaque catégorie</strong> (rose, indigo, ambre, teal, sky) pour marquer le premier et le dernier mot de chaque emprise. Ils permettent d'identifier instantanément les frontières d'annotations contiguës ou imbriquées.
                </p>
              </div>

              <div className="p-3 rounded-none border border-[#ebdcc7] bg-[#fbf9f6] space-y-1">
                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                  <span className="bg-rose-200 text-rose-950 border-b-2 border-rose-700 px-1.5 py-0.5 rounded-none text-[11px]">
                    Survol anatomie
                  </span>
                  <span className="bg-indigo-300 text-indigo-950 border-b-2 border-indigo-800 ring-1 ring-indigo-700/50 px-1.5 py-0.5 rounded-none text-[11px]">
                    📌 Épinglé éthologie
                  </span>
                  <span className="font-semibold text-xs text-[#2c2724]">
                    Illumination thématique propre
                  </span>
                </div>
                <p className="text-[11px] text-[#6e6355] leading-relaxed">
                  Au survol ou à l'épinglage d'un concept, le texte s'illumine dans la <strong>couleur spécifique de sa catégorie</strong> (sans modification de graisse pour éliminer tout saut de ligne). Cela évite qu'un concept ne masque l'identité visuelle des autres. L'ensemble des paragraphes couverts dans l'œuvre s'accordent également à cette teinte pour faciliter le suivi continu.
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* Pied de modal */}
        <div className="p-3.5 border-t border-[#ebdcc7] bg-[#fbf8f4] flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-[#9A6530] hover:bg-[#855424] text-white rounded-none text-xs font-semibold transition-all shadow-xs"
          >
            Fermer la légende
          </button>
        </div>

      </div>
    </div>
  )
}
