import React from 'react'
import { useI18n } from '../i18n'

export const Footer: React.FC = () => {
  const { t } = useI18n()

  const logos = [
    { src: '/logos/cnrs.png', alt: 'CNRS' },
    { src: '/logos/inria.png', alt: 'Inria' },
    { src: '/logos/i3S_Couleur.png', alt: 'Laboratoire I3S' },
    { src: '/logos/cropped-logo_cepam.png', alt: 'CEPAM' },
    { src: '/logos/uca_officiel.png', alt: 'Université Côte d\'Azur' },
    { src: '/logos/ucajedi.png', alt: 'UCA JEDI' },
  ]

  return (
    <footer className="bg-[#181614] text-[#a39a8c] border-t border-[#332e28] py-2.5 shrink-0 z-40">
      <div className="max-w-[1680px] mx-auto px-3 sm:px-5 lg:px-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        
        {/* Mentions institutionnelles condensées */}
        <div className="text-center md:text-left leading-tight text-[11px] text-[#8c8275]">
          <span className="font-semibold text-[#b8afa3]">{t.footer.projectTitle}</span> — {t.footer.projectDesc}
        </div>

        {/* Logos institutionnels discrets */}
        <div className="flex flex-wrap items-center justify-center gap-4 opacity-75 hover:opacity-100 transition-opacity">
          {logos.map((logo, i) => (
            <img
              key={i}
              src={logo.src}
              alt={logo.alt}
              className="h-5 md:h-6 object-contain filter grayscale contrast-125 hover:grayscale-0 transition-all duration-200"
            />
          ))}
        </div>

      </div>
    </footer>
  )
}
