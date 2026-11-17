import React from 'react'
import { ExternalLink, Mail, Award, Globe } from 'lucide-react'
import { useI18n } from '../i18n'
import { BASE_URL } from '../api/client'

export const About: React.FC = () => {
  const { t } = useI18n()

  return (
    <div className="mx-auto max-w-4xl space-y-8 py-8">
      {/* Présentation du projet */}
      <div className="space-y-4 rounded-none border border-[#e6dfd3] bg-white p-8 shadow-sm">
        <h1 className="font-serif text-3xl font-bold text-[#2c2724]">{t.about.title}</h1>
        <p className="text-sm leading-relaxed text-[#595248]">{t.about.projectPresentationP1}</p>
        <p className="text-sm leading-relaxed text-[#595248]">{t.about.projectPresentationP2}</p>
      </div>

      {/* Liens utiles */}
      <div className="space-y-4 rounded-none border border-[#e6dfd3] bg-white p-8 shadow-sm">
        <h2 className="flex items-center space-x-2 font-serif text-xl font-bold text-[#2c2724]">
          <Globe className="h-5 w-5 text-[#9A6530]" />
          <span>{t.about.usefulLinksTitle}</span>
        </h2>
        <div className="grid grid-cols-1 gap-4 pt-2 md:grid-cols-3">
          <a
            href="https://github.com/Wimmics/zoomathia"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between rounded-none border border-[#ebe4d6] bg-[#faf9f6] p-4 text-xs font-medium text-[#2c2724] transition-colors hover:border-[#9A6530] hover:text-[#9A6530]"
          >
            <span>{t.about.githubRepo}</span>
            <ExternalLink className="h-4 w-4" />
          </a>
          <a
            href={`${BASE_URL}/docs`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between rounded-none border border-[#ebe4d6] bg-[#faf9f6] p-4 text-xs font-medium text-[#2c2724] transition-colors hover:border-[#9A6530] hover:text-[#9A6530]"
          >
            <span>{t.about.sparqlEndpoint}</span>
            <ExternalLink className="h-4 w-4" />
          </a>
          <a
            href="https://opentheso.huma-num.fr/opentheso/?idt=th310"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between rounded-none border border-[#ebe4d6] bg-[#faf9f6] p-4 text-xs font-medium text-[#2c2724] transition-colors hover:border-[#9A6530] hover:text-[#9A6530]"
          >
            <span>{t.about.theZooThesaurus}</span>
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>

      {/* Financement & Réseau de recherche */}
      <div className="space-y-4 rounded-none border border-[#e6dfd3] bg-white p-8 shadow-sm">
        <h2 className="flex items-center space-x-2 font-serif text-xl font-bold text-[#2c2724]">
          <Award className="h-5 w-5 text-[#9A6530]" />
          <span>{t.about.supportPartnersTitle}</span>
        </h2>
        <p className="text-sm leading-relaxed text-[#595248]">{t.about.supportP1}</p>
        <p className="text-sm leading-relaxed text-[#595248]">{t.about.supportP2}</p>
      </div>

      {/* Contacts Scientifiques */}
      <div className="space-y-4 rounded-none border border-[#e6dfd3] bg-white p-8 shadow-sm">
        <h2 className="flex items-center space-x-2 font-serif text-xl font-bold text-[#2c2724]">
          <Mail className="h-5 w-5 text-[#9A6530]" />
          <span>{t.about.scientificLeadsTitle}</span>
        </h2>
        <div className="grid grid-cols-1 gap-4 pt-2 md:grid-cols-2">
          <div className="space-y-1 rounded-none border border-[#ebe4d6] bg-[#faf9f6] p-4">
            <h4 className="text-sm font-semibold text-[#2c2724]">Catherine Faron</h4>
            <p className="text-xs text-[#736a5f]">{t.about.catherineFaronRole}</p>
            <a
              href="mailto:catherine.faron@univ-cotedazur.fr"
              className="block pt-1 text-xs text-[#9A6530] hover:underline"
            >
              catherine.faron@univ-cotedazur.fr
            </a>
          </div>
          <div className="space-y-1 rounded-none border border-[#ebe4d6] bg-[#faf9f6] p-4">
            <h4 className="text-sm font-semibold text-[#2c2724]">Arnaud Zucker</h4>
            <p className="text-xs text-[#736a5f]">{t.about.arnaudZuckerRole}</p>
            <a
              href="mailto:Arnaud.Zucker@univ-cotedazur.fr"
              className="block pt-1 text-xs text-[#9A6530] hover:underline"
            >
              Arnaud.Zucker@univ-cotedazur.fr
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
