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
      <section className="group relative flex min-h-[380px] items-center overflow-hidden rounded-none border border-[#7d603e]/40 p-8 shadow-xl md:p-14">
        {/* Image de fond Mosaïque de Palestrina */}
        <img
          src="/NileMosaicOfPalestrina.jpg"
          alt="Mosaïque du Nil de Palestrina"
          className="absolute inset-0 h-full w-full object-cover object-center contrast-[1.05] saturate-[1.15] filter transition-transform duration-700 ease-out group-hover:scale-105"
        />

        {/* Dégradé directionnel assurant une lisibilité textuelle optimale tout en révélant la mosaïque */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#171412]/92 via-[#1d1916]/75 to-[#1a1614]/35" />

        {/* Contenu textuel */}
        <div className="relative z-10 max-w-2xl space-y-5">
          <div className="inline-flex items-center space-x-2 rounded-full border border-[#b87c42]/60 bg-[#9A6530]/40 px-3.5 py-1 text-xs font-medium tracking-wide text-[#f4e8d8] shadow-xs backdrop-blur-xs">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#e8a364]"></span>
            <span>{t.home.badge}</span>
          </div>

          <h1 className="font-serif text-3xl leading-tight font-bold tracking-tight text-white drop-shadow-md md:text-5xl">
            {t.home.heroTitle}
          </h1>

          <p className="text-base leading-relaxed font-normal text-[#e2dcd2] drop-shadow-xs md:text-lg">
            {t.home.heroDesc}
          </p>

          <div className="flex flex-wrap gap-4 pt-2">
            <Link
              to="/explore-work"
              className="inline-flex items-center space-x-2 rounded-none bg-[#9A6530] px-5 py-3 font-medium text-white shadow-md transition-all hover:bg-[#855424] hover:shadow-lg"
            >
              <span>{t.home.exploreWorkBtn}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/competency-questions"
              className="inline-flex items-center space-x-2 rounded-none border border-[#6b5847] bg-[#2c2621]/80 px-5 py-3 font-medium text-[#f3ebd9] shadow-md backdrop-blur-xs transition-all hover:bg-[#3d352e]"
            >
              <span>{t.home.cqsBtn}</span>
              <HelpCircle className="h-4 w-4" />
            </Link>
          </div>

          {/* Raccourcis directs discrets vers les autres modules */}
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-[#d1c7ba]">
            <span className="text-xs font-medium tracking-wider text-[#a89e90] uppercase">{t.home.quickAccess}</span>
            <Link
              to="/annotate"
              className="underline decoration-[#9A6530]/60 underline-offset-4 transition-colors hover:text-white hover:decoration-white"
            >
              {t.nav.annotate}
            </Link>
            <span className="text-[#6e6355]">•</span>
            <Link
              to="/sparql"
              className="underline decoration-[#9A6530]/60 underline-offset-4 transition-colors hover:text-white hover:decoration-white"
            >
              {t.nav.sparql}
            </Link>
            <span className="text-[#6e6355]">•</span>
            <Link
              to="/thesaurus-proposals"
              className="underline decoration-[#9A6530]/60 underline-offset-4 transition-colors hover:text-white hover:decoration-white"
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
              <div className="rounded-none bg-[#f5efe6] p-1.5 text-[#9A6530]">
                <BookOpen className="h-4 w-4" />
              </div>
              <h2 className="font-serif text-lg font-bold tracking-wide text-[#2c2724]">{t.nav.textsAndCorpus}</h2>
            </div>
            <span className="hidden text-xs text-[#8c8275] sm:inline">{t.home.groupTextsDesc}</span>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {/* 1. Liseuse d'œuvre */}
            <Link
              to="/explore-work"
              className="group flex flex-col justify-between rounded-none border border-[#e6dfd3] bg-white p-6 shadow-xs transition-all hover:border-[#9A6530] hover:shadow-md"
            >
              <div className="space-y-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-none bg-[#f4ede2] text-[#9A6530] transition-transform group-hover:scale-105">
                  <BookOpen className="h-6 w-6" />
                </div>
                <h3 className="font-serif text-xl font-bold text-[#2c2724]">{t.home.cardWorkTitle}</h3>
                <p className="text-sm leading-relaxed text-[#696156]">{t.home.cardWorkDesc}</p>
              </div>
              <span className="mt-4 inline-flex items-center border-t border-[#f0eae0] pt-2 text-xs font-semibold text-[#9A6530]">
                {t.home.cardWorkAction}{' '}
                <ArrowRight className="ml-1 h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>

            {/* 2. Recherche transversale de corpus */}
            <Link
              to="/explore-corpus"
              className="group flex flex-col justify-between rounded-none border border-[#e6dfd3] bg-white p-6 shadow-xs transition-all hover:border-[#3b6ea5] hover:shadow-md"
            >
              <div className="space-y-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-none bg-[#eaf0f8] text-[#3b6ea5] transition-transform group-hover:scale-105">
                  <Search className="h-6 w-6" />
                </div>
                <h3 className="font-serif text-xl font-bold text-[#2c2724]">{t.home.cardCorpusTitle}</h3>
                <p className="text-sm leading-relaxed text-[#696156]">{t.home.cardCorpusDesc}</p>
              </div>
              <span className="mt-4 inline-flex items-center border-t border-[#f0eae0] pt-2 text-xs font-semibold text-[#3b6ea5]">
                {t.home.cardCorpusAction}{' '}
                <ArrowRight className="ml-1 h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>

            {/* 3. Annotation de corpus */}
            <Link
              to="/annotate"
              className="group flex flex-col justify-between rounded-none border border-[#e6dfd3] bg-white p-6 shadow-xs transition-all hover:border-[#2d7a5b] hover:shadow-md"
            >
              <div className="space-y-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-none bg-[#eaf5ef] text-[#2d7a5b] transition-transform group-hover:scale-105">
                  <Highlighter className="h-6 w-6" />
                </div>
                <h3 className="font-serif text-xl font-bold text-[#2c2724]">{t.home.cardAnnotateTitle}</h3>
                <p className="text-sm leading-relaxed text-[#696156]">{t.home.cardAnnotateDesc}</p>
              </div>
              <span className="mt-4 inline-flex items-center border-t border-[#f0eae0] pt-2 text-xs font-semibold text-[#2d7a5b]">
                {t.home.cardAnnotateAction}{' '}
                <ArrowRight className="ml-1 h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          </div>
        </div>

        {/* Groupe 2 : Données & Sémantique */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#e6dfd3] pb-2.5">
            <div className="flex items-center space-x-2.5">
              <div className="rounded-none bg-[#f5efe6] p-1.5 text-[#9A6530]">
                <Database className="h-4 w-4" />
              </div>
              <h2 className="font-serif text-lg font-bold tracking-wide text-[#2c2724]">{t.nav.dataAndSemantics}</h2>
            </div>
            <span className="hidden text-xs text-[#8c8275] sm:inline">{t.home.groupDataDesc}</span>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {/* 4. Questions de compétence (CQs) */}
            <Link
              to="/competency-questions"
              className="group flex flex-col justify-between rounded-none border border-[#e6dfd3] bg-white p-6 shadow-xs transition-all hover:border-[#6d4da8] hover:shadow-md"
            >
              <div className="space-y-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-none bg-[#f0ecf7] text-[#6d4da8] transition-transform group-hover:scale-105">
                  <HelpCircle className="h-6 w-6" />
                </div>
                <h3 className="font-serif text-xl font-bold text-[#2c2724]">{t.home.cardCqsTitle}</h3>
                <p className="text-sm leading-relaxed text-[#696156]">{t.home.cardCqsDesc}</p>
              </div>
              <span className="mt-4 inline-flex items-center border-t border-[#f0eae0] pt-2 text-xs font-semibold text-[#6d4da8]">
                {t.home.cardCqsAction}{' '}
                <ArrowRight className="ml-1 h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>

            {/* 5. Playground SPARQL */}
            <Link
              to="/sparql"
              className="group flex flex-col justify-between rounded-none border border-[#e6dfd3] bg-white p-6 shadow-xs transition-all hover:border-[#1f6f8b] hover:shadow-md"
            >
              <div className="space-y-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-none bg-[#e8f1f5] text-[#1f6f8b] transition-transform group-hover:scale-105">
                  <Code className="h-6 w-6" />
                </div>
                <h3 className="font-serif text-xl font-bold text-[#2c2724]">{t.home.cardSparqlTitle}</h3>
                <p className="text-sm leading-relaxed text-[#696156]">{t.home.cardSparqlDesc}</p>
              </div>
              <span className="mt-4 inline-flex items-center border-t border-[#f0eae0] pt-2 text-xs font-semibold text-[#1f6f8b]">
                {t.home.cardSparqlAction}{' '}
                <ArrowRight className="ml-1 h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>

            {/* 6. Thésaurus TheZoo */}
            <Link
              to="/thesaurus-proposals"
              className="group flex flex-col justify-between rounded-none border border-[#e6dfd3] bg-white p-6 shadow-xs transition-all hover:border-[#c26d1a] hover:shadow-md"
            >
              <div className="space-y-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-none bg-[#fdf3e7] text-[#c26d1a] transition-transform group-hover:scale-105">
                  <Layers className="h-6 w-6" />
                </div>
                <h3 className="font-serif text-xl font-bold text-[#2c2724]">{t.home.cardThesaurusTitle}</h3>
                <p className="text-sm leading-relaxed text-[#696156]">{t.home.cardThesaurusDesc}</p>
              </div>
              <span className="mt-4 inline-flex items-center border-t border-[#f0eae0] pt-2 text-xs font-semibold text-[#c26d1a]">
                {t.home.cardThesaurusAction}{' '}
                <ArrowRight className="ml-1 h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* Piliers Scientifiques & Socle Technique */}
      <section className="rounded-none border border-[#e6dfd3] bg-white p-8 shadow-sm">
        <h2 className="mb-6 text-center font-serif text-2xl font-bold text-[#2c2724]">{t.home.pillarsTitle}</h2>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          <div className="flex items-start space-x-4">
            <div className="shrink-0 rounded-none bg-[#f5f2eb] p-2.5 text-[#9A6530]">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h4 className="mb-1 text-base font-semibold text-[#2c2724]">{t.home.pillarRdfTitle}</h4>
              <p className="text-xs leading-relaxed text-[#696156]">{t.home.pillarRdfDesc}</p>
            </div>
          </div>

          <div className="flex items-start space-x-4">
            <div className="shrink-0 rounded-none bg-[#f5f2eb] p-2.5 text-[#9A6530]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h4 className="mb-1 text-base font-semibold text-[#2c2724]">{t.home.pillarW3cTitle}</h4>
              <p className="text-xs leading-relaxed text-[#696156]">{t.home.pillarW3cDesc}</p>
            </div>
          </div>

          <div className="flex items-start space-x-4">
            <div className="shrink-0 rounded-none bg-[#f5f2eb] p-2.5 text-[#9A6530]">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <h4 className="mb-1 text-base font-semibold text-[#2c2724]">{t.home.pillarNlpTitle}</h4>
              <p className="text-xs leading-relaxed text-[#696156]">{t.home.pillarNlpDesc}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
