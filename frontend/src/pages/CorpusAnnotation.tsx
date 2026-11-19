import React, { useId, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  fetchAuthors,
  fetchWorks,
  fetchSummary,
  fetchParagraphs,
  fetchTranslation,
  fetchSectionAnnotations,
} from '../api/client'
import {
  Author,
  Work,
  SummaryNode,
  Paragraph,
  AnnotationMap,
  AnnotationScopeType,
  ConceptCategory,
  StagedAnnotation,
  TargetParagraphDetail,
} from '../types'
import { AnnotationLegendModal } from '../components/AnnotationLegendModal'
import { CATEGORY_TOC_PINNED, CATEGORY_TOC_HOVER } from '../components/ConceptCategoryBadge'
import { useConceptInspection } from '../components/reading'
import { useI18n } from '../i18n'
import {
  PendingSavedNotice,
  PendingToggle,
  useSavedNotice,
  RejectedAnnotationList,
  StagedAnnotationCard,
  contributionKeys,
  usePendingFilter,
  AnnotationCreateDialog,
} from '../features/contributions'
import { fill } from '../features/contributions/lib/fill'
import {
  LoadError,
  PinnedConceptBanner,
  ReadingParagraphCard,
  ReferenceAnnotationCard,
  TextSizeToggle,
} from '../features/reading'
import {
  BookOpen,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Download,
  Feather,
  Languages,
  Search,
  Loader2,
  ListChecks,
  Highlighter,
  HelpCircle,
} from 'lucide-react'

type StatusFilter = 'all' | 'pending' | 'validated' | 'rejected' | 'reference'

// Stable empty values: a `?? []` in render would be a new object each time and defeat the memos.
const NO_WORKS: Work[] = []
const NO_AUTHORS: Author[] = []
const NO_SUMMARY: SummaryNode[] = []
const NO_PARAGRAPHS: Paragraph[] = []
const NO_REFERENCES: Record<string, AnnotationMap> = {}
const NO_STAGED: StagedAnnotation[] = []

/** The first chapter of the first book, or the first node when the work has no chapters. */
function firstLeafUri(summary: SummaryNode[]): string {
  return summary[0]?.children?.[0]?.uri || summary[0]?.uri || ''
}

/** Work shown when the URL names none: Pliny's Historia naturalis if present, else the first one. */
function defaultWork(works: Work[]): Work | undefined {
  return (
    works.find(
      (w) => w.title.toLowerCase().includes('historia naturalis') || w.author.toLowerCase().includes('pline'),
    ) || works[0]
  )
}

export const CorpusAnnotation: React.FC = () => {
  const { t, language } = useI18n()
  const authorSelectId = useId()
  const workSelectId = useId()
  const tocFilterId = useId()
  const paraFilterId = useId()
  const annotSearchId = useId()
  const [searchParams, setSearchParams] = useSearchParams()
  const { includePending, setIncludePending } = usePendingFilter()

  // Navigation picks. Each one is tagged with what it belongs to, so that it never leaks into
  // another work or section; what the user did not pick is derived below (no effect).
  const urlUri = searchParams.get('uri') ?? ''
  const [chosenWork, setChosenWork] = useState<string | null>(null)
  const [seenUrlUri, setSeenUrlUri] = useState(urlUri)
  const [authorPick, setAuthorPick] = useState<{ work: string; author: string } | null>(null)
  const [sectionPick, setSectionPick] = useState<{ work: string; uri: string } | null>(null)
  const [paragraphPick, setParagraphPick] = useState<string>('')
  const [tocFilter, setTocFilter] = useState<string>('')
  const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({})
  const readingContainerRef = useRef<HTMLDivElement>(null)

  // Affichage et typographie
  const [textSize, setTextSize] = useState<'normal' | 'large' | 'xlarge'>('large')
  const [showTranslation, setShowTranslation] = useState<boolean>(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  // Portée du volet d'annotations & pagination fluide
  const [sidebarScope, setSidebarScope] = useState<'active_paragraph' | 'all_section'>('active_paragraph')
  const [sidebarSearch, setSidebarSearch] = useState<string>('')
  const [sectionPageSize, setSectionPageSize] = useState<number>(30)

  // Gestion de la modal d'annotation (surlignage libre)
  const [isAnnotModalOpen, setIsAnnotModalOpen] = useState(false)
  const [isLegendOpen, setIsLegendOpen] = useState(false)
  const [paraTocFilter, setParaTocFilter] = useState('')
  const [modalTargetText, setModalTargetText] = useState('')
  const [modalStartOffset, setModalStartOffset] = useState(0)
  const [modalEndOffset, setModalEndOffset] = useState(0)
  const [modalTargetParas, setModalTargetParas] = useState<string[]>([])
  const [modalTargetParaDetails, setModalTargetParaDetails] = useState<TargetParagraphDetail[]>([])
  const [modalEndParaUri, setModalEndParaUri] = useState<string | undefined>(undefined)
  const [modalScopeType, setModalScopeType] = useState<AnnotationScopeType>('word_sequence')

  // 1. Liste des auteurs et œuvres
  const worksQuery = useQuery({
    queryKey: ['allWorks'],
    queryFn: fetchWorks,
  })
  const allWorks = worksQuery.data ?? NO_WORKS

  const authorsQuery = useQuery({
    queryKey: ['authors'],
    queryFn: fetchAuthors,
  })
  const authors = authorsQuery.data ?? NO_AUTHORS
  const catalogueError = worksQuery.error ?? authorsQuery.error
  const retryCatalogue = () => {
    if (worksQuery.isError) void worksQuery.refetch()
    if (authorsQuery.isError) void authorsQuery.refetch()
  }

  // A choice made in the selects wins until the URL changes to something else. React Router applies
  // `setSearchParams` in a transition, so a render may see the new choice with the old URL: the
  // choice must survive until the URL catches up with it.
  if (seenUrlUri !== urlUri) {
    setSeenUrlUri(urlUri)
    if (chosenWork !== urlUri) setChosenWork(null)
  }

  // Œuvre active : le choix de l'utilisateur, sinon `uri` de l'URL (une URI inconnue ne sélectionne
  // rien), sinon l'œuvre par défaut.
  const selectedWorkUri =
    chosenWork ?? (urlUri ? (allWorks.find((w) => w.uri === urlUri)?.uri ?? '') : (defaultWork(allWorks)?.uri ?? ''))
  const currentWork = useMemo(() => allWorks.find((w) => w.uri === selectedWorkUri), [allWorks, selectedWorkUri])

  // Auteur : celui du filtre choisi pour cette œuvre (y compris « tous »), sinon celui de l'œuvre.
  const selectedAuthor =
    authorPick && authorPick.work === selectedWorkUri ? authorPick.author : (currentWork?.author ?? '')

  const filteredWorks = useMemo(() => {
    if (!selectedAuthor) return allWorks
    return allWorks.filter((w) => w.author === selectedAuthor)
  }, [allWorks, selectedAuthor])

  // 2. Sommaire / Arborescence de l'œuvre
  const summaryQuery = useQuery({
    queryKey: ['summary', selectedWorkUri],
    queryFn: ({ signal }) => fetchSummary(selectedWorkUri, signal),
    enabled: !!selectedWorkUri,
  })
  const summary = summaryQuery.data ?? NO_SUMMARY
  const isSummaryLoading = summaryQuery.isLoading

  // Section active : le choix fait dans cette œuvre, sinon la première feuille du sommaire.
  const activeSectionUri = sectionPick && sectionPick.work === selectedWorkUri ? sectionPick.uri : firstLeafUri(summary)
  // A new annotation is pending, so hidden by default: tell its author (RM-ACC-03).
  const savedNotice = useSavedNotice(activeSectionUri)

  // 3. Paragraphes de la section active
  const paragraphsQuery = useQuery({
    queryKey: ['paragraphs', activeSectionUri],
    queryFn: ({ signal }) => fetchParagraphs(activeSectionUri, signal),
    enabled: !!activeSectionUri,
  })
  const paragraphs = paragraphsQuery.data ?? NO_PARAGRAPHS
  const isParagraphsLoading = paragraphsQuery.isLoading

  // Paragraphe actif : le choix s'il appartient à la section affichée, sinon le premier.
  const activeParagraphUri = paragraphs.some((p) => p.uri === paragraphPick)
    ? paragraphPick
    : (paragraphs[0]?.uri ?? '')
  const setActiveParagraphUri = setParagraphPick

  // 4. Traduction anglaise
  const translationQuery = useQuery({
    queryKey: ['translation', selectedWorkUri],
    queryFn: ({ signal }) => fetchTranslation(selectedWorkUri, signal),
    enabled: !!selectedWorkUri,
  })
  const translationInfo = translationQuery.data

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

  // 5. Annotations groupées de la section (Corese + Staging)
  const sectionQuery = useQuery({
    queryKey: contributionKeys.sectionAnnotations(activeSectionUri, language, includePending),
    queryFn: ({ signal }) => fetchSectionAnnotations(activeSectionUri, language, { includePending, signal }),
    enabled: !!activeSectionUri,
  })
  const isSectionDataLoading = sectionQuery.isLoading
  const refetchSectionData = sectionQuery.refetch
  // A failure must never read as "no annotation" (rule 9).
  const sectionFailed = sectionQuery.isError

  const referenceAnnotations = sectionQuery.data?.reference_annotations ?? NO_REFERENCES
  const stagedAnnotations = sectionQuery.data?.staged_annotations ?? NO_STAGED

  const handleSelectSection = (uri: string) => {
    if (uri !== activeSectionUri) {
      setSectionPick({ work: selectedWorkUri, uri })
      setParagraphPick('')
      if (readingContainerRef.current) {
        readingContainerRef.current.scrollTop = 0
      }
    }
  }

  // Choosing a work writes it in the URL (functional form: keeps pending=1, RM-ACC-03).
  const handleSelectWork = (uri: string) => {
    setChosenWork(uri)
    setAuthorPick((previous) => (previous ? { work: uri, author: previous.author } : null))
    setSectionPick(null)
    setParagraphPick('')
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      next.set('uri', uri)
      return next
    })
  }

  // Choosing an author moves to its first work (to the first work of all when "all").
  const handleAuthorChange = (author: string) => {
    const authorWorks = author ? allWorks.filter((w) => w.author === author) : allWorks
    if (authorWorks.length > 0) {
      setChosenWork(authorWorks[0].uri)
      setAuthorPick({ work: authorWorks[0].uri, author })
      setSectionPick(null)
      setParagraphPick('')
    } else {
      setAuthorPick({ work: selectedWorkUri, author })
    }
  }

  // Gestion du repliement TOC
  const toggleNodeCollapse = (uri: string) => {
    setCollapsedNodes((prev) => ({ ...prev, [uri]: !prev[uri] }))
  }

  // Filtrage des nœuds du sommaire
  const filteredSummary = useMemo(() => {
    if (!tocFilter.trim()) return summary
    const filterLower = tocFilter.toLowerCase().trim()
    return summary
      .map((book) => {
        const bookMatches = book.title.toLowerCase().includes(filterLower)
        const matchingChildren = (book.children || []).filter((child) =>
          child.title.toLowerCase().includes(filterLower),
        )
        if (bookMatches || matchingChildren.length > 0) {
          return {
            ...book,
            children: matchingChildren.length > 0 ? matchingChildren : book.children,
          }
        }
        return null
      })
      .filter(Boolean) as SummaryNode[]
  }, [summary, tocFilter])

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

  // Surlignage libre direct avec complétion automatique des mots tronqués
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

      // Complétion automatique pour englober les mots entiers
      const expanded = expandToWordBoundaries(currentP.text, sOffset, eOffset)
      const finalRaw = expanded.text
      const finalStartOffset = expanded.start
      const finalEndOffset = expanded.end

      // Ignorer si la sélection ne contient aucune lettre (ex: ponctuation isolée)
      if (!/[\p{L}\p{N}]/u.test(finalRaw)) return

      // Synchronisation de la sélection visuelle du navigateur
      try {
        if (range.startContainer.nodeType === Node.TEXT_NODE) {
          let sNodeOffset = range.startOffset
          const textBefore = range.startContainer.textContent || ''
          while (sNodeOffset > 0 && isWordChar(textBefore[sNodeOffset - 1])) {
            sNodeOffset--
          }
          range.setStart(range.startContainer, sNodeOffset)
        }
        if (range.endContainer.nodeType === Node.TEXT_NODE) {
          let eNodeOffset = range.endOffset
          const textAfter = range.endContainer.textContent || ''
          while (eNodeOffset < textAfter.length && isWordChar(textAfter[eNodeOffset])) {
            eNodeOffset++
          }
          range.setEnd(range.endContainer, eNodeOffset)
        }
        sel.removeAllRanges()
        sel.addRange(range)
      } catch {
        // Fallback sans erreur si structure DOM complexe
      }

      setActiveParagraphUri(currentP.uri)
      setModalTargetText(finalRaw)
      setModalStartOffset(finalStartOffset)
      setModalEndOffset(finalEndOffset)
      setModalTargetParas([currentP.uri])
      setModalTargetParaDetails([{ uri: currentP.uri, id: currentP.id, text: finalRaw }])
      setModalEndParaUri(undefined)
      setModalScopeType(finalRaw.split(/\s+/).length === 1 ? 'word' : 'word_sequence')
      setIsAnnotModalOpen(true)
    } else {
      // Séquence de mots s'étendant sur plusieurs paragraphes
      const endIdx = paragraphs.findIndex((item) => item.uri === endUri)
      if (endIdx === -1) return

      const minIdx = Math.min(startIdx, endIdx)
      const maxIdx = Math.max(startIdx, endIdx)
      const targeted = paragraphs.slice(minIdx, maxIdx + 1)
      const startP = targeted[0]
      const endP = targeted[targeted.length - 1]

      // Découpage précis et complétion automatique des mots aux deux extrémités
      const paraDetails: TargetParagraphDetail[] = targeted.map((pItem, idx) => {
        if (idx === 0) {
          // Premier paragraphe : du point de départ jusqu'à la fin du paragraphe
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

          // Compléter le premier mot s'il a été pris en cours de mot
          let sPos = pItem.text.indexOf(slice)
          if (sPos !== -1) {
            while (sPos > 0 && isWordChar(pItem.text[sPos - 1])) {
              sPos--
            }
            slice = pItem.text.slice(sPos).trim()
          }
          return { uri: pItem.uri, id: pItem.id, text: slice }
        } else if (idx === targeted.length - 1) {
          // Dernier paragraphe : du début du paragraphe jusqu'au point d'arrêt
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

          // Compléter le dernier mot s'il a été tronqué
          let ePos = slice.length
          while (ePos < pItem.text.length && isWordChar(pItem.text[ePos])) {
            ePos++
          }
          slice = pItem.text.slice(0, ePos).trim()
          return { uri: pItem.uri, id: pItem.id, text: slice }
        } else {
          // Paragraphes intermédiaires entièrement couverts
          return { uri: pItem.uri, id: pItem.id, text: pItem.text }
        }
      })

      // Synchronisation de la sélection visuelle du navigateur
      try {
        if (range.startContainer.nodeType === Node.TEXT_NODE) {
          let sNodeOffset = range.startOffset
          const textBefore = range.startContainer.textContent || ''
          while (sNodeOffset > 0 && isWordChar(textBefore[sNodeOffset - 1])) {
            sNodeOffset--
          }
          range.setStart(range.startContainer, sNodeOffset)
        }
        if (range.endContainer.nodeType === Node.TEXT_NODE) {
          let eNodeOffset = range.endOffset
          const textAfter = range.endContainer.textContent || ''
          while (eNodeOffset < textAfter.length && isWordChar(textAfter[eNodeOffset])) {
            eNodeOffset++
          }
          range.setEnd(range.endContainer, eNodeOffset)
        }
        sel.removeAllRanges()
        sel.addRange(range)
      } catch {
        // Fallback silencieux
      }

      const fullRaw = paraDetails.map((pd) => pd.text).join('\n\n')

      setActiveParagraphUri(startP.uri)
      setModalTargetText(fullRaw)
      setModalStartOffset(0)
      setModalEndOffset(fullRaw.length)
      setModalTargetParas(targeted.map((item) => item.uri))
      setModalTargetParaDetails(paraDetails)
      setModalEndParaUri(endP.uri)
      setModalScopeType('multi_paragraph')
      setIsAnnotModalOpen(true)
    }
  }

  // Rejected tab (RM-ACC-04): its list lives in RejectedAnnotationList, for one paragraph.
  const isRejectedTab = statusFilter === 'rejected'
  const needsParagraphForRejected = isRejectedTab && (sidebarScope === 'all_section' || !activeParagraphUri)

  // Filtrage des annotations affichées dans la colonne 3
  const filteredStagedAnnotations = useMemo(() => {
    return stagedAnnotations.filter((item) => {
      if (statusFilter === 'all') return true
      if (statusFilter === 'pending') return item.status === 'pending'
      if (statusFilter === 'validated') return item.status === 'validated'
      // Rejected ones never come with the section: they have their own query (RM-ACC-04).
      return false
    })
  }, [stagedAnnotations, statusFilter])

  // Paragraphe actif résolu
  const activeParagraphObj = useMemo(() => {
    return paragraphs.find((p) => p.uri === activeParagraphUri)
  }, [paragraphs, activeParagraphUri])

  // Comptage rapide O(1) du nombre d'annotations par paragraphe (pour badges légers)
  const paragraphAnnotCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const [pUri, annotMap] of Object.entries(referenceAnnotations)) {
      counts[pUri] = (counts[pUri] || 0) + Object.keys(annotMap).length
    }
    for (const s of stagedAnnotations) {
      counts[s.paragraph_uri] = (counts[s.paragraph_uri] || 0) + 1
      if (s.target_paragraphs) {
        for (const tUri of s.target_paragraphs) {
          if (tUri !== s.paragraph_uri) {
            counts[tUri] = (counts[tUri] || 0) + 1
          }
        }
      }
    }
    return counts
  }, [referenceAnnotations, stagedAnnotations])

  // Total global d'annotations dans la section
  const totalSectionReferenceCount = useMemo(() => {
    let count = 0
    for (const annotMap of Object.values(referenceAnnotations)) {
      count += Object.keys(annotMap).length
    }
    return count
  }, [referenceAnnotations])

  const totalSectionCount = totalSectionReferenceCount + stagedAnnotations.length

  // Annotations Staging pour le paragraphe actif
  const activeStagedAnnotations = useMemo(() => {
    if (!activeParagraphUri) return []
    return filteredStagedAnnotations.filter((item) => {
      if (item.paragraph_uri === activeParagraphUri) return true
      if (item.target_paragraphs && item.target_paragraphs.includes(activeParagraphUri)) return true
      return false
    })
  }, [filteredStagedAnnotations, activeParagraphUri])

  // Annotations de Référence Corese pour le paragraphe actif
  const activeReferenceAnnotations = useMemo(() => {
    if (!activeParagraphUri) return []
    const annotMap = referenceAnnotations[activeParagraphUri] || {}
    return Object.values(annotMap).map((item) => ({
      paragraph_uri: activeParagraphUri,
      label: item.label,
      concept: item.concept,
      category: item.category,
      collection: item.collection,
      type: item.type,
      occurrences: item.offset?.length || 1,
    }))
  }, [referenceAnnotations, activeParagraphUri])

  // Aplatissement des annotations Corese pour affichage global (si mode 'all_section')
  const flatReferenceAnnotations = useMemo(() => {
    const list: Array<{
      paragraph_uri: string
      label: string
      concept: string
      category?: ConceptCategory
      collection?: string | null
      type: string
      occurrences: number
    }> = []

    for (const [pUri, annotMap] of Object.entries(referenceAnnotations)) {
      for (const item of Object.values(annotMap)) {
        list.push({
          paragraph_uri: pUri,
          label: item.label,
          concept: item.concept,
          category: item.category,
          collection: item.collection,
          type: item.type,
          occurrences: item.offset?.length || 1,
        })
      }
    }
    return list
  }, [referenceAnnotations])

  // Filtrage par recherche textuelle dans la sidebar
  const searchedSectionStaged = useMemo(() => {
    if (!sidebarSearch.trim()) return filteredStagedAnnotations
    const q = sidebarSearch.toLowerCase().trim()
    return filteredStagedAnnotations.filter(
      (s) => s.concept_label.toLowerCase().includes(q) || s.target_text.toLowerCase().includes(q),
    )
  }, [filteredStagedAnnotations, sidebarSearch])

  const searchedSectionReference = useMemo(() => {
    if (!sidebarSearch.trim()) return flatReferenceAnnotations
    const q = sidebarSearch.toLowerCase().trim()
    return flatReferenceAnnotations.filter(
      (r) => r.label.toLowerCase().includes(q) || r.concept.toLowerCase().includes(q),
    )
  }, [flatReferenceAnnotations, sidebarSearch])

  // Éléments effectivement affichés selon le scope et la pagination
  const displayedStaged = useMemo(() => {
    if (isRejectedTab) return []
    if (sidebarScope === 'active_paragraph') return activeStagedAnnotations
    return searchedSectionStaged.slice(0, sectionPageSize)
  }, [sidebarScope, isRejectedTab, activeStagedAnnotations, searchedSectionStaged, sectionPageSize])

  const displayedReference = useMemo(() => {
    if (sidebarScope === 'active_paragraph') {
      if (statusFilter === 'pending' || statusFilter === 'validated' || statusFilter === 'rejected') {
        return []
      }
      return activeReferenceAnnotations
    }
    if (statusFilter === 'pending' || statusFilter === 'validated' || statusFilter === 'rejected') {
      return []
    }
    const remainingSlots = Math.max(0, sectionPageSize - displayedStaged.length)
    return searchedSectionReference.slice(0, remainingSlots)
  }, [
    sidebarScope,
    activeReferenceAnnotations,
    statusFilter,
    searchedSectionReference,
    sectionPageSize,
    displayedStaged.length,
  ])

  const totalMatchingSection = useMemo(() => {
    const stagedCount = searchedSectionStaged.length
    const refCount = statusFilter === 'all' || statusFilter === 'reference' ? searchedSectionReference.length : 0
    return stagedCount + refCount
  }, [searchedSectionStaged.length, searchedSectionReference.length, statusFilter])

  const hasMoreSection =
    sidebarScope === 'all_section' && displayedStaged.length + displayedReference.length < totalMatchingSection
  const remainingSectionCount = totalMatchingSection - (displayedStaged.length + displayedReference.length)

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

  // Filtrage des paragraphes dans la Table des Matières
  const filteredTocParagraphs = useMemo(() => {
    if (!paraTocFilter.trim()) return paragraphs
    const q = paraTocFilter.toLowerCase().trim()
    return paragraphs.filter((p) => p.id.toLowerCase().includes(q) || p.text.toLowerCase().includes(q))
  }, [paragraphs, paraTocFilter])

  // Rendu de la palette de paragraphes pour la section active dans la table des matières
  const renderParagraphPalette = () => {
    if (isParagraphsLoading) {
      return (
        <div className="my-1 flex items-center justify-center space-x-2 rounded-none border border-rule bg-paper-raised p-3 text-xs text-ink-muted">
          <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin text-accent" />
          <span>{t.work.loadingParagraphs}</span>
        </div>
      )
    }

    // The reading pane shows the alert and the retry; no empty list that would hide the failure.
    if (paragraphsQuery.isError) return <p className="py-1 text-[11px] text-danger">{t.work.paragraphsUnavailable}</p>

    if (paragraphs.length === 0) return null

    return (
      <div className="my-1.5 ml-1 space-y-1.5 rounded-none border border-rule bg-paper-raised p-2.5 shadow-2xs">
        <div className="flex items-center justify-between border-b border-rule pb-1 text-xs text-ink-muted">
          <span className="flex items-center space-x-1 text-[10px] font-semibold tracking-wider text-ink-muted uppercase">
            <ListChecks aria-hidden="true" className="h-3 w-3 text-accent" />
            <span>{t.annotate.paragraphsListTitle}</span>
          </span>
          <span className="text-[10px] font-medium text-ink-muted">
            {filteredTocParagraphs.length} / {paragraphs.length} §
          </span>
        </div>

        {/* Recherche / filtre rapide de paragraphe */}
        {paragraphs.length > 8 && (
          <div className="relative">
            <label htmlFor={paraFilterId} className="sr-only">
              {t.annotate.searchParagraphsPlaceholder}
            </label>
            <input
              id={paraFilterId}
              type="text"
              value={paraTocFilter}
              onChange={(e) => setParaTocFilter(e.target.value)}
              placeholder={t.annotate.searchParagraphsPlaceholder}
              className="w-full rounded-none border border-rule-strong bg-white py-1 pr-6 pl-6 text-[11px] text-ink placeholder:text-ink-subtle focus-visible:outline-2 focus-visible:outline-accent"
            />
            <Search aria-hidden="true" className="absolute top-2 left-1.5 h-3 w-3 text-ink-subtle" />
            {paraTocFilter && (
              <button
                type="button"
                aria-label={t.annotate.clearFilter}
                onClick={() => setParaTocFilter('')}
                className="absolute top-1 right-1 px-1 text-xs text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
              >
                <span aria-hidden="true">×</span>
              </button>
            )}
          </div>
        )}

        {/* Palette défilable de puces cliquables */}
        <div className="flex max-h-48 scrollbar-thin flex-wrap gap-1 overflow-y-auto pt-0.5 pr-0.5">
          {filteredTocParagraphs.map((p) => {
            const isParaActive = activeParagraphUri === p.uri
            const isParaHovered = !!hoveredConcept && (hoveredParagraphUris?.has(p.uri) ?? false)
            const isParaPinned = !!pinnedConcept && (pinnedParagraphUris?.has(p.uri) ?? false)
            const annotCount = paragraphAnnotCounts[p.uri] || 0
            const countTitle =
              annotCount > 0 ? ` (${fill(t.annotate.annotationCount, { count: String(annotCount) })})` : ''

            return (
              <button
                key={p.uri}
                type="button"
                aria-current={isParaActive ? 'true' : undefined}
                onClick={() => handleFocusParagraph(p.uri)}
                className={`inline-flex cursor-pointer items-center space-x-1 rounded-none border px-2 py-1 font-mono text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                  isParaActive
                    ? 'border-accent-strong bg-accent text-white underline underline-offset-2 shadow-xs'
                    : isParaHovered
                      ? CATEGORY_TOC_HOVER[activeInspectionCategory] || CATEGORY_TOC_HOVER.general
                      : isParaPinned
                        ? CATEGORY_TOC_PINNED[pinnedConceptCategory] || CATEGORY_TOC_PINNED.general
                        : annotCount > 0
                          ? 'border-amber-300 bg-amber-50 text-ink hover:bg-amber-100/70'
                          : 'border-rule-strong bg-white text-ink hover:bg-paper-sunken'
                }`}
                title={`§ ${p.id}${countTitle} - ${t.annotate.filterParagraphsHelp}`}
              >
                <span>§ {p.id}</span>
                {annotCount > 0 && !isParaActive && (
                  <span className="rounded-full bg-accent/15 px-1 py-0 font-sans text-[9px] font-semibold text-accent-strong">
                    {annotCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // Scope and status toggles: the pressed one is bold on a white chip (not colour alone).
  const toggleClass = (pressed: boolean) =>
    `rounded-none transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
      pressed ? 'bg-white font-bold text-ink shadow-xs' : 'text-ink-muted hover:text-ink'
    }`

  return (
    <div className="flex h-full flex-col space-y-3 pt-3 pb-4">
      {/* 1. Barre d'outils supérieure */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-none border border-rule bg-white p-3.5 shadow-xs">
        <div className="flex items-center space-x-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-none bg-accent text-white shadow-inner">
            <Highlighter aria-hidden="true" className="h-5 w-5" />
          </div>
          <div>
            <h1 className="flex items-center space-x-2 font-serif text-lg leading-tight font-bold text-ink sm:text-xl">
              <span>{t.annotate.title}</span>
            </h1>
            <p className="line-clamp-1 text-xs text-ink-muted">
              {currentWork ? `${currentWork.title} — ${currentWork.author}` : t.annotate.subtitle}
            </p>
          </div>
        </div>

        {/* Contrôles de lecture & actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Traduction */}
          <button
            type="button"
            aria-pressed={showTranslation}
            onClick={() => setShowTranslation(!showTranslation)}
            className={`inline-flex items-center space-x-1.5 rounded-none border px-3 py-1.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
              showTranslation
                ? 'border-rule-strong bg-paper-sunken font-bold text-ink underline underline-offset-2'
                : 'border-rule-strong bg-white font-medium text-ink-muted hover:bg-paper-raised'
            }`}
          >
            <Languages aria-hidden="true" className="h-3.5 w-3.5" />
            <span>{t.work.alignedTranslation}</span>
          </button>

          {/* Taille du texte */}
          <TextSizeToggle value={textSize} onChange={setTextSize} />

          {/* Export Turtle W3C */}
          <a
            href="/api/annotations/export-ttl"
            download
            className="inline-flex items-center space-x-1.5 rounded-none bg-accent px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            title={t.annotate.exportTtl}
          >
            <Download aria-hidden="true" className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t.annotate.exportRdf}</span>
          </a>

          {/* Bouton Légende des concepts & repères visuels */}
          <button
            type="button"
            onClick={() => setIsLegendOpen(true)}
            className="inline-flex cursor-pointer items-center space-x-1.5 rounded-none border border-rule-strong bg-white px-3 py-1.5 text-xs font-semibold text-accent-strong shadow-2xs transition-colors hover:bg-paper-raised focus-visible:outline-2 focus-visible:outline-accent"
            title={t.annotate.legendTitle}
          >
            <HelpCircle aria-hidden="true" className="h-3.5 w-3.5 text-accent" />
            <span>{t.annotate.legendBtn}</span>
          </button>
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

      {/* 2. Corps en 3 volets (TOC, Studio de Lecture, Panneau d'Annotations) */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-12">
        {/* VOLET GAUCHE : Table des matières (3 colonnes) */}
        <aside className="flex h-full flex-col overflow-hidden rounded-none border border-rule bg-white shadow-xs lg:col-span-3">
          <div className="shrink-0 space-y-2 border-b border-rule bg-paper-raised p-3.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center space-x-1.5 font-serif text-sm font-bold text-ink">
                <BookOpen aria-hidden="true" className="h-4 w-4 text-accent" />
                <span>{t.annotate.tocTitle}</span>
              </span>
              <span className="rounded-full bg-paper-sunken px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
                {paragraphs.length} §
              </span>
            </div>

            {/* Sélecteur d'auteur et d'œuvre */}
            <div className="space-y-1.5">
              <label htmlFor={authorSelectId} className="sr-only">
                {t.work.authorSelectLabel}
              </label>
              <select
                id={authorSelectId}
                value={selectedAuthor}
                onChange={(e) => handleAuthorChange(e.target.value)}
                className="w-full rounded-none border border-rule-strong bg-paper-raised p-1.5 text-xs text-ink focus-visible:outline-2 focus-visible:outline-accent"
              >
                <option value="">{t.work.allAuthors}</option>
                {authors.map((a) => (
                  <option key={a.name} value={a.name}>
                    {a.name}
                  </option>
                ))}
              </select>

              <label htmlFor={workSelectId} className="sr-only">
                {t.work.workSelectLabel}
              </label>
              <select
                id={workSelectId}
                value={selectedWorkUri}
                onChange={(e) => handleSelectWork(e.target.value)}
                className="w-full rounded-none border border-rule-strong bg-paper-raised p-1.5 text-xs font-medium text-ink focus-visible:outline-2 focus-visible:outline-accent"
              >
                {filteredWorks.map((w) => (
                  <option key={w.uri} value={w.uri}>
                    {w.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Champ de recherche dans la TOC */}
            <div className="relative">
              <label htmlFor={tocFilterId} className="sr-only">
                {t.annotate.filterToc}
              </label>
              <input
                id={tocFilterId}
                type="text"
                value={tocFilter}
                onChange={(e) => setTocFilter(e.target.value)}
                placeholder={t.annotate.filterToc}
                className="w-full rounded-none border border-rule-strong bg-white p-1.5 pl-7 text-[11px] text-ink placeholder:text-ink-subtle focus-visible:outline-2 focus-visible:outline-accent"
              />
              <Search aria-hidden="true" className="absolute top-2 left-2 h-3.5 w-3.5 text-ink-subtle" />
            </div>
          </div>

          {/* Arborescence défilable */}
          <div className="flex-1 scrollbar-thin space-y-1 overflow-y-auto p-2.5">
            {isSummaryLoading ? (
              <div className="flex flex-col items-center justify-center space-y-2 py-12 text-ink-muted">
                <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-accent" />
                <span className="text-xs">{t.common.loading}</span>
              </div>
            ) : summaryQuery.isError ? (
              <LoadError
                error={summaryQuery.error}
                onRetry={() => void summaryQuery.refetch()}
                isRetrying={summaryQuery.isFetching}
              />
            ) : filteredSummary.length === 0 ? (
              <p className="p-4 text-center text-xs text-ink-muted italic">{t.annotate.noSectionFound}</p>
            ) : (
              filteredSummary.map((book) => {
                const isCollapsed = collapsedNodes[book.uri] ?? false
                const hasChildren = book.children && book.children.length > 0
                const isBookActive = activeSectionUri === book.uri
                const isChildActive = hasChildren && book.children.some((child) => child.uri === activeSectionUri)

                return (
                  <div key={book.uri} className="space-y-0.5">
                    <button
                      type="button"
                      aria-current={isBookActive ? 'true' : undefined}
                      aria-expanded={hasChildren ? !isCollapsed : undefined}
                      onClick={() => {
                        if (hasChildren) {
                          toggleNodeCollapse(book.uri)
                          if (!isChildActive && book.children.length > 0) {
                            handleSelectSection(book.children[0].uri)
                          }
                        } else {
                          handleSelectSection(book.uri)
                        }
                      }}
                      className={`flex w-full items-center justify-between rounded-none p-2 text-left text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                        isBookActive
                          ? 'bg-accent font-bold text-white shadow-xs'
                          : isChildActive
                            ? 'border border-rule-strong bg-paper-sunken font-bold text-accent-strong'
                            : 'text-ink hover:bg-paper-sunken'
                      }`}
                    >
                      <span className="truncate pr-1">{book.title}</span>
                      <div className="flex shrink-0 items-center space-x-1">
                        {isBookActive && !hasChildren && (
                          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber-300 shadow-2xs" />
                        )}
                        {hasChildren &&
                          (isCollapsed ? (
                            <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 opacity-70" />
                          ) : (
                            <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 opacity-70" />
                          ))}
                      </div>
                    </button>

                    {/* Palette de paragraphes si livre sans enfants actif */}
                    {isBookActive && !hasChildren && renderParagraphPalette()}

                    {/* Feuilles / Chapitres */}
                    {hasChildren && !isCollapsed && (
                      <div className="my-1 ml-2 space-y-0.5 border-l-2 border-rule pl-3">
                        {book.children.map((child) => {
                          const isLeafActive = activeSectionUri === child.uri
                          return (
                            <div key={child.uri} className="space-y-0.5">
                              <button
                                type="button"
                                aria-current={isLeafActive ? 'true' : undefined}
                                onClick={() => handleSelectSection(child.uri)}
                                className={`flex w-full items-center justify-between rounded-none px-2.5 py-1.5 text-left text-xs transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                                  isLeafActive
                                    ? 'bg-accent font-bold text-white shadow-xs'
                                    : 'text-ink hover:bg-paper-sunken'
                                }`}
                              >
                                <span className="truncate">{child.title}</span>
                                {isLeafActive && (
                                  <span
                                    aria-hidden="true"
                                    className="ml-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300"
                                  />
                                )}
                              </button>

                              {/* Palette de paragraphes si chapitre feuille actif */}
                              {isLeafActive && renderParagraphPalette()}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </aside>

        {/* VOLET CENTRAL : Studio de Lecture & Surlignage (6 colonnes) */}
        <main className="flex h-full flex-col overflow-hidden rounded-none border border-rule bg-white shadow-xs lg:col-span-6">
          {/* En-tête du texte */}
          <div className="flex shrink-0 items-center justify-between border-b border-rule bg-paper-raised p-3.5 select-none">
            <div className="flex min-w-0 items-center space-x-2">
              <Feather aria-hidden="true" className="h-4 w-4 shrink-0 text-accent" />
              <span className="truncate font-serif text-sm font-bold text-ink sm:text-base">
                {t.annotate.readingStudio}
              </span>
            </div>
            <span className="hidden rounded-none border border-rule-strong bg-paper-sunken px-2.5 py-1 text-[11px] font-medium text-ink-muted sm:inline-block">
              {t.annotate.selectToAnnotate}
            </span>
          </div>

          {/* Zone de lecture défilable. The selection is read by ReadingParagraphCard, on the text. */}
          <div ref={readingContainerRef} className="flex-1 scrollbar-thin space-y-4 overflow-y-auto p-4 sm:p-5">
            {translationError ? (
              <LoadError
                error={translationError}
                onRetry={retryTranslation}
                tone="warning"
                isRetrying={translationQuery.isFetching || translationParagraphsQuery.isFetching}
              />
            ) : null}
            {worksQuery.isLoading || isSummaryLoading || isParagraphsLoading || isSectionDataLoading ? (
              <div className="flex flex-col items-center justify-center space-y-3 py-24">
                <Loader2 aria-hidden="true" className="h-8 w-8 animate-spin text-accent" />
                <span className="text-sm font-medium text-ink-muted">{t.annotate.loadingSection}</span>
              </div>
            ) : paragraphsQuery.isError ? (
              <LoadError
                error={paragraphsQuery.error}
                onRetry={() => void paragraphsQuery.refetch()}
                isRetrying={paragraphsQuery.isFetching}
              />
            ) : summaryQuery.isError ? (
              <LoadError
                error={summaryQuery.error}
                onRetry={() => void summaryQuery.refetch()}
                isRetrying={summaryQuery.isFetching}
              />
            ) : !selectedWorkUri && catalogueError ? null : paragraphs.length === 0 ? (
              <div className="space-y-2 py-24 text-center">
                <p className="text-sm text-ink-muted">{t.annotate.selectWorkFirst}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Bannière d'annotation épinglée */}
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
                    annotationCount={paragraphAnnotCounts[p.uri] || 0}
                    onActivate={() => setActiveParagraphUri(p.uri)}
                    onTextSelection={handleFreeTextSelection}
                  />
                ))}
              </div>
            )}
          </div>
        </main>

        {/* VOLET DROIT : Panneau des Annotations & Modération (3 colonnes) */}
        <aside className="flex h-full flex-col overflow-hidden rounded-none border border-rule bg-white shadow-xs lg:col-span-3">
          {/* En-tête & Filtres de statut */}
          <div className="shrink-0 space-y-2.5 border-b border-rule bg-paper-raised p-3.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center space-x-1.5 font-serif text-sm font-bold text-ink">
                <Sparkles aria-hidden="true" className="h-4 w-4 text-accent" />
                <span>{t.annotate.annotationsPanel}</span>
              </span>
              {/* The rejected list counts its own items; no count while the section failed (0 would lie). */}
              {!isRejectedTab && !sectionFailed && (
                <span className="rounded-full border border-rule bg-paper-sunken px-2 py-0.5 text-[11px] font-bold text-accent-strong">
                  {sidebarScope === 'active_paragraph'
                    ? displayedStaged.length + displayedReference.length
                    : totalSectionCount}
                </span>
              )}
            </div>

            {/* Bascule Portée : Paragraphe Actif vs Toute la section */}
            <fieldset
              aria-label={t.annotate.scopeGroupLabel}
              className="m-0 flex min-w-0 rounded-none bg-paper-sunken p-0.5 text-xs font-semibold"
            >
              <button
                type="button"
                aria-pressed={sidebarScope === 'active_paragraph'}
                onClick={() => {
                  setSidebarScope('active_paragraph')
                  setSectionPageSize(30)
                }}
                className={`flex-1 truncate px-2 py-1.5 text-center ${toggleClass(sidebarScope === 'active_paragraph')}`}
              >
                {t.annotate.activeParagraphTab} {activeParagraphObj?.id ? `(§ ${activeParagraphObj.id})` : ''}
              </button>
              <button
                type="button"
                aria-pressed={sidebarScope === 'all_section'}
                onClick={() => {
                  setSidebarScope('all_section')
                  setSectionPageSize(30)
                }}
                className={`flex-1 truncate px-2 py-1.5 text-center ${toggleClass(sidebarScope === 'all_section')}`}
              >
                {t.annotate.allSectionTab}
                {sectionFailed ? '' : ` (${totalSectionCount})`}
              </button>
            </fieldset>

            {/* Filtre recherche si en mode 'all_section' */}
            {sidebarScope === 'all_section' && (
              <div className="relative">
                <label htmlFor={annotSearchId} className="sr-only">
                  {t.annotate.searchAnnotations}
                </label>
                <input
                  id={annotSearchId}
                  type="text"
                  value={sidebarSearch}
                  onChange={(e) => {
                    setSidebarSearch(e.target.value)
                    setSectionPageSize(30)
                  }}
                  placeholder={t.annotate.searchAnnotations}
                  className="w-full rounded-none border border-rule-strong bg-white p-1.5 pl-7 text-[11px] text-ink placeholder:text-ink-subtle focus-visible:outline-2 focus-visible:outline-accent"
                />
                <Search aria-hidden="true" className="absolute top-2 left-2 h-3.5 w-3.5 text-ink-subtle" />
              </div>
            )}

            <PendingToggle />
            {savedNotice.visible && <PendingSavedNotice onDismiss={savedNotice.dismiss} />}

            {/* Onglets / Filtres par statut */}
            <fieldset
              aria-label={t.annotate.statusGroupLabel}
              className="m-0 grid min-w-0 grid-cols-5 gap-1 rounded-none bg-paper-sunken p-1 text-center text-[11px] font-semibold"
            >
              {(
                [
                  { key: 'all', label: t.annotate.filterAll },
                  { key: 'pending', label: t.annotate.filterPending },
                  { key: 'validated', label: t.annotate.filterValidated },
                  { key: 'rejected', label: t.annotate.filterRejected },
                  { key: 'reference', label: t.annotate.filterReference },
                ] as const
              ).map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={statusFilter === key}
                  onClick={() => {
                    setStatusFilter(key)
                    // RM-ACC-03: unreviewed items only come when the filter is on.
                    if (key === 'pending') setIncludePending(true)
                    setSectionPageSize(30)
                  }}
                  className={`truncate py-1 ${toggleClass(statusFilter === key)}`}
                >
                  {label}
                </button>
              ))}
            </fieldset>
          </div>

          {/* Liste défilable des annotations */}
          <div className="flex-1 scrollbar-thin space-y-3 overflow-y-auto p-3">
            {sectionFailed && !isRejectedTab && (
              <LoadError
                error={sectionQuery.error}
                onRetry={() => void sectionQuery.refetch()}
                isRetrying={sectionQuery.isFetching}
              />
            )}

            {/* Section 1 : Propositions Staging (selon filtre et pagination) */}
            {statusFilter !== 'reference' && displayedStaged.length > 0 && (
              <div className="space-y-2.5">
                {displayedStaged.map((item) => (
                  <StagedAnnotationCard
                    key={item.id}
                    annotation={item}
                    canPin={item.status !== 'rejected'}
                    isPinned={pinnedConcept === item.concept_uri}
                    isHighlighted={hoveredConcept === item.concept_uri}
                    onTogglePin={() =>
                      setPinnedConcept((prev) => (prev === item.concept_uri ? null : item.concept_uri))
                    }
                    onHoverChange={(hovered) => setHoveredConcept(hovered ? item.concept_uri : null)}
                  />
                ))}
              </div>
            )}

            {/* Section 2 : Annotations de Référence Corese (selon filtre et pagination) */}
            {(statusFilter === 'all' || statusFilter === 'reference') && displayedReference.length > 0 && (
              <div className="space-y-2">
                {displayedReference.map((item, i) => (
                  <ReferenceAnnotationCard
                    key={`ref-${item.concept}-${i}`}
                    label={item.label}
                    conceptUri={item.concept}
                    category={item.category}
                    collection={item.collection}
                    occurrences={item.occurrences}
                    isPinned={pinnedConcept === item.concept}
                    isHighlighted={hoveredConcept === item.concept}
                    onTogglePin={() => setPinnedConcept((prev) => (prev === item.concept ? null : item.concept))}
                    onHoverChange={(hovered) => setHoveredConcept(hovered ? item.concept : null)}
                  >
                    <span className="inline-flex items-center justify-center rounded-full border border-rule-strong bg-paper-sunken px-2 py-0.5 text-center text-[10px] leading-none font-bold text-ink-muted">
                      {t.annotate.statusReference}
                    </span>
                  </ReferenceAnnotationCard>
                ))}
              </div>
            )}

            {/* Bouton de pagination "Afficher plus" pour le mode section entière */}
            {hasMoreSection && (
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setSectionPageSize((prev) => prev + 30)}
                  className="w-full cursor-pointer rounded-none border border-rule-strong bg-paper-sunken px-3 py-2 text-xs font-semibold text-accent-strong shadow-2xs transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {t.annotate.loadMore.replace('{remaining}', remainingSectionCount.toString())}
                </button>
              </div>
            )}

            {needsParagraphForRejected && (
              <p className="p-4 text-center text-xs text-ink-muted italic">{t.annotate.pickParagraphForRejected}</p>
            )}
            {isRejectedTab && !needsParagraphForRejected && (
              <RejectedAnnotationList paragraphUri={activeParagraphUri} />
            )}

            {/* État vide si aucune annotation (jamais après un échec de chargement) */}
            {!isRejectedTab && !sectionFailed && displayedStaged.length === 0 && displayedReference.length === 0 && (
              <p className="p-4 text-center text-xs text-ink-muted italic">
                {sidebarScope === 'active_paragraph' ? t.annotate.noAnnotationsInPara : t.annotate.noAnnotationsFound}
              </p>
            )}
          </div>
        </aside>
      </div>

      {/* 3. Modal d'annotation sémantique interactive */}
      <AnnotationCreateDialog
        open={isAnnotModalOpen}
        onClose={() => setIsAnnotModalOpen(false)}
        paragraphUri={activeParagraphUri}
        targetText={modalTargetText}
        startOffset={modalStartOffset}
        endOffset={modalEndOffset}
        endParagraphUri={modalEndParaUri}
        targetParagraphs={modalTargetParas}
        targetParagraphDetails={modalTargetParaDetails}
        initialScopeType={modalScopeType}
        onSuccess={() => {
          void refetchSectionData()
          savedNotice.show()
        }}
      />

      {/* 4. Modal d'aide & Légende des annotations */}
      <AnnotationLegendModal isOpen={isLegendOpen} onClose={() => setIsLegendOpen(false)} />
    </div>
  )
}

export default CorpusAnnotation
