import React from 'react'
import { ExternalLink, Mail, Award, Globe } from 'lucide-react'
import { useI18n } from '../i18n'
import { BASE_URL } from '../api/client'

export const About: React.FC = () => {
  const { t } = useI18n()

  return (
    <div className="py-8 max-w-4xl mx-auto space-y-8">
      
      {/* Présentation du projet */}
      <div className="bg-white p-8 rounded-none border border-[#e6dfd3] shadow-sm space-y-4">
        <h1 className="font-serif text-3xl font-bold text-[#2c2724]">
          {t.about.title}
        </h1>
        <p className="text-sm text-[#595248] leading-relaxed">
          {t.about.projectPresentationP1}
        </p>
        <p className="text-sm text-[#595248] leading-relaxed">
          {t.about.projectPresentationP2}
        </p>
      </div>

      {/* Liens utiles */}
      <div className="bg-white p-8 rounded-none border border-[#e6dfd3] shadow-sm space-y-4">
        <h2 className="font-serif text-xl font-bold text-[#2c2724] flex items-center space-x-2">
          <Globe className="w-5 h-5 text-[#9A6530]" />
          <span>{t.about.usefulLinksTitle}</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <a
            href="https://github.com/Wimmics/zoomathia"
            target="_blank"
            rel="noreferrer"
            className="p-4 rounded-none bg-[#faf9f6] border border-[#ebe4d6] hover:border-[#9A6530] text-xs font-medium text-[#2c2724] hover:text-[#9A6530] flex items-center justify-between transition-colors"
          >
            <span>{t.about.githubRepo}</span>
            <ExternalLink className="w-4 h-4" />
          </a>
          <a
            href={`${BASE_URL}/docs`}
            target="_blank"
            rel="noreferrer"
            className="p-4 rounded-none bg-[#faf9f6] border border-[#ebe4d6] hover:border-[#9A6530] text-xs font-medium text-[#2c2724] hover:text-[#9A6530] flex items-center justify-between transition-colors"
          >
            <span>{t.about.sparqlEndpoint}</span>
            <ExternalLink className="w-4 h-4" />
          </a>
          <a
            href="https://opentheso.huma-num.fr/opentheso/?idt=th310"
            target="_blank"
            rel="noreferrer"
            className="p-4 rounded-none bg-[#faf9f6] border border-[#ebe4d6] hover:border-[#9A6530] text-xs font-medium text-[#2c2724] hover:text-[#9A6530] flex items-center justify-between transition-colors"
          >
            <span>{t.about.theZooThesaurus}</span>
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Financement & Réseau de recherche */}
      <div className="bg-white p-8 rounded-none border border-[#e6dfd3] shadow-sm space-y-4">
        <h2 className="font-serif text-xl font-bold text-[#2c2724] flex items-center space-x-2">
          <Award className="w-5 h-5 text-[#9A6530]" />
          <span>{t.about.supportPartnersTitle}</span>
        </h2>
        <p className="text-sm text-[#595248] leading-relaxed">
          {t.about.supportP1}
        </p>
        <p className="text-sm text-[#595248] leading-relaxed">
          {t.about.supportP2}
        </p>
      </div>

      {/* Contacts Scientifiques */}
      <div className="bg-white p-8 rounded-none border border-[#e6dfd3] shadow-sm space-y-4">
        <h2 className="font-serif text-xl font-bold text-[#2c2724] flex items-center space-x-2">
          <Mail className="w-5 h-5 text-[#9A6530]" />
          <span>{t.about.scientificLeadsTitle}</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="p-4 rounded-none bg-[#faf9f6] border border-[#ebe4d6] space-y-1">
            <h4 className="font-semibold text-sm text-[#2c2724]">Catherine Faron</h4>
            <p className="text-xs text-[#736a5f]">{t.about.catherineFaronRole}</p>
            <a href="mailto:catherine.faron@univ-cotedazur.fr" className="text-xs text-[#9A6530] hover:underline block pt-1">
              catherine.faron@univ-cotedazur.fr
            </a>
          </div>
          <div className="p-4 rounded-none bg-[#faf9f6] border border-[#ebe4d6] space-y-1">
            <h4 className="font-semibold text-sm text-[#2c2724]">Arnaud Zucker</h4>
            <p className="text-xs text-[#736a5f]">{t.about.arnaudZuckerRole}</p>
            <a href="mailto:Arnaud.Zucker@univ-cotedazur.fr" className="text-xs text-[#9A6530] hover:underline block pt-1">
              Arnaud.Zucker@univ-cotedazur.fr
            </a>
          </div>
        </div>
      </div>

    </div>
  )
}
