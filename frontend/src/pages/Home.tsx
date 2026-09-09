import React from 'react'
import { Link } from 'react-router-dom'
import {
  BookOpen,
  Search,
  Highlighter,
  HelpCircle,
  Code,
  Layers,
  ArrowRight,
  ShieldCheck,
  Database,
  Cpu,
} from 'lucide-react'
import { useI18n } from '../i18n'

export const Home: React.FC = () => {
  const { t } = useI18n()

  return (
    <div className="space-y-12 py-8">
      
      {/* Hero Section avec la Mosaïque du Nil de Palestrina */}
      <section className="relative overflow-hidden rounded-none p-8 md:p-14 shadow-xl border border-[#7d603e]/40 group min-h-[380px] flex items-center">
        {/* Image de fond Mosaïque de Palestrina */}
        <img
          src="/NileMosaicOfPalestrina.jpg"
          alt="Mosaïque du Nil de Palestrina"
          className="absolute inset-0 w-full h-full object-cover object-center filter saturate-[1.15] contrast-[1.05] transition-transform duration-700 ease-out group-hover:scale-105"
        />

        {/* Dégradé directionnel assurant une lisibilité textuelle optimale tout en révélant la mosaïque */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#171412]/92 via-[#1d1916]/75 to-[#1a1614]/35" />

        {/* Contenu textuel */}
        <div className="relative z-10 max-w-2xl space-y-5">
          <div className="inline-flex items-center space-x-2 bg-[#9A6530]/40 backdrop-blur-xs text-[#f4e8d8] px-3.5 py-1 rounded-full text-xs font-medium tracking-wide border border-[#b87c42]/60 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-[#e8a364] animate-pulse"></span>
            <span>{t.home.badge}</span>
          </div>

          <h1 className="font-serif text-3xl md:text-5xl font-bold tracking-tight text-white leading-tight drop-shadow-md">
            {t.home.heroTitle}
          </h1>

          <p className="text-[#e2dcd2] text-base md:text-lg leading-relaxed drop-shadow-xs font-normal">
            {t.home.heroDesc}
          </p>

          <div className="pt-2 flex flex-wrap gap-4">
            <Link
              to="/explore-work"
              className="inline-flex items-center space-x-2 bg-[#9A6530] hover:bg-[#855424] text-white px-5 py-3 rounded-none font-medium shadow-md hover:shadow-lg transition-all"
            >
              <span>{t.home.exploreWorkBtn}</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/competency-questions"
              className="inline-flex items-center space-x-2 bg-[#2c2621]/80 hover:bg-[#3d352e] backdrop-blur-xs text-[#f3ebd9] px-5 py-3 rounded-none font-medium border border-[#6b5847] transition-all shadow-md"
            >
              <span>{t.home.cqsBtn}</span>
              <HelpCircle className="w-4 h-4" />
            </Link>
          </div>

          {/* Raccourcis directs discrets vers les autres modules */}
          <div className="pt-1 flex flex-wrap items-center gap-2 text-xs text-[#d1c7ba]">
            <span className="text-[#a89e90] text-xs font-medium uppercase tracking-wider">
              {t.home.quickAccess}
            </span>
            <Link
              to="/annotate"
              className="hover:text-white underline underline-offset-4 decoration-[#9A6530]/60 hover:decoration-white transition-colors"
            >
              {t.nav.annotate}
            </Link>
            <span className="text-[#6e6355]">•</span>
            <Link
              to="/sparql"
              className="hover:text-white underline underline-offset-4 decoration-[#9A6530]/60 hover:decoration-white transition-colors"
            >
              {t.nav.sparql}
            </Link>
            <span className="text-[#6e6355]">•</span>
            <Link
              to="/thesaurus-proposals"
              className="hover:text-white underline underline-offset-4 decoration-[#9A6530]/60 hover:decoration-white transition-colors"
            >
              {t.nav.thesaurus}
            </Link>
          </div>
        </div>
      </section>

      {/* Modules de la Plateforme structurés par piliers scientifiques */}
      <section className="space-y-8">
        
        {/* Groupe 1 : Textes & Corpus */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#e6dfd3] pb-2.5">
            <div className="flex items-center space-x-2.5">
              <div className="p-1.5 rounded-none bg-[#f5efe6] text-[#9A6530]">
                <BookOpen className="w-4 h-4" />
              </div>
              <h2 className="font-serif font-bold text-lg text-[#2c2724] tracking-wide">
                {t.nav.textsAndCorpus}
              </h2>
            </div>
            <span className="text-xs text-[#8c8275] hidden sm:inline">
              {t.home.groupTextsDesc}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* 1. Liseuse d'œuvre */}
            <Link
              to="/explore-work"
              className="group p-6 rounded-none bg-white border border-[#e6dfd3] hover:border-[#9A6530] shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-none bg-[#f4ede2] text-[#9A6530] flex items-center justify-center group-hover:scale-105 transition-transform">
                  <BookOpen className="w-6 h-6" />
                </div>
                <h3 className="font-serif font-bold text-xl text-[#2c2724]">{t.home.cardWorkTitle}</h3>
                <p className="text-sm text-[#696156] leading-relaxed">
                  {t.home.cardWorkDesc}
                </p>
              </div>
              <span className="inline-flex items-center text-xs font-semibold text-[#9A6530] mt-4 pt-2 border-t border-[#f0eae0]">
                {t.home.cardWorkAction} <ArrowRight className="w-3.5 h-3.5 ml-1 group-hover:translate-x-1 transition-transform" />
              </span>
            </Link>

            {/* 2. Recherche transversale de corpus */}
            <Link
              to="/explore-corpus"
              className="group p-6 rounded-none bg-white border border-[#e6dfd3] hover:border-[#3b6ea5] shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-none bg-[#eaf0f8] text-[#3b6ea5] flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Search className="w-6 h-6" />
                </div>
                <h3 className="font-serif font-bold text-xl text-[#2c2724]">{t.home.cardCorpusTitle}</h3>
                <p className="text-sm text-[#696156] leading-relaxed">
                  {t.home.cardCorpusDesc}
                </p>
              </div>
              <span className="inline-flex items-center text-xs font-semibold text-[#3b6ea5] mt-4 pt-2 border-t border-[#f0eae0]">
                {t.home.cardCorpusAction} <ArrowRight className="w-3.5 h-3.5 ml-1 group-hover:translate-x-1 transition-transform" />
              </span>
            </Link>

            {/* 3. Annotation de corpus */}
            <Link
              to="/annotate"
              className="group p-6 rounded-none bg-white border border-[#e6dfd3] hover:border-[#2d7a5b] shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-none bg-[#eaf5ef] text-[#2d7a5b] flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Highlighter className="w-6 h-6" />
                </div>
                <h3 className="font-serif font-bold text-xl text-[#2c2724]">{t.home.cardAnnotateTitle}</h3>
                <p className="text-sm text-[#696156] leading-relaxed">
                  {t.home.cardAnnotateDesc}
                </p>
              </div>
              <span className="inline-flex items-center text-xs font-semibold text-[#2d7a5b] mt-4 pt-2 border-t border-[#f0eae0]">
                {t.home.cardAnnotateAction} <ArrowRight className="w-3.5 h-3.5 ml-1 group-hover:translate-x-1 transition-transform" />
              </span>
            </Link>

          </div>
        </div>

        {/* Groupe 2 : Données & Sémantique */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#e6dfd3] pb-2.5">
            <div className="flex items-center space-x-2.5">
              <div className="p-1.5 rounded-none bg-[#f5efe6] text-[#9A6530]">
                <Database className="w-4 h-4" />
              </div>
              <h2 className="font-serif font-bold text-lg text-[#2c2724] tracking-wide">
                {t.nav.dataAndSemantics}
              </h2>
            </div>
            <span className="text-xs text-[#8c8275] hidden sm:inline">
              {t.home.groupDataDesc}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* 4. Questions de compétence (CQs) */}
            <Link
              to="/competency-questions"
              className="group p-6 rounded-none bg-white border border-[#e6dfd3] hover:border-[#6d4da8] shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-none bg-[#f0ecf7] text-[#6d4da8] flex items-center justify-center group-hover:scale-105 transition-transform">
                  <HelpCircle className="w-6 h-6" />
                </div>
                <h3 className="font-serif font-bold text-xl text-[#2c2724]">{t.home.cardCqsTitle}</h3>
                <p className="text-sm text-[#696156] leading-relaxed">
                  {t.home.cardCqsDesc}
                </p>
              </div>
              <span className="inline-flex items-center text-xs font-semibold text-[#6d4da8] mt-4 pt-2 border-t border-[#f0eae0]">
                {t.home.cardCqsAction} <ArrowRight className="w-3.5 h-3.5 ml-1 group-hover:translate-x-1 transition-transform" />
              </span>
            </Link>

            {/* 5. Playground SPARQL */}
            <Link
              to="/sparql"
              className="group p-6 rounded-none bg-white border border-[#e6dfd3] hover:border-[#1f6f8b] shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-none bg-[#e8f1f5] text-[#1f6f8b] flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Code className="w-6 h-6" />
                </div>
                <h3 className="font-serif font-bold text-xl text-[#2c2724]">{t.home.cardSparqlTitle}</h3>
                <p className="text-sm text-[#696156] leading-relaxed">
                  {t.home.cardSparqlDesc}
                </p>
              </div>
              <span className="inline-flex items-center text-xs font-semibold text-[#1f6f8b] mt-4 pt-2 border-t border-[#f0eae0]">
                {t.home.cardSparqlAction} <ArrowRight className="w-3.5 h-3.5 ml-1 group-hover:translate-x-1 transition-transform" />
              </span>
            </Link>

            {/* 6. Thésaurus TheZoo */}
            <Link
              to="/thesaurus-proposals"
              className="group p-6 rounded-none bg-white border border-[#e6dfd3] hover:border-[#c26d1a] shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-none bg-[#fdf3e7] text-[#c26d1a] flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Layers className="w-6 h-6" />
                </div>
                <h3 className="font-serif font-bold text-xl text-[#2c2724]">{t.home.cardThesaurusTitle}</h3>
                <p className="text-sm text-[#696156] leading-relaxed">
                  {t.home.cardThesaurusDesc}
                </p>
              </div>
              <span className="inline-flex items-center text-xs font-semibold text-[#c26d1a] mt-4 pt-2 border-t border-[#f0eae0]">
                {t.home.cardThesaurusAction} <ArrowRight className="w-3.5 h-3.5 ml-1 group-hover:translate-x-1 transition-transform" />
              </span>
            </Link>

          </div>
        </div>

      </section>

      {/* Piliers Scientifiques & Socle Technique */}
      <section className="bg-white rounded-none border border-[#e6dfd3] p-8 shadow-sm">
        <h2 className="font-serif text-2xl font-bold text-[#2c2724] mb-6 text-center">
          {t.home.pillarsTitle}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          <div className="flex items-start space-x-4">
            <div className="p-2.5 rounded-none bg-[#f5f2eb] text-[#9A6530] shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-semibold text-[#2c2724] text-base mb-1">{t.home.pillarRdfTitle}</h4>
              <p className="text-xs text-[#696156] leading-relaxed">
                {t.home.pillarRdfDesc}
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-4">
            <div className="p-2.5 rounded-none bg-[#f5f2eb] text-[#9A6530] shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-semibold text-[#2c2724] text-base mb-1">{t.home.pillarW3cTitle}</h4>
              <p className="text-xs text-[#696156] leading-relaxed">
                {t.home.pillarW3cDesc}
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-4">
            <div className="p-2.5 rounded-none bg-[#f5f2eb] text-[#9A6530] shrink-0">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-semibold text-[#2c2724] text-base mb-1">{t.home.pillarNlpTitle}</h4>
              <p className="text-xs text-[#696156] leading-relaxed">
                {t.home.pillarNlpDesc}
              </p>
            </div>
          </div>

        </div>
      </section>

    </div>
  )
}
