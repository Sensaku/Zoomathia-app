import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  fetchAuthors,
  fetchWorks,
  fetchWorksFromAuthor,
  fetchSummary,
  fetchParagraphs,
  fetchConcepts,
  fetchTranslation,
  fetchAnnotations,
  fetchSectionAnnotations,
  deleteAnnotation,
  resolveUri
} from '../api/client'
import {
  SummaryNode,
  Paragraph,
  AnnotationMap,
  StagedAnnotation,
  Work,
  ConceptCategory,
  TargetParagraphDetail,
  AnnotationScopeType
} from '../types'
import { AnnotationModal } from '../components/AnnotationModal'
import { useI18n } from '../i18n'
import {
  BookOpen,
  ChevronRight,
  ChevronDown,
  Languages,
  ExternalLink,
  Loader2,
  Sparkles,
  PlusCircle,
  Trash2,
  Download,
  Library,
  Feather,
  Tag,
  User,
  X,
  Layers
} from 'lucide-react'
import {
  ConceptCategoryIcon,
  ConceptCategoryBadge,
  getConceptCategoryInfo,
  CATEGORY_STYLES,
  CATEGORY_HOVER_STYLES,
  CATEGORY_PINNED_STYLES,
  CATEGORY_OVERLAP_STYLES,
  CATEGORY_DELIMITER_LEFT,
  CATEGORY_DELIMITER_RIGHT,
  CATEGORY_ACTIVE_DELIMITER_LEFT,
  CATEGORY_ACTIVE_DELIMITER_RIGHT,
  CATEGORY_BADGE_PINNED,
  CATEGORY_BADGE_HOVER,
  CATEGORY_PARA_PINNED,
  CATEGORY_PARA_HOVER,
  CATEGORY_TAG_PINNED,
  CATEGORY_TAG_HOVER,
  CATEGORY_TOC_PINNED,
  CATEGORY_TOC_HOVER
} from '../components/ConceptCategoryBadge'
import {
  ReadingParagraphCard,
  PinnedConceptBanner,
  useConceptInspection
} from '../components/reading'

/**
 * Recherche récursive du nœud de section le plus précis dans l'arborescence du sommaire
 * dont l'URI correspond comme préfixe à celle du paragraphe.
 */
function findSectionForParagraph(nodes: SummaryNode[], paraUri: string): string | null {
  if (!paraUri || !nodes || nodes.length === 0) return null
  let bestMatch: string | null = null
  let maxLen = 0

  const traverse = (node: SummaryNode) => {
    if (paraUri.startsWith(node.uri) && node.uri.length > maxLen) {
      bestMatch = node.uri
      maxLen = node.uri.length
    }
    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        traverse(child)
      }
    }
  }

  for (const n of nodes) {
    traverse(n)
  }

  return bestMatch
}

export const ExploreWork: React.FC = () => {
  const { t, language } = useI18n()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialUri = searchParams.get('uri')?.trim() || ''

  const [selectedAuthor, setSelectedAuthor] = useState<string>('')
  const [selectedWorkUri, setSelectedWorkUri] = useState<string>('')
  const [activeSectionUri, setActiveSectionUri] = useState<string>('')
  const [activeParagraphUri, setActiveParagraphUri] = useState<string>('')
  const [showTranslation, setShowTranslation] = useState<boolean>(true)
  const [textSize, setTextSize] = useState<'normal' | 'large' | 'xlarge'>('large')

  // Gestion du repliement des nœuds de la table des matières
  const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({})

  // Mémorisation de la dernière URI appliquée pour ne pas écraser la navigation manuelle
  const appliedUriRef = useRef<string | null>(null)
  const [hasAutoScrolled, setHasAutoScrolled] = useState(false)

  // 1. Ensemble des oeuvres pour synchronisation instantanée et métadonnées
  const { data: allWorks = [], isLoading: isAllWorksLoading } = useQuery({
    queryKey: ['allWorks'],
    queryFn: fetchWorks,
  })

  // 1.bis Résolution sémantique de l'URI d'entrée (oeuvre, section ou paragraphe)
  const { data: resolvedTarget, isLoading: isResolvingTarget } = useQuery({
    queryKey: ['resolveUri', initialUri],
    queryFn: () => resolveUri(initialUri),
    enabled: !!initialUri,
    staleTime: 5 * 60 * 1000,
  })

  // Réinitialiser l'auto-scroll si le paramètre uri de l'URL change
  useEffect(() => {
    setHasAutoScrolled(false)
  }, [initialUri])

  // Application de la résolution sémantique de l'URI reçue en paramètre
  useEffect(() => {
    if (!initialUri) {
      appliedUriRef.current = null
      return
    }

    // Si on a déjà appliqué cette URI complète, ne pas réécraser pour laisser la navigation libre
    if (appliedUriRef.current === initialUri) return

    if (resolvedTarget) {
      appliedUriRef.current = initialUri
      if (resolvedTarget.work) {
        setSelectedWorkUri(resolvedTarget.work)
        const matchedWork = allWorks.find((w) => w.uri === resolvedTarget.work)
        if (matchedWork?.author) {
          setSelectedAuthor(matchedWork.author)
        }
      }
      if (resolvedTarget.section) {
        setActiveSectionUri(resolvedTarget.section)
      }
      if (resolvedTarget.paragraph) {
        setActiveParagraphUri(resolvedTarget.paragraph)
      } else if (resolvedTarget.type !== 'work' && resolvedTarget.type !== 'section') {
        setActiveParagraphUri(initialUri)
      }
    } else {
      // Pré-résolution optimiste immédiate si l'URI commence par une œuvre connue
      const matchedWork = allWorks.find(
        (w) => initialUri === w.uri || initialUri.startsWith(w.uri + '/')
      )
      if (matchedWork) {
        setSelectedWorkUri(matchedWork.uri)
        if (matchedWork.author) {
          setSelectedAuthor(matchedWork.author)
        }
        if (initialUri !== matchedWork.uri) {
          setActiveParagraphUri(initialUri)
        }
      }
    }
  }, [initialUri, resolvedTarget, allWorks])

  // Oeuvre active résolue depuis allWorks
  const currentWork = useMemo(() => {
    return allWorks.find((w) => w.uri === selectedWorkUri)
  }, [allWorks, selectedWorkUri])

  // Synchronisation automatique de l'auteur dès qu'une oeuvre est chargée
  useEffect(() => {
    if (currentWork?.author && selectedAuthor !== currentWork.author) {
      setSelectedAuthor(currentWork.author)
    }
  }, [currentWork, selectedAuthor])

  // 2. Liste des auteurs
  const { data: authors = [], isLoading: isAuthorsLoading } = useQuery({
    queryKey: ['authors'],
    queryFn: fetchAuthors,
  })

  // 3. Liste des oeuvres filtrées pour l'auteur (ou toutes les oeuvres si aucun auteur)
  const works = useMemo(() => {
    if (!selectedAuthor) return allWorks
    return allWorks.filter((w) => w.author === selectedAuthor)
  }, [allWorks, selectedAuthor])

  // 3.bis Sommaire / Arborescence de l'oeuvre active
  const { data: summary = [], isLoading: isSummaryLoading } = useQuery({
    queryKey: ['summary', selectedWorkUri],
    queryFn: () => fetchSummary(selectedWorkUri),
    enabled: !!selectedWorkUri,
  })

  // Déduire automatiquement la section depuis le sommaire si seul le paragraphe est ciblé
  useEffect(() => {
    if (!activeSectionUri && activeParagraphUri && summary.length > 0) {
      const bestSection = findSectionForParagraph(summary, activeParagraphUri)
      if (bestSection) {
        setActiveSectionUri(bestSection)
      }
    }
  }, [activeSectionUri, activeParagraphUri, summary])

  // 4. Traduction anglaise candidate
  const { data: translationInfo } = useQuery({
    queryKey: ['translation', selectedWorkUri],
    queryFn: () => fetchTranslation(selectedWorkUri),
    enabled: !!selectedWorkUri,
  })

  // 5. Paragraphes de la section sélectionnée (ou section déduite du paragraphe, ou première feuille)
  const inferredSectionUri = useMemo(() => {
    return (
      activeSectionUri ||
      findSectionForParagraph(summary, activeParagraphUri) ||
      summary[0]?.children?.[0]?.uri ||
      summary[0]?.uri ||
      ''
    )
  }, [activeSectionUri, summary, activeParagraphUri])
  const targetSectionUri = inferredSectionUri

  // Déplier automatiquement le livre parent dans la table des matières si une section est active
  useEffect(() => {
    if (targetSectionUri && summary.length > 0) {
      for (const book of summary) {
        if (book.children?.some((c) => c.uri === targetSectionUri) || book.uri === targetSectionUri) {
          setCollapsedNodes((prev) => {
            if (prev[book.uri] === false) return prev
            return { ...prev, [book.uri]: false }
          })
          break
        }
      }
    }
  }, [targetSectionUri, summary])

  const { data: paragraphs = [], isLoading: isParagraphsLoading } = useQuery({
    queryKey: ['paragraphs', targetSectionUri],
    queryFn: () => fetchParagraphs(targetSectionUri),
    enabled: !!targetSectionUri,
  })

  // Défilement automatique et focus sur le paragraphe cible (depuis URL ou redirection externe)
  useEffect(() => {
    if (!activeParagraphUri || hasAutoScrolled || isParagraphsLoading || paragraphs.length === 0) {
      return
    }

    const paraExists = paragraphs.some((p) => p.uri === activeParagraphUri)
    if (!paraExists) return

    const timer = setTimeout(() => {
      const el =
        document.getElementById(activeParagraphUri) ||
        document.querySelector(`[data-para-uri="${CSS.escape(activeParagraphUri)}"]`)

      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        if (el instanceof HTMLElement) {
          el.focus({ preventScroll: true })
        }
        setHasAutoScrolled(true)
      }
    }, 120)

    return () => clearTimeout(timer)
  }, [activeParagraphUri, paragraphs, isParagraphsLoading, hasAutoScrolled])

  // 6. Traduction des paragraphes si disponible
  const { data: translationParagraphs = [] } = useQuery({
    queryKey: ['translationParagraphs', translationInfo?.uri],
    queryFn: () => fetchParagraphs(translationInfo?.uri || ''),
    enabled: !!translationInfo?.uri && showTranslation,
  })

  // 7. Annotations groupées de la section (Corese + Staging)
  const {
    data: sectionData,
    isLoading: isSectionDataLoading,
    refetch: refetchSectionData
  } = useQuery({
    queryKey: ['sectionAnnotations', targetSectionUri, language],
    queryFn: () => fetchSectionAnnotations(targetSectionUri, language),
    enabled: !!targetSectionUri,
  })

  const referenceAnnotations = sectionData?.reference_annotations || {}
  const stagedAnnotations = sectionData?.staged_annotations || []
  const refetchStaged = refetchSectionData

  // Annotations de référence pour le paragraphe actif
  const activeAnnotations = useMemo(() => {
    if (!activeParagraphUri) return {}
    return referenceAnnotations[activeParagraphUri] || {}
  }, [referenceAnnotations, activeParagraphUri])

  // Annotations staging touchant le paragraphe actif
  const activeStagedAnnotations = useMemo(() => {
    if (!activeParagraphUri) return []
    return stagedAnnotations.filter(
      (s) => s.paragraph_uri === activeParagraphUri || (s.target_paragraphs && s.target_paragraphs.includes(activeParagraphUri))
    )
  }, [stagedAnnotations, activeParagraphUri])

  // Gestion réactive de l'inspection (survol prioritaire, épinglage, résolution multi-paragraphes)
  const inspectionState = useConceptInspection({
    referenceAnnotations,
    stagedAnnotations,
    paragraphs,
    setActiveParagraphUri
  })

  const {
    hoveredConcept,
    setHoveredConcept,
    pinnedConcept,
    setPinnedConcept,
    activeInspectionConcept,
    activeInspectionParagraphUris,
    activeInspectionLabel,
    activeInspectionCategory,
    pinnedConceptLabel,
    pinnedConceptCategory,
    pinnedParagraphsList,
    handleFocusParagraph
  } = inspectionState

  // Gestion de la modal d'annotation interactive
  const [isAnnotModalOpen, setIsAnnotModalOpen] = useState(false)
  const [modalTargetText, setModalTargetText] = useState('')
  const [modalStartOffset, setModalStartOffset] = useState(0)
  const [modalEndOffset, setModalEndOffset] = useState(0)
  const [modalTargetParas, setModalTargetParas] = useState<string[]>([])
  const [modalTargetParaDetails, setModalTargetParaDetails] = useState<TargetParagraphDetail[]>([])
  const [modalEndParaUri, setModalEndParaUri] = useState<string | undefined>(undefined)
  const [modalScopeType, setModalScopeType] = useState<AnnotationScopeType>('word_sequence')
  const [selectedSnippet, setSelectedSnippet] = useState<string | null>(null)

  // Sélection d'une oeuvre avec synchronisation de l'auteur
  const handleSelectWork = (uri: string) => {
    appliedUriRef.current = uri
    setSelectedWorkUri(uri)
    setActiveSectionUri('')
    setActiveParagraphUri('')
    setSelectedSnippet(null)
    setSearchParams({ uri })
    const targetW = allWorks.find((w) => w.uri === uri)
    if (targetW?.author) {
      setSelectedAuthor(targetW.author)
    }
  }

  // Changement d'auteur avec pré-sélection de sa première œuvre
  const handleAuthorChange = (newAuthor: string) => {
    setSelectedAuthor(newAuthor)
    setActiveSectionUri('')
    setActiveParagraphUri('')
    setSelectedSnippet(null)
    if (newAuthor) {
      const authorWorks = allWorks.filter((w) => w.author === newAuthor)
      if (authorWorks.length > 0) {
        handleSelectWork(authorWorks[0].uri)
      } else {
        appliedUriRef.current = null
        setSelectedWorkUri('')
        setSearchParams({})
      }
    }
  }

  const toggleNodeCollapse = (uri: string) => {
    setCollapsedNodes((prev) => ({
      ...prev,
      [uri]: !prev[uri]
    }))
  }

  // Utilitaires de détection et complétion aux frontières de mots
  const isWordChar = (ch: string): boolean => {
    return /[\p{L}\p{N}\p{M}]/u.test(ch)
  }

  const expandToWordBoundaries = (
    fullText: string,
    start: number,
    end: number
  ): { start: number; end: number; text: string } => {
    let s = Math.max(0, Math.min(start, fullText.length))
    let e = Math.max(0, Math.min(end, fullText.length))
    if (s > e) {
      const tmp = s
      s = e
      e = tmp
    }

    // Retrait des espaces purs aux extrémités
    while (s < e && /\s/.test(fullText[s])) {
      s++
    }
    while (e > s && /\s/.test(fullText[e - 1])) {
      e--
    }

    // Complétion vers la gauche jusqu'au début du mot
    while (s > 0 && isWordChar(fullText[s - 1])) {
      s--
    }

    // Complétion vers la droite jusqu'à la fin du mot
    while (e < fullText.length && isWordChar(fullText[e])) {
      e++
    }

    return {
      start: s,
      end: e,
      text: fullText.slice(s, e)
    }
  }

  // Surlignage libre direct avec détection multi-paragraphes et complétion automatique
  const handleFreeTextSelection = (p?: Paragraph) => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return

    const raw = sel.toString().trim()
    if (raw.length < 1) return

    const range = sel.getRangeAt(0)
    const startParaEl = range.startContainer.parentElement?.closest('[data-para-uri]')
    const endParaEl = range.endContainer.parentElement?.closest('[data-para-uri]')

    const startUri = startParaEl?.getAttribute('data-para-uri') || p?.uri
    const endUri = endParaEl?.getAttribute('data-para-uri') || startUri

    if (!startUri) return

    const startIdx = paragraphs.findIndex((item) => item.uri === startUri)
    if (startIdx === -1) return

    if (!endUri || endUri === startUri) {
      // Sélection intra-paragraphe
      const currentP = paragraphs[startIdx]
      let idx = currentP.text.indexOf(raw)
      if (idx === -1) {
        const normP = currentP.text.replace(/\s+/g, ' ')
        const normR = raw.replace(/\s+/g, ' ')
        idx = normP.indexOf(normR)
      }
      const sOffset = idx !== -1 ? idx : 0
      const eOffset = idx !== -1 ? idx + raw.length : raw.length

      const { start: finalStartOffset, end: finalEndOffset, text: finalRaw } = expandToWordBoundaries(
        currentP.text,
        sOffset,
        eOffset
      )

      setActiveParagraphUri(currentP.uri)
      setSelectedSnippet(finalRaw)
      setModalTargetText(finalRaw)
      setModalStartOffset(finalStartOffset)
      setModalEndOffset(finalEndOffset)
      setModalTargetParas([currentP.uri])
      setModalTargetParaDetails([{ uri: currentP.uri, id: currentP.id, text: finalRaw }])
      setModalEndParaUri(undefined)
      setModalScopeType(finalRaw.split(/\s+/).length === 1 ? 'word' : 'word_sequence')
      setIsAnnotModalOpen(true)
    } else {
      // Sélection s'étendant sur plusieurs paragraphes
      const endIdx = paragraphs.findIndex((item) => item.uri === endUri)
      if (endIdx === -1) return

      const minIdx = Math.min(startIdx, endIdx)
      const maxIdx = Math.max(startIdx, endIdx)
      const targeted = paragraphs.slice(minIdx, maxIdx + 1)
      const startP = targeted[0]
      const endP = targeted[targeted.length - 1]

      const paraDetails: TargetParagraphDetail[] = targeted.map((pItem, idx) => {
        if (idx === 0) {
          let slice = pItem.text
          try {
            if (startParaEl) {
              const r = document.createRange()
              r.setStart(range.startContainer, range.startOffset)
              r.setEndAfter(startParaEl.lastChild || startParaEl)
              const ext = r.toString().trim()
              if (ext) slice = ext
            }
          } catch {
            const firstWords = raw.split(/\s+/).slice(0, 4).join(' ')
            const pos = pItem.text.indexOf(firstWords)
            if (pos !== -1) slice = pItem.text.slice(pos).trim()
          }

          let sPos = pItem.text.indexOf(slice)
          if (sPos !== -1) {
            while (sPos > 0 && isWordChar(pItem.text[sPos - 1])) {
              sPos--
            }
            slice = pItem.text.slice(sPos).trim()
          }
          return { uri: pItem.uri, id: pItem.id, text: slice }
        } else if (idx === targeted.length - 1) {
          let slice = pItem.text
          try {
            if (endParaEl) {
              const r = document.createRange()
              r.setStartBefore(endParaEl.firstChild || endParaEl)
              r.setEnd(range.endContainer, range.endOffset)
              const ext = r.toString().trim()
              if (ext) slice = ext
            }
          } catch {
            const lastWords = raw.split(/\s+/).slice(-4).join(' ')
            const pos = pItem.text.indexOf(lastWords)
            if (pos !== -1) slice = pItem.text.slice(0, pos + lastWords.length).trim()
          }

          let ePos = slice.length
          while (ePos < pItem.text.length && isWordChar(pItem.text[ePos])) {
            ePos++
          }
          slice = pItem.text.slice(0, ePos).trim()
          return { uri: pItem.uri, id: pItem.id, text: slice }
        } else {
          return { uri: pItem.uri, id: pItem.id, text: pItem.text }
        }
      })

      const fullRaw = paraDetails.map((pd) => pd.text).join('\n\n')

      setActiveParagraphUri(startP.uri)
      setSelectedSnippet(fullRaw.slice(0, 30))
      setModalTargetText(fullRaw)
      setModalStartOffset(startP.text.indexOf(paraDetails[0].text) !== -1 ? startP.text.indexOf(paraDetails[0].text) : 0)
      setModalEndOffset(paraDetails[paraDetails.length - 1].text.length)
      setModalTargetParas(targeted.map((item) => item.uri))
      setModalTargetParaDetails(paraDetails)
      setModalEndParaUri(endP.uri)
      setModalScopeType('multi_paragraph')
      setIsAnnotModalOpen(true)
    }
  }

  return (
    <div className="h-full flex flex-col pt-2.5 pb-1.5 space-y-2.5 min-h-0 overflow-hidden">
      
      {/* Barre de Commande Éditoriale Supérieure */}
      <header className="shrink-0 bg-white/95 backdrop-blur-xs px-4 py-2.5 sm:px-5 sm:py-3 rounded-none border border-[#e6dfd1] shadow-xs flex flex-col xl:flex-row gap-3 items-stretch xl:items-center justify-between">
        
        {/* Résumé de l'œuvre & Titre statutaire */}
        <div className="flex items-center space-x-3.5 min-w-0">
          <div className="w-11 h-11 rounded-none bg-[#9A6530]/10 border border-[#9A6530]/30 flex items-center justify-center shrink-0 text-[#9A6530]">
            <BookOpen className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-2">
              <span className="text-[11px] font-bold tracking-wider uppercase text-[#9A6530]">
                {currentWork?.author || selectedAuthor || t.work.corpusSelection}
              </span>
              {currentWork?.language && (
                <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded-none bg-amber-100/80 text-amber-900 border border-amber-300/60 uppercase">
                  {currentWork.language}
                </span>
              )}
            </div>
            <h1 className="font-serif text-lg sm:text-xl font-bold text-[#27221d] truncate">
              {currentWork?.title || t.work.selectPrompt}
            </h1>
          </div>
        </div>

        {/* Sélecteurs Auteur & Œuvre compacts + Outils de lecture */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Menu déroulant Auteur */}
          <div className="relative w-48 sm:w-56">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-[#9A6530]">
              <User className="w-3.5 h-3.5" />
            </div>
            <select
              value={selectedAuthor}
              onChange={(e) => handleAuthorChange(e.target.value)}
              disabled={isAuthorsLoading}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[#cfc5b4] bg-[#faf8f5] text-xs font-medium text-[#2c2724] focus:ring-2 focus:ring-[#9A6530] focus:outline-none transition-shadow"
            >
              <option value="">{t.work.allAuthors}</option>
              {authors.map((a) => (
                <option key={a.name} value={a.name}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          {/* Menu déroulant Œuvre */}
          <div className="relative w-56 sm:w-72">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-[#9A6530]">
              <BookOpen className="w-3.5 h-3.5" />
            </div>
            <select
              value={selectedWorkUri}
              onChange={(e) => handleSelectWork(e.target.value)}
              disabled={isAllWorksLoading}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[#cfc5b4] bg-[#faf8f5] text-xs font-medium text-[#2c2724] focus:ring-2 focus:ring-[#9A6530] focus:outline-none transition-shadow disabled:opacity-50 truncate"
            >
              <option value="">{t.work.selectWork}</option>
              {works.map((w) => (
                <option key={w.uri} value={w.uri}>
                  {w.title} {w.language ? `[${w.language}]` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Sélecteur de taille de texte */}
          <div className="flex items-center space-x-1 bg-[#f4ede2] p-1 rounded-none border border-[#ded5c6] text-xs shrink-0">
            <span className="text-[11px] font-semibold text-[#736a5f] px-1">{t.work.textSize}</span>
            <button
              type="button"
              onClick={() => setTextSize('normal')}
              className={`px-2 py-0.5 rounded-none text-xs font-semibold transition-colors ${
                textSize === 'normal'
                  ? 'bg-[#9A6530] text-white shadow-xs'
                  : 'text-[#543b22] hover:bg-[#e8dfd3]'
              }`}
              title={t.work.sizeNormal}
            >
              A
            </button>
            <button
              type="button"
              onClick={() => setTextSize('large')}
              className={`px-2 py-0.5 rounded-none text-xs font-semibold transition-colors ${
                textSize === 'large'
                  ? 'bg-[#9A6530] text-white shadow-xs'
                  : 'text-[#543b22] hover:bg-[#e8dfd3]'
              }`}
              title={t.work.sizeLarge}
            >
              A+
            </button>
            <button
              type="button"
              onClick={() => setTextSize('xlarge')}
              className={`px-2 py-0.5 rounded-none text-xs font-semibold transition-colors ${
                textSize === 'xlarge'
                  ? 'bg-[#9A6530] text-white shadow-xs'
                  : 'text-[#543b22] hover:bg-[#e8dfd3]'
              }`}
              title={t.work.sizeXLarge}
            >
              A++
            </button>
          </div>

          {/* Bascule Traduction alignée */}
          {translationInfo && (
            <label className="flex items-center space-x-2 bg-[#f4ede2] px-3 py-1.5 rounded-none border border-[#ded5c6] text-xs font-medium text-[#4a423b] cursor-pointer hover:bg-[#eee5d6] transition-colors shrink-0">
              <Languages className="w-4 h-4 text-[#9A6530]" />
              <span>{t.work.alignedTranslation}</span>
              <input
                type="checkbox"
                checked={showTranslation}
                onChange={(e) => setShowTranslation(e.target.checked)}
                className="rounded-none text-[#9A6530] focus:ring-[#9A6530]"
              />
            </label>
          )}
        </div>

      </header>

      {/* Vue Principale : 3 Colonnes (Sommaire / Texte Bilingue / Annotations) */}
      {!selectedWorkUri ? (
        (isResolvingTarget || isAllWorksLoading) && initialUri ? (
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center bg-white rounded-none border border-[#e6dfd3] p-12 text-center shadow-xs space-y-4">
            <Loader2 className="w-10 h-10 text-[#9A6530] animate-spin mx-auto" />
            <div className="space-y-1">
              <h3 className="font-serif text-lg font-bold text-[#2c2724]">Chargement de l'œuvre et du passage...</h3>
              <p className="text-xs text-[#736a5f] max-w-md mx-auto">Résolution sémantique de la référence textuelle dans le graphe</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center bg-white rounded-none border border-[#e6dfd3] p-12 text-center shadow-xs space-y-3">
            <BookOpen className="w-12 h-12 text-[#9A6530] mx-auto opacity-70" />
            <h3 className="font-serif text-xl font-bold text-[#2c2724]">{t.work.noWorkSelected}</h3>
            <p className="text-sm text-[#736a5f] max-w-md mx-auto">
              {t.work.noWorkDesc}
            </p>
          </div>
        )
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          
          {/* Colonne 1 : Table des Matières & Arborescence (3 colonnes) */}
          <aside className="lg:col-span-3 h-full bg-white/95 rounded-none border border-[#e6dfd1] shadow-xs flex flex-col overflow-hidden">
            
            <div className="p-3.5 border-b border-[#f0eae0] bg-[#faf8f4] flex items-center justify-between shrink-0">
              <h3 className="font-serif font-bold text-sm sm:text-base text-[#2c2724] flex items-center space-x-2">
                <BookOpen className="w-4 h-4 text-[#9A6530]" />
                <span>{t.work.tableOfContents}</span>
              </h3>
              <span className="text-[11px] font-semibold text-[#8c8275] bg-[#f0eae0] px-2 py-0.5 rounded-full inline-flex items-center justify-center text-center leading-none">
                {summary.length} {t.work.sectionsCount}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1.5 scrollbar-thin">
              {isSummaryLoading ? (
                <div className="space-y-2 py-2">
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <div key={n} className="h-7 bg-[#f4ede2] rounded-none animate-pulse" />
                  ))}
                </div>
              ) : summary.length === 0 ? (
                <p className="text-xs text-[#8c8275] italic p-3 text-center">{t.work.structureNotSegmented}</p>
              ) : (
                <nav className="space-y-1 text-xs">
                  {summary.map((book) => {
                    const isBookCollapsed = !!collapsedNodes[book.uri]
                    const hasChildren = book.children && book.children.length > 0

                    // Cas 1 : Nœud Livre ou Section avec sous-chapitres
                    if (hasChildren) {
                      return (
                        <div key={book.uri} className="space-y-1">
                          <button
                            type="button"
                            onClick={() => toggleNodeCollapse(book.uri)}
                            className="w-full text-left font-semibold text-[#3d362e] px-2.5 py-1.5 bg-[#fdfcf9] hover:bg-[#f4eee4] rounded-none flex items-center justify-between transition-colors cursor-pointer border border-[#f0eae0]"
                          >
                            <span className="truncate">{book.title || `Livre ${book.id}`}</span>
                            {isBookCollapsed ? (
                              <ChevronRight className="w-3.5 h-3.5 text-[#8c8275] shrink-0" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-[#8c8275] shrink-0" />
                            )}
                          </button>

                          {!isBookCollapsed && (
                            <div className="pl-2 border-l-2 border-[#e6dfd3] space-y-0.5 ml-2.5 my-0.5">
                              {book.children.map((chapter) => {
                                const isChapterActive = targetSectionUri === chapter.uri

                                return (
                                  <div key={chapter.uri} className="space-y-0.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveSectionUri(chapter.uri)
                                        setActiveParagraphUri('')
                                      }}
                                      className={`w-full text-left px-2.5 py-1.5 rounded-none transition-colors flex items-center justify-between cursor-pointer ${
                                        isChapterActive
                                          ? 'bg-[#9A6530] text-white font-medium shadow-2xs'
                                          : 'text-[#544b41] hover:bg-[#f4eee4] hover:text-[#1c1815]'
                                      }`}
                                    >
                                      <span className="truncate">{chapter.title || `Chapitre ${chapter.id}`}</span>
                                      {isChapterActive ? (
                                        <ChevronDown className="w-3 h-3 text-white shrink-0 ml-1" />
                                      ) : (
                                        <ChevronRight className="w-3 h-3 text-[#8c8275] shrink-0 ml-1 opacity-60" />
                                      )}
                                    </button>

                                    {/* Menu dépliant des paragraphes du chapitre actif */}
                                    {isChapterActive && (
                                      <div className="pl-2 border-l-2 border-[#9A6530]/40 ml-2 my-1 space-y-1 max-h-60 overflow-y-auto pr-1 scrollbar-thin">
                                        {isParagraphsLoading ? (
                                          <div className="py-2 flex items-center space-x-1.5 text-[11px] text-[#736a5f]">
                                            <Loader2 className="w-3 h-3 text-[#9A6530] animate-spin" />
                                            <span>{t.work.loadingParagraphs}</span>
                                          </div>
                                        ) : paragraphs.length === 0 ? (
                                          <p className="text-[11px] text-[#8c8275] italic py-1">{t.work.noParagraphs}</p>
                                        ) : (
                                          paragraphs.map((p) => {
                                            const isCurrentP = activeParagraphUri === p.uri

                                            return (
                                              <button
                                                key={p.uri}
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  handleFocusParagraph(p.uri)
                                                }}
                                                className={`w-full text-left px-2 py-1.5 rounded-none text-xs transition-all flex items-center justify-between group cursor-pointer border ${
                                                  isCurrentP
                                                    ? 'bg-[#9A6530] text-white font-semibold shadow-xs border-[#855424]'
                                                    : 'text-[#38322b] hover:bg-[#f4ede1] border-transparent hover:border-[#ded3c2]'
                                                }`}
                                                title={p.text}
                                              >
                                                <span
                                                  className={`font-mono text-[11px] shrink-0 font-bold px-1.5 py-0.5 rounded-none inline-flex items-center justify-center text-center leading-none ${
                                                    isCurrentP
                                                      ? 'bg-amber-300 text-amber-950 shadow-2xs'
                                                      : 'bg-[#ede5d8] text-[#6d4c24] border border-[#ded5c6]'
                                                  }`}
                                                >
                                                  § {p.id}
                                                </span>
                                                <span
                                                  className={`truncate ml-2 text-xs font-serif italic ${
                                                    isCurrentP
                                                      ? 'text-white/95'
                                                      : 'text-[#4d443b] group-hover:text-[#1c1815]'
                                                  }`}
                                                >
                                                  {p.text.slice(0, 26)}...
                                                </span>
                                              </button>
                                            )
                                          })
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    }

                    // Cas 2 : Nœud direct feuille (pas d'enfants)
                    const isLeafActive = targetSectionUri === book.uri
                    return (
                      <div key={book.uri} className="space-y-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveSectionUri(book.uri)
                            setActiveParagraphUri('')
                          }}
                          className={`w-full text-left px-2.5 py-1.5 rounded-none transition-colors flex items-center justify-between cursor-pointer ${
                            isLeafActive
                              ? 'bg-[#9A6530] text-white font-medium shadow-2xs'
                              : 'text-[#3d362e] hover:bg-[#f4eee4] hover:text-[#1c1815]'
                          }`}
                        >
                          <span className="truncate">{book.title || `Section ${book.id}`}</span>
                          {isLeafActive ? (
                            <ChevronDown className="w-3 h-3 text-white shrink-0 ml-1" />
                          ) : (
                            <ChevronRight className="w-3 h-3 text-[#8c8275] shrink-0 ml-1 opacity-60" />
                          )}
                        </button>

                        {/* Menu dépliant des paragraphes si feuille active */}
                        {isLeafActive && (
                          <div className="pl-2 border-l-2 border-[#9A6530]/40 ml-2 my-1 space-y-1 max-h-60 overflow-y-auto pr-1 scrollbar-thin">
                            {isParagraphsLoading ? (
                              <div className="py-2 flex items-center space-x-1.5 text-[11px] text-[#736a5f]">
                                <Loader2 className="w-3 h-3 text-[#9A6530] animate-spin" />
                                <span>{t.work.loadingParagraphs}</span>
                              </div>
                            ) : paragraphs.length === 0 ? (
                              <p className="text-[11px] text-[#8c8275] italic py-1">{t.work.noParagraphs}</p>
                            ) : (
                              paragraphs.map((p) => {
                                const isCurrentP = activeParagraphUri === p.uri
                                const isHovering = hoveredConcept !== null
                                const hasInspectedP = activeInspectionConcept !== null && activeInspectionParagraphUris.has(p.uri)
                                const isHoveredP = isHovering && hasInspectedP
                                const isPinnedP = !isHovering && !!pinnedConcept && hasInspectedP

                                return (
                                  <button
                                    key={p.uri}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleFocusParagraph(p.uri)
                                    }}
                                    className={`w-full text-left px-2 py-1.5 rounded-none text-xs transition-all flex items-center justify-between group cursor-pointer border ${
                                      isCurrentP
                                        ? 'bg-[#9A6530] text-white font-semibold shadow-xs border-[#855424]'
                                        : isHoveredP
                                          ? 'bg-amber-100/90 text-amber-950 border-amber-300'
                                          : isPinnedP
                                            ? 'bg-amber-100/70 text-amber-900 border-amber-200'
                                            : 'text-[#38322b] hover:bg-[#f4ede1] border-transparent hover:border-[#ded3c2]'
                                    }`}
                                    title={p.text}
                                  >
                                    <span
                                      className={`font-mono text-[11px] shrink-0 font-bold px-1.5 py-0.5 rounded-none inline-flex items-center justify-center text-center leading-none ${
                                        isCurrentP
                                          ? 'bg-amber-300 text-amber-950 shadow-2xs'
                                          : isHoveredP
                                            ? (CATEGORY_TOC_HOVER[activeInspectionCategory] || CATEGORY_TOC_HOVER.general)
                                            : isPinnedP
                                              ? (CATEGORY_TOC_PINNED[activeInspectionCategory] || CATEGORY_TOC_PINNED.general)
                                              : 'bg-[#ede5d8] text-[#6d4c24] border border-[#ded5c6]'
                                      }`}
                                    >
                                      § {p.id}
                                    </span>
                                    <span
                                      className={`truncate ml-2 text-xs font-serif italic ${
                                        isCurrentP
                                          ? 'text-white/95'
                                          : 'text-[#4d443b] group-hover:text-[#1c1815]'
                                      }`}
                                    >
                                      {p.text.slice(0, 26)}...
                                    </span>
                                  </button>
                                )
                              })
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </nav>
              )}
            </div>
          </aside>

          {/* Colonne 2 : Lecture Synoptique du Texte (6 colonnes) */}
          <main className="lg:col-span-6 h-full bg-white/95 rounded-none border border-[#e6dfd1] shadow-xs flex flex-col overflow-hidden">
            
            {/* En-tête de lecture */}
            <div className="p-3.5 border-b border-[#f0eae0] bg-[#faf8f4] flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2 min-w-0">
                <Feather className="w-4 h-4 text-[#9A6530] shrink-0" />
                <span className="font-serif font-bold text-sm sm:text-base text-[#2c2724] truncate">
                  {t.work.originalTextAndAnnots}
                </span>
              </div>
              <span className="text-[11px] font-semibold text-[#8c8275] bg-[#f0eae0] px-2 py-0.5 rounded-full shrink-0 inline-flex items-center justify-center text-center leading-none">
                {paragraphs.length} {t.work.paragraphsCount}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5 scrollbar-thin">
              {isParagraphsLoading ? (
                <div className="py-24 flex flex-col items-center justify-center space-y-3">
                  <Loader2 className="w-8 h-8 text-[#9A6530] animate-spin" />
                  <span className="text-sm font-medium text-[#736a5f]">{t.work.loadingText}</span>
                </div>
              ) : paragraphs.length === 0 ? (
                <p className="text-sm text-[#736a5f] text-center py-16">
                  {t.work.noParagraphsSection}
                </p>
              ) : (
                <div className="space-y-5">
                  <PinnedConceptBanner
                    pinnedConcept={pinnedConcept}
                    pinnedConceptLabel={pinnedConceptLabel}
                    pinnedConceptCategory={pinnedConceptCategory}
                    pinnedParagraphsList={pinnedParagraphsList}
                    activeParagraphUri={activeParagraphUri}
                    onFocusParagraph={handleFocusParagraph}
                    onUnpin={() => setPinnedConcept(null)}
                  />

                  {paragraphs.map((p, idx) => (
                    <ReadingParagraphCard
                      key={p.uri || idx}
                      p={p}
                      idx={idx}
                      isCurrentPara={activeParagraphUri === p.uri}
                      referenceMap={referenceAnnotations[p.uri]}
                      stagedList={stagedAnnotations}
                      inspectionState={inspectionState}
                      textSize={textSize}
                      showTranslation={showTranslation}
                      translationP={translationParagraphs[idx]}
                      onClick={() => setActiveParagraphUri(p.uri)}
                      onTextSelection={handleFreeTextSelection}
                      selectedSnippet={activeParagraphUri === p.uri ? selectedSnippet : null}
                      onAnnotateSnippet={() => setIsAnnotModalOpen(true)}
                      translationTagText={t.work.translationTag}
                      activeParagraphText={t.work.activeParagraph}
                      annotateButtonText={t.work.annotatePassage}
                    />
                  ))}
                </div>
              )}
            </div>
          </main>

          {/* Colonne 3 : Panneau d'Annotations Sémantiques (Corese + Staging) (3 colonnes) */}
          <aside className="lg:col-span-3 h-full bg-white/95 rounded-none border border-[#e6dfd1] shadow-xs flex flex-col overflow-hidden">
            
            <div className="p-3.5 border-b border-[#f0eae0] bg-[#faf8f4] flex items-center justify-between shrink-0">
              <h3 className="font-serif font-bold text-sm sm:text-base text-[#2c2724] flex items-center space-x-1.5">
                <Sparkles className="w-4 h-4 text-[#9A6530]" />
                <span>{t.work.annotationsTitle}</span>
              </h3>
              <span className="text-[11px] font-bold text-[#9A6530] bg-amber-100/90 px-2.5 py-0.5 rounded-full border border-amber-300/60 inline-flex items-center justify-center text-center leading-none">
                {Object.keys(activeAnnotations).length + stagedAnnotations.length} {t.work.conceptsCount}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-3.5 space-y-4 scrollbar-thin">
              {/* Bouton d'export global des annotations de staging */}
              <div>
                <a
                  href="/api/annotations/export-ttl"
                  download
                  className="w-full inline-flex items-center justify-center space-x-1.5 px-3 py-1.5 bg-[#faf8f5] hover:bg-[#f4ede2] border border-[#ded5c6] text-[#784d1e] rounded-none text-xs font-medium transition-colors shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{t.work.exportStagingTtl}</span>
                </a>
              </div>

              {!activeParagraphUri ? (
                <p className="text-xs text-[#8c8275] italic leading-relaxed p-3 text-center">
                  {t.work.selectParaPrompt}
                </p>
              ) : (
                <div className="space-y-4">
                  
                  {/* 1. Annotations en Staging (Locales / En révision) */}
                  {activeStagedAnnotations.length > 0 ? (
                    <div className="space-y-2">
                      <h4 className="text-[11px] uppercase font-bold tracking-wider text-emerald-800 flex items-center justify-between">
                        <span className="flex items-center space-x-1.5">
                          <Feather className="w-3.5 h-3.5" />
                          <span>{t.work.stagingTitle}</span>
                        </span>
                        <span className="bg-emerald-100 text-emerald-800 text-[10px] px-1.5 py-0.5 rounded-full font-bold inline-flex items-center justify-center text-center leading-none">
                          {activeStagedAnnotations.length}
                        </span>
                      </h4>

                      {activeStagedAnnotations.map((item) => {
                        const isPinned = pinnedConcept === item.concept_uri
                        const isHovered = hoveredConcept === item.concept_uri
                        const isMulti = item.scope_type === 'multi_paragraph' || (item.target_paragraphs && item.target_paragraphs.length > 1)

                        return (
                          <div
                            key={item.id}
                            onMouseEnter={() => setHoveredConcept(item.concept_uri)}
                            onMouseLeave={() => setHoveredConcept(null)}
                            onClick={() => setPinnedConcept((prev) => (prev === item.concept_uri ? null : item.concept_uri))}
                            className={`p-3 rounded-none border text-xs space-y-2 transition-all cursor-pointer ${
                              isPinned
                                ? 'border-emerald-600 bg-emerald-100/90 ring-2 ring-emerald-600 shadow-sm'
                                : isHovered
                                  ? 'border-emerald-500 bg-emerald-100/90 shadow-sm ring-1 ring-emerald-500'
                                  : 'border-emerald-200 bg-emerald-50/50 hover:bg-emerald-100/40'
                            }`}
                          >
                            <div className="space-y-1.5">
                              <div className="flex items-start space-x-1.5 min-w-0">
                                <ConceptCategoryIcon
                                  label={item.concept_label}
                                  uri={item.concept_uri}
                                  className="w-3.5 h-3.5 shrink-0"
                                />
                                <strong className="text-emerald-950 font-semibold text-sm capitalize min-w-0 flex-1 whitespace-normal break-words leading-snug overflow-visible">
                                  {item.concept_label}
                                </strong>
                                {isPinned && <span className="text-xs shrink-0" title="Annotation épinglée">📌</span>}
                              </div>
                              <div className="flex items-center justify-end space-x-1.5">
                                <ConceptCategoryBadge
                                  label={item.concept_label}
                                  uri={item.concept_uri}
                                />
                                <button
                                  type="button"
                                  onClick={async (e) => {
                                    e.stopPropagation()
                                    await deleteAnnotation(item.id)
                                    refetchStaged()
                                  }}
                                  className="text-emerald-700 hover:text-red-600 p-1 rounded-none transition-colors"
                                  title={t.work.deleteStagingTooltip}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Badge Multi-paragraphes */}
                            {isMulti && (
                              <div className="flex items-center space-x-1 text-[10px] text-emerald-800 bg-emerald-100/90 border border-emerald-300 px-2 py-0.5 rounded-full font-semibold w-fit">
                                <Layers className="w-3 h-3 text-emerald-700 shrink-0" />
                                <span>Multi-paragraphes ({item.target_paragraphs?.length || 'étendues'} §)</span>
                              </div>
                            )}

                            <div className="text-[11px] text-emerald-900 italic">
                              {t.work.extract} « {item.target_text} » {isMulti ? `(${item.target_paragraphs?.length || 2} paragraphes)` : `(pos. ${item.start_offset}-${item.end_offset})`}
                            </div>

                            {/* Liens vers les paragraphes couverts */}
                            {item.target_paragraphs && item.target_paragraphs.length > 1 && (
                              <div className="flex items-center flex-wrap gap-1 text-[10px] pt-1">
                                <span className="text-emerald-800 font-medium">Paragraphes :</span>
                                {item.target_paragraphs.map((pUri) => {
                                  const pIdx = paragraphs.findIndex((p) => p.uri === pUri)
                                  const pNum = pIdx !== -1 ? paragraphs[pIdx].id || pIdx + 1 : '§'
                                  const isThisPara = pUri === activeParagraphUri
                                  return (
                                    <button
                                      key={pUri}
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleFocusParagraph(pUri)
                                      }}
                                      className={`px-1.5 py-0.5 rounded-none text-[10px] font-mono border transition-colors ${
                                        isThisPara
                                          ? 'bg-emerald-700 text-white border-emerald-800 font-bold'
                                          : 'bg-white text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                                      }`}
                                      title={`Aller au paragraphe § ${pNum}`}
                                    >
                                      § {pNum}
                                    </button>
                                  )
                                })}
                              </div>
                            )}

                            <div className="pt-1.5 border-t border-emerald-200/60 flex items-center justify-between text-[10px] text-emerald-700">
                              <span>{t.work.annotator} {item.annotator_name}</span>
                              <a
                                href={item.concept_uri}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="hover:underline inline-flex items-center space-x-0.5"
                              >
                                <span>{t.work.viewOnTheZoo}</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : stagedAnnotations.length > 0 ? (
                    <div className="p-2.5 bg-emerald-50/60 rounded-none border border-dashed border-emerald-300 text-center text-xs text-emerald-800">
                      <span>{stagedAnnotations.length} proposition(s) dans d'autres paragraphes de cette section.</span>
                    </div>
                  ) : null}

                  {/* 2. Annotations de référence Corese */}
                  <div className="space-y-2">
                    <h4 className="text-[11px] uppercase font-bold tracking-wider text-[#736a5f]">
                      {t.work.referenceTitle}
                    </h4>

                    {Object.keys(activeAnnotations).length === 0 ? (
                      <p className="text-xs text-[#8c8275] italic p-2 bg-[#fdfcf9] rounded-none border border-[#f0eae0] text-center">
                        {t.work.noReferencePara}
                      </p>
                    ) : (
                      Object.values(activeAnnotations).map((item) => {
                        const isPinned = pinnedConcept === item.concept
                        const isHovered = hoveredConcept === item.concept

                        return (
                          <div
                            key={`${item.concept}-${item.label}`}
                            onMouseEnter={() => setHoveredConcept(item.concept)}
                            onMouseLeave={() => setHoveredConcept(null)}
                            onClick={() => setPinnedConcept((prev) => (prev === item.concept ? null : item.concept))}
                            className={`p-3 rounded-none border text-xs transition-all cursor-pointer ${
                              isPinned
                                ? 'border-[#9A6530] bg-[#fdf7ee] ring-2 ring-amber-500 shadow-sm'
                                : isHovered
                                  ? 'border-[#9A6530] bg-[#fdfaf5] shadow-sm ring-1 ring-[#9A6530]'
                                  : 'border-[#ebe4d6] bg-[#faf9f6] hover:border-[#cfc5b4] hover:bg-white'
                            }`}
                          >
                            <div className="space-y-1.5">
                              <div className="flex items-start space-x-1.5 min-w-0">
                                <ConceptCategoryIcon
                                  category={item.category}
                                  collection={item.collection}
                                  label={item.label}
                                  uri={item.concept}
                                  className="w-3.5 h-3.5 shrink-0"
                                />
                                <strong className="text-[#2c2724] font-semibold text-sm capitalize min-w-0 flex-1 whitespace-normal break-words leading-snug overflow-visible">
                                  {item.label.toLowerCase()}
                                </strong>
                                {isPinned && <span className="text-xs shrink-0" title="Annotation épinglée">📌</span>}
                              </div>
                              <div className="flex items-center justify-end space-x-1.5">
                                <ConceptCategoryBadge
                                  category={item.category}
                                  collection={item.collection}
                                  label={item.label}
                                  uri={item.concept}
                                />
                                <span className="text-[10px] text-[#8c8275] uppercase px-1.5 py-0.5 bg-white border border-[#ded5c6] rounded-none font-mono inline-flex items-center justify-center text-center leading-none">
                                  {item.type.split('#').pop()}
                                </span>
                              </div>
                            </div>

                            <div className="mt-2 flex items-center justify-between text-[11px] pt-2 border-t border-[#f0eae0]">
                              <span className="text-[#736a5f] font-medium bg-[#f0eae0]/80 px-2 py-0.5 rounded-full inline-flex items-center justify-center text-center leading-none">
                                {item.offset.length} {t.work.occurrencesCount}
                              </span>
                              <a
                                href={item.concept}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-[#9A6530] hover:underline inline-flex items-center space-x-1 font-medium"
                              >
                                <span>{t.work.viewOnTheZoo}</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>

                </div>
              )}
            </div>
          </aside>

        </div>
      )}

      {/* Modal d'annotation interactive W3C */}
      <AnnotationModal
        isOpen={isAnnotModalOpen}
        onClose={() => {
          setIsAnnotModalOpen(false)
          setSelectedSnippet(null)
          setModalTargetParas([])
          setModalTargetParaDetails([])
          setModalEndParaUri(undefined)
          setModalScopeType('word_sequence')
        }}
        paragraphUri={activeParagraphUri}
        targetText={modalTargetText}
        startOffset={modalStartOffset}
        endOffset={modalEndOffset}
        targetParagraphs={modalTargetParas.length > 0 ? modalTargetParas : undefined}
        targetParagraphDetails={modalTargetParaDetails.length > 0 ? modalTargetParaDetails : undefined}
        endParagraphUri={modalEndParaUri}
        initialScopeType={modalScopeType}
        onSuccess={() => refetchStaged()}
      />

    </div>
  )
}
