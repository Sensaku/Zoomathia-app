import React, { useState, useEffect, useId, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  fetchAuthors,
  fetchWorks,
  fetchSummary,
  fetchParagraphs,
  fetchTranslation,
  fetchSectionAnnotations,
  resolveUri,
} from '../api/client'
import {
  Author,
  Work,
  SummaryNode,
  Paragraph,
  TargetParagraphDetail,
  AnnotationScopeType,
  AnnotationMap,
  StagedAnnotation,
} from '../types'
import { useI18n } from '../i18n'
import { fill } from '../features/contributions/lib/fill'
import {
  LoadError,
  PinnedConceptBanner,
  ReadingParagraphCard,
  ReferenceAnnotationCard,
  TextSizeToggle,
} from '../features/reading'
import {
  PendingSavedNotice,
  PendingToggle,
  useSavedNotice,
  StagedAnnotationCard,
  contributionKeys,
  usePendingFilter,
  AnnotationCreateDialog,
} from '../features/contributions'
import {
  BookOpen,
  ChevronRight,
  ChevronDown,
  Languages,
  Loader2,
  Sparkles,
  Download,
  Feather,
  User,
} from 'lucide-react'
import { ConceptCategoryBadge, CATEGORY_TOC_PINNED, CATEGORY_TOC_HOVER } from '../components/ConceptCategoryBadge'
import { MultiParagraphLinks, useConceptInspection } from '../components/reading'

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

// Stable empty values: a `?? []` in render would be a new object each time and defeat the memos.
const NO_WORKS: Work[] = []
const NO_AUTHORS: Author[] = []
const NO_SUMMARY: SummaryNode[] = []
const NO_PARAGRAPHS: Paragraph[] = []
const NO_REFERENCES: Record<string, AnnotationMap> = {}
const NO_STAGED: StagedAnnotation[] = []
const NO_ANNOTATIONS: AnnotationMap = {}

export const ExploreWork: React.FC = () => {
  const { t, language } = useI18n()
  const authorSelectId = useId()
  const workSelectId = useId()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialUri = searchParams.get('uri')?.trim() || ''
  const { includePending } = usePendingFilter()

  // The author chosen in the select; the author of the selected work wins over it.
  const [pickedAuthor, setPickedAuthor] = useState<string>('')
  const [selectedWorkUri, setSelectedWorkUri] = useState<string>('')
  const [activeSectionUri, setActiveSectionUri] = useState<string>('')
  const [activeParagraphUri, setActiveParagraphUri] = useState<string>('')
  const [showTranslation, setShowTranslation] = useState<boolean>(true)
  const [textSize, setTextSize] = useState<'normal' | 'large' | 'xlarge'>('large')

  // Gestion du repliement des nœuds de la table des matières
  const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({})

  // The `uri` parameter is applied once per value, so that the manual navigation is not overwritten.
  // `ownUri` is a choice made in the selects: the URL follows it in a later render, which must not
  // be read as a new link.
  const [appliedUri, setAppliedUri] = useState('')
  const [optimisticUri, setOptimisticUri] = useState('')
  const [ownUri, setOwnUri] = useState<string | null>(null)
  const [autoScrolledFor, setAutoScrolledFor] = useState<string | null>(null)
  const hasAutoScrolled = autoScrolledFor === initialUri
  // A link that comes back (browser Back) must scroll again: forget the old scroll when the link changes.
  const [scrollLinkSeen, setScrollLinkSeen] = useState(initialUri)
  if (scrollLinkSeen !== initialUri) {
    setScrollLinkSeen(initialUri)
    setAutoScrolledFor(null)
  }

  // 1. Ensemble des oeuvres pour synchronisation instantanée et métadonnées
  const worksQuery = useQuery({
    queryKey: ['allWorks'],
    queryFn: fetchWorks,
  })
  const allWorks = worksQuery.data ?? NO_WORKS
  const isAllWorksLoading = worksQuery.isLoading

  // 1.bis Résolution sémantique de l'URI d'entrée (oeuvre, section ou paragraphe)
  const resolveQuery = useQuery({
    queryKey: ['resolveUri', initialUri],
    queryFn: ({ signal }) => resolveUri(initialUri, signal),
    enabled: !!initialUri,
    staleTime: 5 * 60 * 1000,
  })
  const resolvedTarget = resolveQuery.data
  const isResolvingTarget = resolveQuery.isLoading

  // Application de la résolution sémantique de l'URI reçue en paramètre (state adjusted while rendering)
  if (ownUri !== null && ownUri === initialUri) {
    setOwnUri(null)
  } else if (ownUri === null && initialUri !== appliedUri) {
    if (!initialUri) {
      setAppliedUri('')
    } else if (resolvedTarget) {
      setAppliedUri(initialUri)
      if (resolvedTarget.work) {
        setSelectedWorkUri(resolvedTarget.work)
      }
      if (resolvedTarget.section) {
        setActiveSectionUri(resolvedTarget.section)
      }
      if (resolvedTarget.paragraph) {
        setActiveParagraphUri(resolvedTarget.paragraph)
      } else if (resolvedTarget.type !== 'work' && resolvedTarget.type !== 'section') {
        setActiveParagraphUri(initialUri)
      }
    } else if (optimisticUri !== initialUri) {
      // Pré-résolution optimiste immédiate si l'URI commence par une œuvre connue
      const matchedWork = allWorks.find((w) => initialUri === w.uri || initialUri.startsWith(w.uri + '/'))
      if (matchedWork) {
        setOptimisticUri(initialUri)
        setSelectedWorkUri(matchedWork.uri)
        if (initialUri !== matchedWork.uri) {
          setActiveParagraphUri(initialUri)
        }
      }
    }
  }

  // Oeuvre active résolue depuis allWorks
  const currentWork = useMemo(() => {
    return allWorks.find((w) => w.uri === selectedWorkUri)
  }, [allWorks, selectedWorkUri])
  const selectedAuthor = currentWork?.author || pickedAuthor

  // 2. Liste des auteurs
  const authorsQuery = useQuery({
    queryKey: ['authors'],
    queryFn: fetchAuthors,
  })
  const authors = authorsQuery.data ?? NO_AUTHORS
  const isAuthorsLoading = authorsQuery.isLoading
  const catalogueError = worksQuery.error ?? authorsQuery.error
  const retryCatalogue = () => {
    if (worksQuery.isError) void worksQuery.refetch()
    if (authorsQuery.isError) void authorsQuery.refetch()
  }

  // 3. Liste des oeuvres filtrées pour l'auteur (ou toutes les oeuvres si aucun auteur)
  const works = useMemo(() => {
    if (!selectedAuthor) return allWorks
    return allWorks.filter((w) => w.author === selectedAuthor)
  }, [allWorks, selectedAuthor])

  // 3.bis Sommaire / Arborescence de l'oeuvre active
  const summaryQuery = useQuery({
    queryKey: ['summary', selectedWorkUri],
    queryFn: ({ signal }) => fetchSummary(selectedWorkUri, signal),
    enabled: !!selectedWorkUri,
  })
  const summary = summaryQuery.data ?? NO_SUMMARY
  const isSummaryLoading = summaryQuery.isLoading

  // 4. Traduction anglaise candidate
  const translationQuery = useQuery({
    queryKey: ['translation', selectedWorkUri],
    queryFn: ({ signal }) => fetchTranslation(selectedWorkUri, signal),
    enabled: !!selectedWorkUri,
  })
  const translationInfo = translationQuery.data

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
  // A new annotation is pending, so hidden by default: tell its author (RM-ACC-03).
  const savedNotice = useSavedNotice(targetSectionUri)

  // Déplier automatiquement le livre parent dans la table des matières quand la section active change
  // (le lecteur peut ensuite le replier).
  const [expandedFor, setExpandedFor] = useState<{ section: string; summary: SummaryNode[] } | null>(null)
  if (
    targetSectionUri &&
    summary.length > 0 &&
    (expandedFor?.section !== targetSectionUri || expandedFor.summary !== summary)
  ) {
    setExpandedFor({ section: targetSectionUri, summary })
    const book = summary.find((b) => b.children?.some((c) => c.uri === targetSectionUri) || b.uri === targetSectionUri)
    if (book && collapsedNodes[book.uri]) {
      setCollapsedNodes({ ...collapsedNodes, [book.uri]: false })
    }
  }

  const paragraphsQuery = useQuery({
    queryKey: ['paragraphs', targetSectionUri],
    queryFn: ({ signal }) => fetchParagraphs(targetSectionUri, signal),
    enabled: !!targetSectionUri,
  })
  const paragraphs = paragraphsQuery.data ?? NO_PARAGRAPHS
  const isParagraphsLoading = paragraphsQuery.isLoading

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
        setAutoScrolledFor(initialUri)
      }
    }, 120)

    return () => clearTimeout(timer)
  }, [activeParagraphUri, paragraphs, isParagraphsLoading, hasAutoScrolled, initialUri])

  // 6. Traduction des paragraphes si disponible
  const translationParagraphsQuery = useQuery({
    queryKey: ['translationParagraphs', translationInfo?.uri],
    queryFn: ({ signal }) => fetchParagraphs(translationInfo?.uri || '', signal),
    enabled: !!translationInfo?.uri && showTranslation,
  })
  const translationParagraphs = translationParagraphsQuery.data ?? NO_PARAGRAPHS
  const translationError = translationQuery.error ?? translationParagraphsQuery.error
  const retryTranslation = () => {
    if (translationQuery.isError) void translationQuery.refetch()
    if (translationParagraphsQuery.isError) void translationParagraphsQuery.refetch()
  }

  // 7. Annotations groupées de la section (Corese + Staging)
  const sectionQuery = useQuery({
    queryKey: contributionKeys.sectionAnnotations(targetSectionUri, language, includePending),
    queryFn: ({ signal }) => fetchSectionAnnotations(targetSectionUri, language, { includePending, signal }),
    enabled: !!targetSectionUri,
  })
  const sectionData = sectionQuery.data
  const refetchStaged = sectionQuery.refetch

  const referenceAnnotations = sectionData?.reference_annotations ?? NO_REFERENCES
  const stagedAnnotations = sectionData?.staged_annotations ?? NO_STAGED

  // Annotations de référence pour le paragraphe actif
  const activeAnnotations = useMemo(() => {
    if (!activeParagraphUri) return NO_ANNOTATIONS
    return referenceAnnotations[activeParagraphUri] ?? NO_ANNOTATIONS
  }, [referenceAnnotations, activeParagraphUri])

  // Annotations staging touchant le paragraphe actif
  const activeStagedAnnotations = useMemo(() => {
    if (!activeParagraphUri) return NO_STAGED
    return stagedAnnotations.filter(
      (s) =>
        s.paragraph_uri === activeParagraphUri ||
        (s.target_paragraphs && s.target_paragraphs.includes(activeParagraphUri)),
    )
  }, [stagedAnnotations, activeParagraphUri])

  // Gestion réactive de l'inspection (survol prioritaire, épinglage, résolution multi-paragraphes)
  const inspectionState = useConceptInspection({
    referenceAnnotations,
    stagedAnnotations,
    paragraphs,
    setActiveParagraphUri,
  })

  const {
    hoveredConcept,
    setHoveredConcept,
    pinnedConcept,
    setPinnedConcept,
    activeInspectionCategory,
    pinnedConceptLabel,
    pinnedConceptCategory,
    pinnedParagraphsList,
    pinnedParagraphUris,
    hoveredParagraphUris,
    handleFocusParagraph,
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
    setAppliedUri(uri)
    setOwnUri(uri)
    setSelectedWorkUri(uri)
    setActiveSectionUri('')
    setActiveParagraphUri('')
    setSelectedSnippet(null)
    // Functional form: keeps the other parameters, such as pending=1 (RM-ACC-03).
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      next.set('uri', uri)
      return next
    })
  }

  // Changement d'auteur avec pré-sélection de sa première œuvre
  const handleAuthorChange = (newAuthor: string) => {
    setPickedAuthor(newAuthor)
    setActiveSectionUri('')
    setActiveParagraphUri('')
    setSelectedSnippet(null)
    if (newAuthor) {
      const authorWorks = allWorks.filter((w) => w.author === newAuthor)
      if (authorWorks.length > 0) {
        handleSelectWork(authorWorks[0].uri)
      } else {
        setAppliedUri('')
        setOwnUri('')
        setSelectedWorkUri('')
        setSearchParams((previous) => {
          const next = new URLSearchParams(previous)
          next.delete('uri')
          return next
        })
      }
    }
  }

  const toggleNodeCollapse = (uri: string) => {
    setCollapsedNodes((prev) => ({
      ...prev,
      [uri]: !prev[uri],
    }))
  }

  // Utilitaires de détection et complétion aux frontières de mots
  const isWordChar = (ch: string): boolean => {
    return /[\p{L}\p{N}\p{M}]/u.test(ch)
  }

  const expandToWordBoundaries = (
    fullText: string,
    start: number,
    end: number,
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
      text: fullText.slice(s, e),
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

      const {
        start: finalStartOffset,
        end: finalEndOffset,
        text: finalRaw,
      } = expandToWordBoundaries(currentP.text, sOffset, eOffset)

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
      setModalStartOffset(
        startP.text.indexOf(paraDetails[0].text) !== -1 ? startP.text.indexOf(paraDetails[0].text) : 0,
      )
      setModalEndOffset(paraDetails[paraDetails.length - 1].text.length)
      setModalTargetParas(targeted.map((item) => item.uri))
      setModalTargetParaDetails(paraDetails)
      setModalEndParaUri(endP.uri)
      setModalScopeType('multi_paragraph')
      setIsAnnotModalOpen(true)
    }
  }

  // Short paragraph list under the active section of the table of contents.
  const renderTocParagraphs = () => {
    if (isParagraphsLoading) {
      return (
        <div className="flex items-center space-x-1.5 py-2 text-[11px] text-ink-muted">
          <Loader2 className="h-3 w-3 animate-spin text-accent" />
          <span>{t.work.loadingParagraphs}</span>
        </div>
      )
    }
    if (paragraphsQuery.isError) {
      return <p className="py-1 text-[11px] text-danger">{t.work.paragraphsUnavailable}</p>
    }
    if (paragraphs.length === 0) {
      return <p className="py-1 text-[11px] text-ink-muted italic">{t.work.noParagraphs}</p>
    }
    return paragraphs.map((p) => {
      const isCurrentP = activeParagraphUri === p.uri
      const isHoveredP = !!hoveredConcept && (hoveredParagraphUris?.has(p.uri) ?? false)
      const isPinnedP = !!pinnedConcept && (pinnedParagraphUris?.has(p.uri) ?? false)

      return (
        <button
          key={p.uri}
          type="button"
          aria-current={isCurrentP ? 'true' : undefined}
          onClick={(e) => {
            e.stopPropagation()
            handleFocusParagraph(p.uri)
          }}
          className={`group flex w-full cursor-pointer items-center justify-between rounded-none border px-2 py-1.5 text-left text-xs transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
            isCurrentP
              ? 'border-accent-strong bg-accent font-semibold text-white shadow-xs'
              : isHoveredP
                ? 'border-amber-300 bg-amber-100/90 text-amber-950'
                : isPinnedP
                  ? 'border-amber-200 bg-amber-100/70 text-amber-900'
                  : 'border-transparent text-ink hover:border-rule hover:bg-paper-sunken'
          }`}
          title={p.text}
        >
          <span
            className={`inline-flex shrink-0 items-center justify-center rounded-none border px-1.5 py-0.5 text-center font-mono text-[11px] leading-none font-bold ${
              isCurrentP
                ? 'border-amber-400 bg-amber-300 text-amber-950 shadow-2xs'
                : isHoveredP
                  ? CATEGORY_TOC_HOVER[activeInspectionCategory] || CATEGORY_TOC_HOVER.general
                  : isPinnedP
                    ? CATEGORY_TOC_PINNED[pinnedConceptCategory] || CATEGORY_TOC_PINNED.general
                    : 'border-rule bg-paper-sunken text-accent-strong'
            }`}
          >
            § {p.id}
          </span>
          <span
            className={`ml-2 truncate font-serif text-xs italic ${isCurrentP ? 'text-white' : 'text-ink-muted group-hover:text-ink'}`}
          >
            {p.text.slice(0, 26)}...
          </span>
        </button>
      )
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col space-y-2.5 overflow-hidden pt-2.5 pb-1.5">
      {/* Barre de Commande Éditoriale Supérieure */}
      <header className="flex shrink-0 flex-col items-stretch justify-between gap-3 rounded-none border border-rule bg-white px-4 py-2.5 shadow-xs sm:px-5 sm:py-3 xl:flex-row xl:items-center">
        {/* Résumé de l'œuvre & Titre statutaire */}
        <div className="flex min-w-0 items-center space-x-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-none border border-accent/30 bg-accent/10 text-accent">
            <BookOpen className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-2">
              <span className="text-[11px] font-bold tracking-wider text-accent uppercase">
                {currentWork?.author || selectedAuthor || t.work.corpusSelection}
              </span>
              {currentWork?.language && (
                <span className="rounded-none border border-amber-300/60 bg-amber-100/80 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-900 uppercase">
                  {currentWork.language}
                </span>
              )}
            </div>
            <h1 className="truncate font-serif text-lg font-bold text-ink sm:text-xl">
              {currentWork?.title || t.work.selectPrompt}
            </h1>
          </div>
        </div>

        {/* Sélecteurs Auteur & Œuvre compacts + Outils de lecture */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Menu déroulant Auteur */}
          <div className="relative w-48 sm:w-56">
            <label htmlFor={authorSelectId} className="sr-only">
              {t.work.authorSelectLabel}
            </label>
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-accent">
              <User aria-hidden="true" className="h-3.5 w-3.5" />
            </div>
            <select
              id={authorSelectId}
              value={selectedAuthor}
              onChange={(e) => handleAuthorChange(e.target.value)}
              disabled={isAuthorsLoading}
              className="w-full rounded-none border border-rule-strong bg-paper-raised py-1.5 pr-3 pl-8 text-xs font-medium text-ink focus-visible:outline-2 focus-visible:outline-accent"
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
            <label htmlFor={workSelectId} className="sr-only">
              {t.work.workSelectLabel}
            </label>
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-accent">
              <BookOpen aria-hidden="true" className="h-3.5 w-3.5" />
            </div>
            <select
              id={workSelectId}
              value={selectedWorkUri}
              onChange={(e) => handleSelectWork(e.target.value)}
              disabled={isAllWorksLoading}
              className="w-full truncate rounded-none border border-rule-strong bg-paper-raised py-1.5 pr-3 pl-8 text-xs font-medium text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
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
          <TextSizeToggle value={textSize} onChange={setTextSize} />

          {/* Bascule Traduction alignée */}
          {translationInfo && (
            <label className="flex shrink-0 cursor-pointer items-center space-x-2 rounded-none border border-rule-strong bg-paper-sunken px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-white">
              <Languages aria-hidden="true" className="h-4 w-4 text-accent-strong" />
              <span>{t.work.alignedTranslation}</span>
              <input
                type="checkbox"
                checked={showTranslation}
                onChange={(e) => setShowTranslation(e.target.checked)}
                className="rounded-none text-accent focus-visible:outline-2 focus-visible:outline-accent"
              />
            </label>
          )}
        </div>
      </header>

      {catalogueError ? (
        <div className="shrink-0">
          <LoadError
            error={catalogueError}
            onRetry={retryCatalogue}
            isRetrying={worksQuery.isFetching || authorsQuery.isFetching}
          />
        </div>
      ) : null}

      {/* Vue Principale : 3 Colonnes (Sommaire / Texte Bilingue / Annotations) */}
      {!selectedWorkUri ? (
        isAllWorksLoading || (isResolvingTarget && initialUri) ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center space-y-4 rounded-none border border-rule bg-white p-12 text-center shadow-xs">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-accent" />
            <div className="space-y-1">
              <h3 className="font-serif text-lg font-bold text-ink">
                {initialUri ? t.work.loadingWork : t.common.loading}
              </h3>
              {initialUri ? (
                <p className="mx-auto max-w-md text-xs text-ink-muted">{t.work.resolvingReference}</p>
              ) : null}
            </div>
          </div>
        ) : catalogueError ? null : resolveQuery.isError && initialUri ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-none border border-rule bg-white p-12 shadow-xs">
            <div className="w-full max-w-md">
              <LoadError
                error={resolveQuery.error}
                onRetry={() => void resolveQuery.refetch()}
                isRetrying={resolveQuery.isFetching}
              />
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center space-y-3 rounded-none border border-rule bg-white p-12 text-center shadow-xs">
            <BookOpen className="mx-auto h-12 w-12 text-accent opacity-70" />
            <h3 className="font-serif text-xl font-bold text-ink">{t.work.noWorkSelected}</h3>
            <p className="mx-auto max-w-md text-sm text-ink-muted">{t.work.noWorkDesc}</p>
          </div>
        )
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 items-stretch gap-4 lg:grid-cols-12">
          {/* Colonne 1 : Table des Matières & Arborescence (3 colonnes) */}
          <aside className="flex h-full flex-col overflow-hidden rounded-none border border-rule bg-white shadow-xs lg:col-span-3">
            <div className="flex shrink-0 items-center justify-between border-b border-rule bg-paper-raised p-3.5">
              <h3 className="flex items-center space-x-2 font-serif text-sm font-bold text-ink sm:text-base">
                <BookOpen aria-hidden="true" className="h-4 w-4 text-accent" />
                <span>{t.work.tableOfContents}</span>
              </h3>
              <span className="inline-flex items-center justify-center rounded-full bg-paper-sunken px-2 py-0.5 text-center text-[11px] leading-none font-semibold text-ink-muted">
                {summary.length} {t.work.sectionsCount}
              </span>
            </div>

            <div className="flex-1 scrollbar-thin space-y-1.5 overflow-y-auto p-3">
              {isSummaryLoading ? (
                <div className="space-y-2 py-2">
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <div key={n} className="h-7 animate-pulse rounded-none bg-paper-sunken" />
                  ))}
                </div>
              ) : summaryQuery.isError ? (
                <LoadError
                  error={summaryQuery.error}
                  onRetry={() => void summaryQuery.refetch()}
                  isRetrying={summaryQuery.isFetching}
                />
              ) : summary.length === 0 ? (
                <p className="p-3 text-center text-xs text-ink-muted italic">{t.work.structureNotSegmented}</p>
              ) : (
                <nav aria-label={t.work.tableOfContents} className="space-y-1 text-xs">
                  {summary.map((book) => {
                    const isBookCollapsed = !!collapsedNodes[book.uri]
                    const hasChildren = book.children && book.children.length > 0

                    // Cas 1 : Nœud Livre ou Section avec sous-chapitres
                    if (hasChildren) {
                      return (
                        <div key={book.uri} className="space-y-1">
                          <button
                            type="button"
                            aria-expanded={!isBookCollapsed}
                            onClick={() => toggleNodeCollapse(book.uri)}
                            className="flex w-full cursor-pointer items-center justify-between rounded-none border border-rule bg-paper-raised px-2.5 py-1.5 text-left font-semibold text-ink transition-colors hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-accent"
                          >
                            <span className="truncate">{book.title || fill(t.work.bookFallback, { id: book.id })}</span>
                            {isBookCollapsed ? (
                              <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-ink-subtle" />
                            ) : (
                              <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-ink-subtle" />
                            )}
                          </button>

                          {!isBookCollapsed && (
                            <div className="my-0.5 ml-2.5 space-y-0.5 border-l-2 border-rule pl-2">
                              {book.children.map((chapter) => {
                                const isChapterActive = targetSectionUri === chapter.uri

                                return (
                                  <div key={chapter.uri} className="space-y-0.5">
                                    <button
                                      type="button"
                                      aria-current={isChapterActive ? 'true' : undefined}
                                      onClick={() => {
                                        setActiveSectionUri(chapter.uri)
                                        setActiveParagraphUri('')
                                      }}
                                      className={`flex w-full cursor-pointer items-center justify-between rounded-none px-2.5 py-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                                        isChapterActive
                                          ? 'bg-accent font-medium text-white shadow-2xs'
                                          : 'text-ink hover:bg-paper-sunken'
                                      }`}
                                    >
                                      <span className="truncate">
                                        {chapter.title || fill(t.work.chapterFallback, { id: chapter.id })}
                                      </span>
                                      {isChapterActive ? (
                                        <ChevronDown aria-hidden="true" className="ml-1 h-3 w-3 shrink-0 text-white" />
                                      ) : (
                                        <ChevronRight
                                          aria-hidden="true"
                                          className="ml-1 h-3 w-3 shrink-0 text-ink-subtle"
                                        />
                                      )}
                                    </button>

                                    {/* Menu dépliant des paragraphes du chapitre actif */}
                                    {isChapterActive && (
                                      <div className="my-1 ml-2 max-h-60 scrollbar-thin space-y-1 overflow-y-auto border-l-2 border-accent/40 pr-1 pl-2">
                                        {renderTocParagraphs()}
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
                          aria-current={isLeafActive ? 'true' : undefined}
                          onClick={() => {
                            setActiveSectionUri(book.uri)
                            setActiveParagraphUri('')
                          }}
                          className={`flex w-full cursor-pointer items-center justify-between rounded-none px-2.5 py-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                            isLeafActive
                              ? 'bg-accent font-medium text-white shadow-2xs'
                              : 'text-ink hover:bg-paper-sunken'
                          }`}
                        >
                          <span className="truncate">
                            {book.title || fill(t.work.sectionFallback, { id: book.id })}
                          </span>
                          {isLeafActive ? (
                            <ChevronDown aria-hidden="true" className="ml-1 h-3 w-3 shrink-0 text-white" />
                          ) : (
                            <ChevronRight aria-hidden="true" className="ml-1 h-3 w-3 shrink-0 text-ink-subtle" />
                          )}
                        </button>

                        {/* Menu dépliant des paragraphes si feuille active */}
                        {isLeafActive && (
                          <div className="my-1 ml-2 max-h-60 scrollbar-thin space-y-1 overflow-y-auto border-l-2 border-accent/40 pr-1 pl-2">
                            {renderTocParagraphs()}
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
          <main className="flex h-full flex-col overflow-hidden rounded-none border border-rule bg-white shadow-xs lg:col-span-6">
            {/* En-tête de lecture */}
            <div className="flex shrink-0 items-center justify-between border-b border-rule bg-paper-raised p-3.5">
              <div className="flex min-w-0 items-center space-x-2">
                <Feather aria-hidden="true" className="h-4 w-4 shrink-0 text-accent" />
                <span className="truncate font-serif text-sm font-bold text-ink sm:text-base">
                  {t.work.originalTextAndAnnots}
                </span>
              </div>
              <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-paper-sunken px-2 py-0.5 text-center text-[11px] leading-none font-semibold text-ink-muted">
                {paragraphs.length} {t.work.paragraphsCount}
              </span>
            </div>

            <div className="flex-1 scrollbar-thin space-y-5 overflow-y-auto p-5">
              {translationError ? (
                <LoadError
                  error={translationError}
                  onRetry={retryTranslation}
                  tone="warning"
                  isRetrying={translationQuery.isFetching || translationParagraphsQuery.isFetching}
                />
              ) : null}
              {isParagraphsLoading ? (
                <div className="flex flex-col items-center justify-center space-y-3 py-24">
                  <Loader2 className="h-8 w-8 animate-spin text-accent" />
                  <span className="text-sm font-medium text-ink-muted">{t.work.loadingText}</span>
                </div>
              ) : paragraphsQuery.isError ? (
                <LoadError
                  error={paragraphsQuery.error}
                  onRetry={() => void paragraphsQuery.refetch()}
                  isRetrying={paragraphsQuery.isFetching}
                />
              ) : paragraphs.length === 0 ? (
                <p className="py-16 text-center text-sm text-ink-muted">{t.work.noParagraphsSection}</p>
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
                      isCurrentPara={activeParagraphUri === p.uri}
                      referenceMap={referenceAnnotations[p.uri]}
                      stagedList={stagedAnnotations}
                      inspectionState={inspectionState}
                      textSize={textSize}
                      showTranslation={showTranslation}
                      translationP={translationParagraphs[idx]}
                      onActivate={() => setActiveParagraphUri(p.uri)}
                      onTextSelection={handleFreeTextSelection}
                      selectedSnippet={activeParagraphUri === p.uri ? selectedSnippet : null}
                      onAnnotateSnippet={() => setIsAnnotModalOpen(true)}
                    />
                  ))}
                </div>
              )}
            </div>
          </main>

          {/* Colonne 3 : Panneau d'Annotations Sémantiques (Corese + Staging) (3 colonnes) */}
          <aside className="flex h-full flex-col overflow-hidden rounded-none border border-rule bg-white shadow-xs lg:col-span-3">
            <div className="flex shrink-0 items-center justify-between border-b border-rule bg-paper-raised p-3.5">
              <h3 className="flex items-center space-x-1.5 font-serif text-sm font-bold text-ink sm:text-base">
                <Sparkles aria-hidden="true" className="h-4 w-4 text-accent" />
                <span>{t.work.annotationsTitle}</span>
              </h3>
              {/* No count while the annotations failed to load: 0 would read as "nothing here". */}
              {!sectionQuery.isError && (
                <span className="inline-flex items-center justify-center rounded-full border border-rule bg-paper-sunken px-2.5 py-0.5 text-center text-[11px] leading-none font-bold text-accent-strong">
                  {Object.keys(activeAnnotations).length + stagedAnnotations.length} {t.work.conceptsCount}
                </span>
              )}
            </div>

            <div className="flex-1 scrollbar-thin space-y-4 overflow-y-auto p-3.5">
              {/* Bouton d'export global des annotations de staging */}
              <div>
                <a
                  href="/api/annotations/export-ttl"
                  download
                  className="inline-flex w-full items-center justify-center space-x-1.5 rounded-none border border-rule-strong bg-paper-raised px-3 py-1.5 text-xs font-medium text-accent-strong shadow-2xs transition-colors hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <Download aria-hidden="true" className="h-3.5 w-3.5" />
                  <span>{t.work.exportStagingTtl}</span>
                </a>
              </div>

              <PendingToggle />
              {savedNotice.visible && <PendingSavedNotice onDismiss={savedNotice.dismiss} />}

              {sectionQuery.isError ? (
                <LoadError
                  error={sectionQuery.error}
                  onRetry={() => void sectionQuery.refetch()}
                  isRetrying={sectionQuery.isFetching}
                />
              ) : !activeParagraphUri ? (
                <p className="p-3 text-center text-xs leading-relaxed text-ink-muted italic">
                  {t.work.selectParaPrompt}
                </p>
              ) : (
                <div className="space-y-4">
                  {/* 1. Annotations en Staging (Locales / En révision) */}
                  {activeStagedAnnotations.length > 0 ? (
                    <div className="space-y-2">
                      <h4 className="flex items-center justify-between text-[11px] font-bold tracking-wider text-emerald-800 uppercase">
                        <span className="flex items-center space-x-1.5">
                          <Feather aria-hidden="true" className="h-3.5 w-3.5" />
                          <span>{t.work.stagingTitle}</span>
                        </span>
                        <span className="inline-flex items-center justify-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-center text-[10px] leading-none font-bold text-emerald-800">
                          {activeStagedAnnotations.length}
                        </span>
                      </h4>

                      {activeStagedAnnotations.map((item) => (
                        <StagedAnnotationCard
                          key={item.id}
                          annotation={item}
                          isPinned={pinnedConcept === item.concept_uri}
                          isHighlighted={hoveredConcept === item.concept_uri}
                          onTogglePin={() =>
                            setPinnedConcept((prev) => (prev === item.concept_uri ? null : item.concept_uri))
                          }
                          onHoverChange={(hovered) => setHoveredConcept(hovered ? item.concept_uri : null)}
                        >
                          <MultiParagraphLinks
                            annotation={item}
                            paragraphs={paragraphs}
                            activeParagraphUri={activeParagraphUri}
                            onFocusParagraph={handleFocusParagraph}
                          />
                        </StagedAnnotationCard>
                      ))}
                    </div>
                  ) : stagedAnnotations.length > 0 ? (
                    <div className="rounded-none border border-dashed border-emerald-300 bg-emerald-50/60 p-2.5 text-center text-xs text-emerald-800">
                      <span>{fill(t.work.otherParagraphsProposals, { count: String(stagedAnnotations.length) })}</span>
                    </div>
                  ) : null}

                  {/* 2. Annotations de référence Corese */}
                  <div className="space-y-2">
                    <h4 className="text-[11px] font-bold tracking-wider text-ink-muted uppercase">
                      {t.work.referenceTitle}
                    </h4>

                    {Object.keys(activeAnnotations).length === 0 ? (
                      <p className="rounded-none border border-rule bg-paper p-2 text-center text-xs text-ink-muted italic">
                        {t.work.noReferencePara}
                      </p>
                    ) : (
                      Object.values(activeAnnotations).map((item) => (
                        <ReferenceAnnotationCard
                          key={`${item.concept}-${item.label}`}
                          label={item.label}
                          conceptUri={item.concept}
                          category={item.category}
                          occurrences={item.offset.length}
                          isPinned={pinnedConcept === item.concept}
                          isHighlighted={hoveredConcept === item.concept}
                          onTogglePin={() => setPinnedConcept((prev) => (prev === item.concept ? null : item.concept))}
                          onHoverChange={(hovered) => setHoveredConcept(hovered ? item.concept : null)}
                        >
                          <ConceptCategoryBadge category={item.category} collections={item.collections} />
                          <span className="inline-flex items-center justify-center rounded-none border border-rule-strong bg-white px-1.5 py-0.5 text-center font-mono text-[10px] leading-none text-ink-muted uppercase">
                            {item.type.split('#').pop()}
                          </span>
                        </ReferenceAnnotationCard>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Modal d'annotation interactive W3C */}
      <AnnotationCreateDialog
        open={isAnnotModalOpen}
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
        onSuccess={() => {
          void refetchStaged()
          savedNotice.show()
        }}
      />
    </div>
  )
}
