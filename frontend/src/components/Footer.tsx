import React from 'react'
import { useI18n } from '../i18n'

export const Footer: React.FC = () => {
  const { t } = useI18n()

  const logos = [
    { src: '/logos/cnrs.png', alt: 'CNRS' },
    { src: '/logos/inria.png', alt: 'Inria' },
    { src: '/logos/i3S_Couleur.png', alt: 'Laboratoire I3S' },
    { src: '/logos/cropped-logo_cepam.png', alt: 'CEPAM' },
    { src: '/logos/uca_officiel.png', alt: "Université Côte d'Azur" },
    { src: '/logos/ucajedi.png', alt: 'UCA JEDI' },
  ]

  return (
    <footer className="z-40 shrink-0 border-t border-[#332e28] bg-[#181614] py-2.5 text-[#a39a8c]">
      <div className="mx-auto flex max-w-[1680px] flex-col items-center justify-between gap-3 px-3 text-xs sm:px-5 md:flex-row lg:px-6">
        {/* Mentions institutionnelles condensées */}
        <div className="text-center text-[11px] leading-tight text-[#8c8275] md:text-left">
          <span className="font-semibold text-[#b8afa3]">{t.footer.projectTitle}</span> — {t.footer.projectDesc}
        </div>

        {/* Logos institutionnels discrets */}
        <div className="flex flex-wrap items-center justify-center gap-4 opacity-75 transition-opacity hover:opacity-100">
          {logos.map((logo, i) => (
            <img
              key={i}
              src={logo.src}
              alt={logo.alt}
              className="h-5 object-contain contrast-125 grayscale filter transition-all duration-200 hover:grayscale-0 md:h-6"
            />
          ))}
        </div>
      </div>
    </footer>
  )
}
