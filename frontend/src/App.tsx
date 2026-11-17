import React, { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Navbar } from './components/Navbar'
import { Footer } from './components/Footer'
import { Home } from './pages/Home'
import { ExploreWork } from './pages/ExploreWork'
import { ExploreCorpus } from './pages/ExploreCorpus'
import { CompetencyQuestions } from './pages/CompetencyQuestions'
import { SparqlPlayground } from './pages/SparqlPlayground'
import { ThesaurusProposals } from './pages/ThesaurusProposals'
import { CorpusAnnotation } from './pages/CorpusAnnotation'
import { About } from './pages/About'
import { ArrowUp } from 'lucide-react'
import { I18nProvider } from './i18n'
import { isFinalApiError } from './api/errors'

// Configuration de React Query pour le cache et l'élimination des requêtes redondantes
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10 * 60 * 1000, // 10 minutes de cache
      refetchOnWindowFocus: false,
      // A backend refusal (429, 422, 504...) does not fix itself on retry and would add load to the SPARQL server.
      retry: (failureCount, error) => !isFinalApiError(error) && failureCount < 1,
    },
  },
})

const AppContent: React.FC = () => {
  const location = useLocation()
  const isWorkExplorer =
    location.pathname === '/explore-work' ||
    location.pathname === '/ExploreAWork' ||
    location.pathname === '/annotate' ||
    location.pathname === '/corpus-annotation'
  const [showScrollTop, setShowScrollTop] = useState(false)

  useEffect(() => {
    const checkScroll = (e: Event) => {
      const target = e.target as HTMLElement
      if (target && target.scrollTop !== undefined) {
        setShowScrollTop(target.scrollTop > 300)
      } else {
        setShowScrollTop(window.scrollY > 300)
      }
    }
    window.addEventListener('scroll', checkScroll, { passive: true, capture: true })
    return () => window.removeEventListener('scroll', checkScroll, { capture: true })
  }, [])

  const scrollToTop = () => {
    const mainEl = document.getElementById('main-content-scroll')
    if (mainEl) {
      mainEl.scrollTo({ top: 0, behavior: 'smooth' })
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#fcfbf9] text-[#2c2724]">
      <Navbar />

      <main
        id="main-content-scroll"
        className={`mx-auto min-h-0 w-full max-w-[1920px] flex-1 px-2 sm:px-4 lg:px-6 ${
          isWorkExplorer ? 'flex flex-col overflow-hidden' : 'scrollbar-thin overflow-y-auto'
        }`}
      >
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/explore-work" element={<ExploreWork />} />
          <Route path="/explore-corpus" element={<ExploreCorpus />} />
          <Route path="/annotate" element={<CorpusAnnotation />} />
          <Route path="/corpus-annotation" element={<CorpusAnnotation />} />
          <Route path="/competency-questions" element={<CompetencyQuestions />} />
          <Route path="/sparql" element={<SparqlPlayground />} />
          <Route path="/thesaurus-proposals" element={<ThesaurusProposals />} />
          <Route path="/about" element={<About />} />

          {/* Redirections de compatibilité avec les anciennes URLs */}
          <Route path="/ExploreAWork" element={<ExploreWork />} />
          <Route path="/ExploreTheCorpus" element={<ExploreCorpus />} />
          <Route path="/CompetencyQuestion" element={<CompetencyQuestions />} />
          <Route path="/About" element={<About />} />
        </Routes>
      </main>

      <Footer />

      {/* Bouton retour en haut de page */}
      {showScrollTop && !isWorkExplorer && (
        <button
          onClick={scrollToTop}
          className="fixed right-6 bottom-14 z-40 rounded-none bg-[#9A6530] p-3 text-white shadow-lg transition-all hover:bg-[#855424] focus:ring-2 focus:ring-[#9A6530] focus:ring-offset-2 focus:outline-none"
          aria-label="Retour en haut de page"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      )}
    </div>
  )
}

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </I18nProvider>
    </QueryClientProvider>
  )
}

export default App
