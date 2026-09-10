import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  fetchAuthors,
  fetchWorks,
  fetchSummary,
  fetchParagraphs,
  fetchTranslation,
  fetchSectionAnnotations,
  updateAnnotationStatus,
  deleteAnnotation
} from '../api/client'
import {
  SummaryNode,
  Paragraph,
  Work,
  StagedAnnotation,
  AnnotationMap,
  AnnotationScopeType,
  AnnotationStatus,
  TargetParagraphDetail,
  ConceptCategory
} from '../types'
import { AnnotationModal } from '../components/AnnotationModal'
import { AnnotationLegendModal } from '../components/AnnotationLegendModal'
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
  CATEGORY_PARA_PINNED,
  CATEGORY_PARA_HOVER,
  CATEGORY_TAG_PINNED,
  CATEGORY_TAG_HOVER,
  CATEGORY_BADGE_PINNED,
  CATEGORY_BADGE_HOVER,
  CATEGORY_TOC_PINNED,
  CATEGORY_TOC_HOVER
} from '../components/ConceptCategoryBadge'
import {
  ReadingParagraphCard,
  PinnedConceptBanner,
  useConceptInspection
} from '../components/reading'
import { useI18n } from '../i18n'
import {
  BookOpen,
  ChevronRight,
  ChevronDown,
  Sparkles,
  CheckCircle2,
  XCircle,
  X,
  Trash2,
  Download,
  Feather,
  Tag,
  Search,
  Filter,
  Layers,
  FileText,
  Loader2,
  ExternalLink,
  PlusCircle,
  Check,
  AlignLeft,
  ListChecks,
  Highlighter,
  HelpCircle
} from 'lucide-react'

type StatusFilter = 'all' | 'pending' | 'validated' | 'rejected' | 'reference'

export const CorpusAnnotation: React.FC = () => {
  const { t, language } = useI18n()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  // Sélection d'œuvre et navigation
  const [selectedAuthor, setSelectedAuthor] = useState<string>('')
  const [selectedWorkUri, setSelectedWorkUri] = useState<string>('')
  const [activeSectionUri, setActiveSectionUri] = useState<string>('')
  const [activeParagraphUri, setActiveParagraphUri] = useState<string>('')
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
  const { data: allWorks = [], isLoading: isAllWorksLoading } = useQuery({
    queryKey: ['allWorks'],
    queryFn: fetchWorks,
  })

  const { data: authors = [], isLoading: isAuthorsLoading } = useQuery({
    queryKey: ['authors'],
    queryFn: fetchAuthors,
  })

  // Synchronisation avec l'URL au chargement initial
  useEffect(() => {
    const urlUri = searchParams.get('uri')
    if (urlUri && allWorks.length > 0 && !selectedWorkUri) {
      const matched = allWorks.find((w) => w.uri === urlUri)
      if (matched) {
        setSelectedWorkUri(matched.uri)
        if (matched.author) setSelectedAuthor(matched.author)
      }
    } else if (!selectedWorkUri && allWorks.length > 0) {
      // Sélection par défaut de la première œuvre (Pline l'Ancien si disponible)
      const defaultWork =
        allWorks.find((w) => w.title.toLowerCase().includes('historia naturalis') || w.author.toLowerCase().includes('pline')) ||
        allWorks[0]
      if (defaultWork) {
        setSelectedWorkUri(defaultWork.uri)
        if (defaultWork.author) setSelectedAuthor(defaultWork.author)
      }
    }
  }, [allWorks, searchParams, selectedWorkUri])

  // Filtrage des œuvres par auteur
  const filteredWorks = useMemo(() => {
    if (!selectedAuthor) return allWorks
    return allWorks.filter((w) => w.author === selectedAuthor)
  }, [allWorks, selectedAuthor])

  // Œuvre active
  const currentWork = useMemo(() => {
    return allWorks.find((w) => w.uri === selectedWorkUri)
  }, [allWorks, selectedWorkUri])

  // 2. Sommaire / Arborescence de l'œuvre
  const { data: summary = [], isLoading: isSummaryLoading } = useQuery({
    queryKey: ['summary', selectedWorkUri],
    queryFn: () => fetchSummary(selectedWorkUri),
    enabled: !!selectedWorkUri,
  })

  // Sélection automatique de la première section feuille
  useEffect(() => {
    if (summary.length > 0 && !activeSectionUri) {
      const firstLeaf = summary[0]?.children?.[0]?.uri || summary[0]?.uri
      if (firstLeaf) {
        setActiveSectionUri(firstLeaf)
      }
    }
  }, [summary, activeSectionUri])

  // 3. Paragraphes de la section active
  const { data: paragraphs = [], isLoading: isParagraphsLoading } = useQuery({
    queryKey: ['paragraphs', activeSectionUri],
    queryFn: () => fetchParagraphs(activeSectionUri),
    enabled: !!activeSectionUri,
  })

  // 4. Traduction anglaise
  const { data: translationInfo } = useQuery({
    queryKey: ['translation', selectedWorkUri],
    queryFn: () => fetchTranslation(selectedWorkUri),
    enabled: !!selectedWorkUri,
  })

  const { data: translationParagraphs = [] } = useQuery({
    queryKey: ['translationParagraphs', translationInfo?.uri],
    queryFn: () => fetchParagraphs(translationInfo?.uri || ''),
    enabled: !!translationInfo?.uri && showTranslation,
  })

  // 5. Annotations groupées de la section (Corese + Staging)
  const {
    data: sectionData,
    isLoading: isSectionDataLoading,
    refetch: refetchSectionData
  } = useQuery({
    queryKey: ['sectionAnnotations', activeSectionUri, language],
    queryFn: () => fetchSectionAnnotations(activeSectionUri, language),
    enabled: !!activeSectionUri,
  })

  const referenceAnnotations = sectionData?.reference_annotations || {}
  const stagedAnnotations = sectionData?.staged_annotations || []

  // Sélection automatique du premier paragraphe si la section change ou si non défini
  useEffect(() => {
    if (paragraphs.length > 0) {
      const exists = paragraphs.some((p) => p.uri === activeParagraphUri)
      if (!exists) {
        setActiveParagraphUri(paragraphs[0].uri)
      }
    } else {
      setActiveParagraphUri('')
    }
  }, [paragraphs, activeParagraphUri])

  const handleSelectSection = (uri: string) => {
    if (uri !== activeSectionUri) {
      setActiveSectionUri(uri)
      setActiveParagraphUri('')
      if (readingContainerRef.current) {
        readingContainerRef.current.scrollTop = 0
      }
    }
  }

  // Mutation de modération / validation du statut d'une annotation
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: AnnotationStatus }) =>
      updateAnnotationStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sectionAnnotations'] })
      queryClient.invalidateQueries({ queryKey: ['stagedAnnotations'] })
    }
  })

  // Mutation de suppression d'une annotation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteAnnotation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sectionAnnotations'] })
      queryClient.invalidateQueries({ queryKey: ['stagedAnnotations'] })
    }
  })

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
          child.title.toLowerCase().includes(filterLower)
        )
        if (bookMatches || matchingChildren.length > 0) {
          return {
            ...book,
            children: matchingChildren.length > 0 ? matchingChildren : book.children
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

  // Filtrage des annotations affichées dans la colonne 3
  const filteredStagedAnnotations = useMemo(() => {
    return stagedAnnotations.filter((item) => {
      if (statusFilter === 'all') return true
      if (statusFilter === 'pending') return item.status === 'En attente de validation'
      if (statusFilter === 'validated') return item.status === 'Validé'
      if (statusFilter === 'rejected') return item.status === 'Rejeté'
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
      occurrences: item.offset?.length || 1
    }))
  }, [referenceAnnotations, activeParagraphUri])

  // Aplatissement des annotations Corese pour affichage global (si mode 'all_section')
  const flatReferenceAnnotations = useMemo(() => {
    const list: Array<{
      paragraph_uri: string;
      label: string;
      concept: string;
      category?: string;
      collection?: string | null;
      type: string;
      occurrences: number;
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
          occurrences: item.offset?.length || 1
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
      (s) => s.concept_label.toLowerCase().includes(q) || s.target_text.toLowerCase().includes(q)
    )
  }, [filteredStagedAnnotations, sidebarSearch])

  const searchedSectionReference = useMemo(() => {
    if (!sidebarSearch.trim()) return flatReferenceAnnotations
    const q = sidebarSearch.toLowerCase().trim()
    return flatReferenceAnnotations.filter(
      (r) => r.label.toLowerCase().includes(q) || r.concept.toLowerCase().includes(q)
    )
  }, [flatReferenceAnnotations, sidebarSearch])

  // Éléments effectivement affichés selon le scope et la pagination
  const displayedStaged = useMemo(() => {
    if (sidebarScope === 'active_paragraph') return activeStagedAnnotations
    return searchedSectionStaged.slice(0, sectionPageSize)
  }, [sidebarScope, activeStagedAnnotations, searchedSectionStaged, sectionPageSize])

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
  }, [sidebarScope, activeReferenceAnnotations, statusFilter, searchedSectionReference, sectionPageSize, displayedStaged.length])

  const totalMatchingSection = useMemo(() => {
    const stagedCount = searchedSectionStaged.length
    const refCount = (statusFilter === 'all' || statusFilter === 'reference') ? searchedSectionReference.length : 0
    return stagedCount + refCount
  }, [searchedSectionStaged.length, searchedSectionReference.length, statusFilter])

  const hasMoreSection = sidebarScope === 'all_section' && (displayedStaged.length + displayedReference.length < totalMatchingSection)
  const remainingSectionCount = totalMatchingSection - (displayedStaged.length + displayedReference.length)

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

  // Filtrage des paragraphes dans la Table des Matières
  const filteredTocParagraphs = useMemo(() => {
    if (!paraTocFilter.trim()) return paragraphs
    const q = paraTocFilter.toLowerCase().trim()
    return paragraphs.filter(
      (p) => p.id.toLowerCase().includes(q) || p.text.toLowerCase().includes(q)
    )
  }, [paragraphs, paraTocFilter])

  // Rendu de la palette de paragraphes pour la section active dans la table des matières
  const renderParagraphPalette = () => {
    if (isParagraphsLoading) {
      return (
        <div className="p-3 bg-[#fdfcf9] rounded-none border border-[#ede5d8] my-1 flex items-center justify-center space-x-2 text-xs text-[#8c8275]">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#9A6530]" />
          <span>{t.work.loadingParagraphs}</span>
        </div>
      )
    }

    if (paragraphs.length === 0) return null

    return (
      <div className="p-2.5 bg-[#fdfcf9] rounded-none border border-[#ede5d8] my-1.5 ml-1 space-y-1.5 shadow-2xs">
        <div className="flex items-center justify-between pb-1 border-b border-[#f0eae0] text-xs text-[#8c8275]">
          <span className="font-semibold uppercase tracking-wider text-[10px] text-[#63503d] flex items-center space-x-1">
            <ListChecks className="w-3 h-3 text-[#9A6530]" />
            <span>{t.annotate.paragraphsListTitle}</span>
          </span>
          <span className="text-[10px] font-medium text-[#7a6f62]">
            {filteredTocParagraphs.length} / {paragraphs.length} §
          </span>
        </div>

        {/* Recherche / filtre rapide de paragraphe */}
        {paragraphs.length > 8 && (
          <div className="relative">
            <input
              type="text"
              value={paraTocFilter}
              onChange={(e) => setParaTocFilter(e.target.value)}
              placeholder={t.annotate.searchParagraphsPlaceholder}
              className="w-full py-1 pl-6 pr-5 text-[11px] rounded-none border border-[#e3dacb] bg-white text-[#2c2724] focus:outline-none focus:ring-1 focus:ring-[#9A6530]"
            />
            <Search className="w-3 h-3 text-[#8c8275] absolute left-1.5 top-2" />
            {paraTocFilter && (
              <button
                type="button"
                onClick={() => setParaTocFilter('')}
                className="absolute right-1.5 top-1 text-[#8c8275] hover:text-[#2c2724] text-[10px] p-0.5"
              >
                ×
              </button>
            )}
          </div>
        )}

        {/* Palette défilable de puces cliquables */}
        <div className="flex flex-wrap gap-1 max-h-48 overflow-y-auto scrollbar-thin pr-0.5 pt-0.5">
          {filteredTocParagraphs.map((p) => {
            const isParaActive = activeParagraphUri === p.uri
            const isHovering = hoveredConcept !== null
            const hasInspectedP = activeInspectionConcept !== null && activeInspectionParagraphUris.has(p.uri)
            const isParaHovered = isHovering && hasInspectedP
            const isParaPinned = !isHovering && !!pinnedConcept && hasInspectedP
            const annotCount = paragraphAnnotCounts[p.uri] || 0

            return (
              <button
                key={p.uri}
                type="button"
                onClick={() => handleFocusParagraph(p.uri)}
                className={`px-2 py-1 rounded-none text-xs font-mono font-bold transition-all cursor-pointer border inline-flex items-center space-x-1 ${
                  isParaActive
                    ? 'bg-[#9A6530] text-white border-[#855424] shadow-xs ring-1 ring-[#9A6530]/40'
                    : isParaPinned
                      ? (CATEGORY_TOC_PINNED[activeInspectionCategory] || CATEGORY_TOC_PINNED.general)
                      : isParaHovered
                        ? (CATEGORY_TOC_HOVER[activeInspectionCategory] || CATEGORY_TOC_HOVER.general)
                        : annotCount > 0
                          ? 'bg-amber-50 text-[#543b22] border-amber-200/90 hover:bg-amber-100/70 hover:border-amber-300'
                          : 'bg-white text-[#543b22] border-[#ded5c6] hover:bg-[#f4ede2] hover:border-[#9A6530]/50'
                }`}
                title={`§ ${p.id}${annotCount > 0 ? ` (${annotCount} annot${annotCount > 1 ? 's' : ''})` : ''} - ${t.annotate.filterParagraphsHelp}`}
              >
                <span>§ {p.id}</span>
                {annotCount > 0 && !isParaActive && (
                  <span className="text-[9px] font-sans font-semibold px-1 py-0 rounded-full bg-[#9A6530]/15 text-[#6e461f]">
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

  return (
    <div className="h-full flex flex-col pt-3 pb-4 space-y-3">
      
      {/* 1. Barre d'outils supérieure */}
      <header className="bg-white/95 rounded-none border border-[#e6dfd1] p-3.5 shadow-xs flex flex-wrap items-center justify-between gap-3 shrink-0">
        
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-none bg-[#9A6530] text-white flex items-center justify-center shadow-inner shrink-0">
            <Highlighter className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-serif font-bold text-lg sm:text-xl text-[#2c2724] leading-tight flex items-center space-x-2">
              <span>{t.annotate.title}</span>
            </h1>
            <p className="text-xs text-[#736a5f] line-clamp-1">
              {currentWork ? `${currentWork.title} — ${currentWork.author}` : t.annotate.subtitle}
            </p>
          </div>
        </div>

        {/* Contrôles de lecture & actions */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Traduction */}
          <button
            type="button"
            onClick={() => setShowTranslation(!showTranslation)}
            className={`px-3 py-1.5 rounded-none border text-xs font-medium transition-all ${
              showTranslation
                ? 'bg-[#f4ede2] border-[#ded4c5] text-[#2c2724]'
                : 'bg-white border-[#e6dfd1] text-[#736a5f] hover:bg-[#faf8f5]'
            }`}
          >
            {showTranslation ? 'Traduction activée' : 'Traduction masquée'}
          </button>

          {/* Taille du texte */}
          <div className="flex items-center bg-[#f4ede2] p-0.5 rounded-none border border-[#ded4c5] text-xs">
            <button
              type="button"
              onClick={() => setTextSize('normal')}
              className={`px-2 py-1 rounded-none ${textSize === 'normal' ? 'bg-white font-bold shadow-2xs' : 'text-[#736a5f]'}`}
            >
              A
            </button>
            <button
              type="button"
              onClick={() => setTextSize('large')}
              className={`px-2 py-1 rounded-none ${textSize === 'large' ? 'bg-white font-bold shadow-2xs text-sm' : 'text-[#736a5f]'}`}
            >
              A+
            </button>
            <button
              type="button"
              onClick={() => setTextSize('xlarge')}
              className={`px-2 py-1 rounded-none ${textSize === 'xlarge' ? 'bg-white font-bold shadow-2xs text-base' : 'text-[#736a5f]'}`}
            >
              A++
            </button>
          </div>

          {/* Export Turtle W3C */}
          <a
            href="/api/annotations/export-ttl"
            download
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-[#9A6530] hover:bg-[#855424] text-white rounded-none text-xs font-semibold shadow-xs transition-all"
            title={t.annotate.exportTtl}
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export RDF</span>
          </a>

          {/* Bouton Légende des concepts & repères visuels */}
          <button
            type="button"
            onClick={() => setIsLegendOpen(true)}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white hover:bg-[#faf8f5] text-[#6d4c24] hover:text-[#2c2724] rounded-none border border-[#ded4c5] text-xs font-semibold shadow-2xs transition-all cursor-pointer"
            title={t.annotate.legendTitle}
          >
            <HelpCircle className="w-3.5 h-3.5 text-[#9A6530]" />
            <span>{t.annotate.legendBtn}</span>
          </button>
        </div>

      </header>

      {/* 2. Corps en 3 volets (TOC, Studio de Lecture, Panneau d'Annotations) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-0 overflow-hidden">
        
        {/* VOLET GAUCHE : Table des matières (3 colonnes) */}
        <aside className="lg:col-span-3 h-full bg-white/95 rounded-none border border-[#e6dfd1] shadow-xs flex flex-col overflow-hidden">
          
          <div className="p-3.5 border-b border-[#f0eae0] bg-[#faf8f4] space-y-2 shrink-0">
            <div className="flex items-center justify-between">
              <span className="font-serif font-bold text-sm text-[#2c2724] flex items-center space-x-1.5">
                <BookOpen className="w-4 h-4 text-[#9A6530]" />
                <span>{t.annotate.tocTitle}</span>
              </span>
              <span className="text-[11px] font-semibold text-[#8c8275] bg-[#f0eae0] px-2 py-0.5 rounded-full">
                {paragraphs.length} §
              </span>
            </div>

            {/* Sélecteur d'auteur et d'œuvre */}
            <div className="space-y-1.5">
              <select
                value={selectedAuthor}
                onChange={(e) => {
                  const auth = e.target.value
                  setSelectedAuthor(auth)
                  const wList = auth ? allWorks.filter((w) => w.author === auth) : allWorks
                  if (wList.length > 0) {
                    setSelectedWorkUri(wList[0].uri)
                    setActiveSectionUri('')
                    setActiveParagraphUri('')
                  }
                }}
                className="w-full p-1.5 text-xs rounded-lg border border-[#cfc5b4] bg-[#faf9f6] text-[#2c2724] focus:ring-1 focus:ring-[#9A6530] focus:outline-none"
              >
                <option value="">Tous les auteurs</option>
                {authors.map((a) => (
                  <option key={a.name} value={a.name}>
                    {a.name}
                  </option>
                ))}
              </select>

              <select
                value={selectedWorkUri}
                onChange={(e) => {
                  setSelectedWorkUri(e.target.value)
                  setActiveSectionUri('')
                  setActiveParagraphUri('')
                  setSearchParams({ uri: e.target.value })
                }}
                className="w-full p-1.5 text-xs rounded-lg border border-[#cfc5b4] bg-[#faf9f6] text-[#2c2724] font-medium focus:ring-1 focus:ring-[#9A6530] focus:outline-none"
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
              <input
                type="text"
                value={tocFilter}
                onChange={(e) => setTocFilter(e.target.value)}
                placeholder={t.annotate.filterToc}
                className="w-full p-1.5 pl-7 text-[11px] rounded-none border border-[#ded5c6] bg-white text-[#2c2724] focus:outline-none focus:ring-1 focus:ring-[#9A6530]"
              />
              <Search className="w-3.5 h-3.5 text-[#8c8275] absolute left-2 top-2" />
            </div>
          </div>

          {/* Arborescence défilable */}
          <div className="flex-1 overflow-y-auto p-2.5 space-y-1 scrollbar-thin">
            {isSummaryLoading ? (
              <div className="py-12 flex flex-col items-center justify-center space-y-2 text-[#736a5f]">
                <Loader2 className="w-5 h-5 text-[#9A6530] animate-spin" />
                <span className="text-xs">{t.common.loading}</span>
              </div>
            ) : filteredSummary.length === 0 ? (
              <p className="text-xs text-[#8c8275] italic p-4 text-center">Aucune section trouvée.</p>
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
                      className={`w-full text-left p-2 rounded-none text-xs font-semibold flex items-center justify-between transition-all ${
                        isBookActive
                          ? 'bg-[#9A6530] text-white font-bold shadow-xs'
                          : isChildActive
                            ? 'bg-[#f4ede1] text-[#855424] font-bold border border-[#ded4c5]'
                            : 'text-[#38322b] hover:bg-[#f4ede1]'
                      }`}
                    >
                      <span className="truncate pr-1">{book.title}</span>
                      <div className="flex items-center space-x-1 shrink-0">
                        {isBookActive && !hasChildren && (
                          <span className="w-2 h-2 rounded-full bg-amber-300 shadow-2xs" />
                        )}
                        {hasChildren && (
                          isCollapsed ? <ChevronRight className="w-3.5 h-3.5 opacity-70" /> : <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                        )}
                      </div>
                    </button>

                    {/* Palette de paragraphes si livre sans enfants actif */}
                    {isBookActive && !hasChildren && renderParagraphPalette()}

                    {/* Feuilles / Chapitres */}
                    {hasChildren && !isCollapsed && (
                      <div className="pl-3 border-l-2 border-[#eee5d6] ml-2 space-y-0.5 my-1">
                        {book.children.map((child) => {
                          const isLeafActive = activeSectionUri === child.uri
                          return (
                            <div key={child.uri} className="space-y-0.5">
                              <button
                                type="button"
                                onClick={() => handleSelectSection(child.uri)}
                                className={`w-full text-left px-2.5 py-1.5 rounded-none text-xs transition-all flex items-center justify-between ${
                                  isLeafActive
                                    ? 'bg-[#9A6530] text-white font-bold shadow-xs'
                                    : 'text-[#595248] hover:bg-[#f4ede1] hover:text-[#2c2724]'
                                }`}
                              >
                                <span className="truncate">{child.title}</span>
                                {isLeafActive && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-300 shrink-0 ml-1" />
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
        <main className="lg:col-span-6 h-full bg-white/95 rounded-none border border-[#e6dfd1] shadow-xs flex flex-col overflow-hidden">
          
          {/* En-tête du texte */}
          <div className="p-3.5 border-b border-[#f0eae0] bg-[#faf8f4] flex items-center justify-between shrink-0 select-none">
            <div className="flex items-center space-x-2 min-w-0">
              <Feather className="w-4 h-4 text-[#9A6530] shrink-0" />
              <span className="font-serif font-bold text-sm sm:text-base text-[#2c2724] truncate">
                {t.annotate.readingStudio}
              </span>
            </div>
            <span className="text-[11px] text-[#736a5f] bg-[#f4ede2] px-2.5 py-1 rounded-none border border-[#ded4c5] font-medium hidden sm:inline-block">
              Surlignez du texte pour annoter
            </span>
          </div>

          {/* Zone de lecture défilable */}
          <div
            ref={readingContainerRef}
            className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 scrollbar-thin"
            onMouseUp={() => handleFreeTextSelection()}
          >
            {isParagraphsLoading || isSectionDataLoading ? (
              <div className="py-24 flex flex-col items-center justify-center space-y-3">
                <Loader2 className="w-8 h-8 text-[#9A6530] animate-spin" />
                <span className="text-sm font-medium text-[#736a5f]">{t.annotate.loadingSection}</span>
              </div>
            ) : paragraphs.length === 0 ? (
              <div className="py-24 text-center space-y-2">
                <p className="text-sm text-[#736a5f]">{t.annotate.selectWorkFirst}</p>
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
                    idx={idx}
                    isCurrentPara={activeParagraphUri === p.uri}
                    referenceMap={referenceAnnotations[p.uri]}
                    stagedList={stagedAnnotations}
                    inspectionState={inspectionState}
                    textSize={textSize}
                    showTranslation={showTranslation}
                    translationP={translationParagraphs[idx]}
                    annotationCount={paragraphAnnotCounts[p.uri] || 0}
                    onClick={() => setActiveParagraphUri(p.uri)}
                    onTextSelection={handleFreeTextSelection}
                    translationTagText="Traduction :"
                    associatedTagText={t.annotate.associatedPassage}
                    pinnedTagText={t.annotate.pinnedPassage}
                    activeParagraphText={t.work.activeParagraph}
                  />
                ))}
              </div>
            )}
          </div>

        </main>

        {/* VOLET DROIT : Panneau des Annotations & Modération (3 colonnes) */}
        <aside className="lg:col-span-3 h-full bg-white/95 rounded-none border border-[#e6dfd1] shadow-xs flex flex-col overflow-hidden">
          
          {/* En-tête & Filtres de statut */}
          <div className="p-3.5 border-b border-[#f0eae0] bg-[#faf8f4] space-y-2.5 shrink-0">
            <div className="flex items-center justify-between">
              <span className="font-serif font-bold text-sm text-[#2c2724] flex items-center space-x-1.5">
                <Sparkles className="w-4 h-4 text-[#9A6530]" />
                <span>{t.annotate.annotationsPanel}</span>
              </span>
              <span className="text-[11px] font-bold text-[#9A6530] bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
                {sidebarScope === 'active_paragraph' ? (displayedStaged.length + displayedReference.length) : totalSectionCount}
              </span>
            </div>

            {/* Bascule Portée : Paragraphe Actif vs Toute la section */}
            <div className="flex bg-[#f4ede2] p-0.5 rounded-none text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setSidebarScope('active_paragraph')
                  setSectionPageSize(30)
                }}
                className={`flex-1 py-1.5 px-2 rounded-none text-center transition-all truncate ${
                  sidebarScope === 'active_paragraph'
                    ? 'bg-white text-[#2c2724] shadow-xs font-bold'
                    : 'text-[#696156] hover:text-[#2c2724]'
                }`}
              >
                {t.annotate.activeParagraphTab} {activeParagraphObj?.id ? `(§ ${activeParagraphObj.id})` : ''}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSidebarScope('all_section')
                  setSectionPageSize(30)
                }}
                className={`flex-1 py-1.5 px-2 rounded-none text-center transition-all truncate ${
                  sidebarScope === 'all_section'
                    ? 'bg-white text-[#2c2724] shadow-xs font-bold'
                    : 'text-[#696156] hover:text-[#2c2724]'
                }`}
              >
                {t.annotate.allSectionTab} ({totalSectionCount})
              </button>
            </div>

            {/* Filtre recherche si en mode 'all_section' */}
            {sidebarScope === 'all_section' && (
              <div className="relative">
                <input
                  type="text"
                  value={sidebarSearch}
                  onChange={(e) => {
                    setSidebarSearch(e.target.value)
                    setSectionPageSize(30)
                  }}
                  placeholder={t.annotate.searchAnnotations}
                  className="w-full p-1.5 pl-7 text-[11px] rounded-none border border-[#ded5c6] bg-white text-[#2c2724] focus:outline-none focus:ring-1 focus:ring-[#9A6530]"
                />
                <Search className="w-3.5 h-3.5 text-[#8c8275] absolute left-2 top-2" />
              </div>
            )}

            {/* Onglets / Filtres par statut */}
            <div className="grid grid-cols-5 gap-1 bg-[#f4ede2] p-1 rounded-none text-[11px] font-semibold text-center">
              {(
                [
                  { key: 'all', label: t.annotate.filterAll },
                  { key: 'pending', label: t.annotate.filterPending },
                  { key: 'validated', label: t.annotate.filterValidated },
                  { key: 'rejected', label: t.annotate.filterRejected },
                  { key: 'reference', label: t.annotate.filterReference }
                ] as const
              ).map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setStatusFilter(key)
                    setSectionPageSize(30)
                  }}
                  className={`py-1 rounded-none transition-all truncate ${
                    statusFilter === key
                      ? 'bg-white text-[#2c2724] shadow-xs font-bold'
                      : 'text-[#696156] hover:text-[#2c2724]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Liste défilable des annotations */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
            
            {/* Section 1 : Propositions Staging (selon filtre et pagination) */}
            {statusFilter !== 'reference' && displayedStaged.length > 0 && (
              <div className="space-y-2.5">
                {displayedStaged.map((item) => {
                  const isPinned = pinnedConcept === item.concept_uri
                  const isHovered = hoveredConcept === item.concept_uri
                  const isPending = item.status === 'En attente de validation'
                  const isValidated = item.status === 'Validé'
                  const isRejected = item.status === 'Rejeté'

                  return (
                    <div
                      key={item.id}
                      onMouseEnter={() => setHoveredConcept(item.concept_uri)}
                      onMouseLeave={() => setHoveredConcept(null)}
                      onClick={() => setPinnedConcept((prev) => (prev === item.concept_uri ? null : item.concept_uri))}
                      title={isPinned ? t.annotate.unpinAnnotationTooltip : t.annotate.pinAnnotationTooltip}
                      className={`p-3 rounded-none border text-xs space-y-2 transition-all cursor-pointer ${
                        isPinned
                          ? 'ring-2 ring-amber-500 border-amber-400 bg-amber-50/80 shadow-xs'
                          : isHovered
                            ? 'ring-2 ring-[#9A6530] shadow-sm'
                            : ''
                      } ${
                        isValidated
                          ? 'border-emerald-200 bg-emerald-50/60'
                          : isRejected
                            ? 'border-rose-200 bg-rose-50/50'
                            : 'border-amber-200 bg-amber-50/50'
                      }`}
                    >
                      {/* Concept & Badge Statut */}
                      <div className="space-y-1.5">
                        <div className="flex items-start space-x-1.5 min-w-0">
                          <ConceptCategoryIcon
                            label={item.concept_label}
                            uri={item.concept_uri}
                            className="w-4 h-4 shrink-0"
                          />
                          <strong className="font-semibold text-sm capitalize min-w-0 flex-1 whitespace-normal break-words leading-snug overflow-visible text-[#2c2724]">
                            {item.concept_label}
                          </strong>
                          {isPinned && <span className="text-xs shrink-0" title="Annotation épinglée">📌</span>}
                        </div>
                        <div className="flex justify-end">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              isValidated
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : isRejected
                                  ? 'bg-rose-100 text-rose-800 border-rose-300'
                                  : 'bg-amber-100 text-amber-800 border-amber-300'
                            }`}
                          >
                            {item.status}
                          </span>
                        </div>
                      </div>

                      {/* Granularité et extrait */}
                      <div className="space-y-1">
                        <div className="flex items-center space-x-1.5 text-[10px] text-[#736a5f]">
                          <span className="font-semibold uppercase bg-white/80 px-1.5 py-0.5 rounded-none border border-[#ded5c6]">
                            {item.scope_type}
                          </span>
                          <span>pos. {item.start_offset}-{item.end_offset}</span>
                        </div>
                        <p className="italic text-[#3b2e21] ancient-text text-xs line-clamp-2">
                          « {item.target_text} »
                        </p>
                      </div>

                      {/* Zone de Justification de l'annotateur */}
                      {item.justification && (
                        <div className="p-2 bg-white/90 rounded-none border border-[#e6dfd1] text-[11px] text-[#595248] space-y-0.5">
                          <span className="font-semibold text-[#9A6530] text-[10px] uppercase flex items-center space-x-1">
                            <FileText className="w-3 h-3" />
                            <span>{t.annotate.justificationTitle}</span>
                          </span>
                          <p className="italic">{item.justification}</p>
                        </div>
                      )}

                      {/* Métadonnées & actions de modération */}
                      <div className="pt-2 border-t border-black/5 flex items-center justify-between text-[11px]">
                        <span className="text-[#8c8275] text-[10px]">
                          {item.annotator_name}
                        </span>

                        <div className="flex items-center space-x-1">
                          {/* Bouton Valider */}
                          {item.status !== 'Validé' && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                updateStatusMutation.mutate({ id: item.id, status: 'Validé' })
                              }}
                              className="p-1 text-emerald-700 hover:bg-emerald-100 rounded-none transition-colors"
                              title={t.annotate.validateAction}
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          )}

                          {/* Bouton Rejeter */}
                          {item.status !== 'Rejeté' && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                updateStatusMutation.mutate({ id: item.id, status: 'Rejeté' })
                              }}
                              className="p-1 text-rose-700 hover:bg-rose-100 rounded-none transition-colors"
                              title={t.annotate.rejectAction}
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          )}

                          {/* Bouton Supprimer */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              deleteMutation.mutate(item.id)
                            }}
                            className="p-1 text-[#8c8275] hover:text-red-700 rounded-none transition-colors"
                            title={t.annotate.deleteAction}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Section 2 : Annotations de Référence Corese (selon filtre et pagination) */}
            {(statusFilter === 'all' || statusFilter === 'reference') && displayedReference.length > 0 && (
              <div className="space-y-2">
                {displayedReference.map((item, i) => {
                  const isPinned = pinnedConcept === item.concept
                  const isHovered = hoveredConcept === item.concept

                  return (
                    <div
                      key={`ref-${item.concept}-${i}`}
                      onMouseEnter={() => setHoveredConcept(item.concept)}
                      onMouseLeave={() => setHoveredConcept(null)}
                      onClick={() => setPinnedConcept((prev) => (prev === item.concept ? null : item.concept))}
                      title={isPinned ? t.annotate.unpinAnnotationTooltip : t.annotate.pinAnnotationTooltip}
                      className={`p-3 rounded-none border text-xs transition-all cursor-pointer ${
                        isPinned
                          ? 'border-[#9A6530] bg-[#fdf7ee] ring-2 ring-amber-500 shadow-sm'
                          : isHovered
                            ? 'border-[#9A6530] bg-[#fdfaf5] ring-2 ring-[#9A6530] shadow-sm'
                            : 'border-[#ded5c6] bg-[#faf8f4] hover:bg-white'
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-start space-x-1.5 min-w-0">
                          <ConceptCategoryIcon
                            label={item.label}
                            uri={item.concept}
                            category={item.category as any}
                            className="w-3.5 h-3.5 shrink-0"
                          />
                          <strong className="font-semibold text-sm capitalize min-w-0 flex-1 whitespace-normal break-words leading-snug overflow-visible text-[#2c2724]">
                            {item.label}
                          </strong>
                          {isPinned && <span className="text-xs shrink-0" title="Annotation épinglée">📌</span>}
                        </div>
                        <div className="flex justify-end">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-[#7a4f21] border border-amber-300">
                            {t.annotate.statusReference}
                          </span>
                        </div>
                      </div>

                      <div className="mt-2 pt-2 border-t border-[#ede4d4] flex items-center justify-between text-[10px] text-[#736a5f]">
                        <span>{item.occurrences} {t.work.occurrencesCount}</span>
                        <a
                          href={item.concept}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline text-[#9A6530] inline-flex items-center space-x-0.5"
                        >
                          <span>{t.work.viewOnTheZoo}</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Bouton de pagination "Afficher plus" pour le mode section entière */}
            {hasMoreSection && (
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setSectionPageSize((prev) => prev + 30)}
                  className="w-full py-2 px-3 bg-[#f4ede2] hover:bg-[#eae0d0] text-[#784d1e] text-xs font-semibold rounded-none border border-[#ded5c6] transition-colors shadow-2xs cursor-pointer"
                >
                  {t.annotate.loadMore.replace('{remaining}', remainingSectionCount.toString())}
                </button>
              </div>
            )}

            {/* État vide si aucune annotation */}
            {displayedStaged.length === 0 && displayedReference.length === 0 && (
              <p className="text-xs text-[#8c8275] italic p-4 text-center">
                {sidebarScope === 'active_paragraph' ? t.annotate.noAnnotationsInPara : t.annotate.noAnnotationsFound}
              </p>
            )}

          </div>

        </aside>

      </div>

      {/* 3. Modal d'annotation sémantique interactive */}
      <AnnotationModal
        isOpen={isAnnotModalOpen}
        onClose={() => setIsAnnotModalOpen(false)}
        paragraphUri={activeParagraphUri}
        targetText={modalTargetText}
        startOffset={modalStartOffset}
        endOffset={modalEndOffset}
        endParagraphUri={modalEndParaUri}
        targetParagraphs={modalTargetParas}
        targetParagraphDetails={modalTargetParaDetails}
        initialScopeType={modalScopeType}
        onSuccess={() => refetchSectionData()}
      />

      {/* 4. Modal d'aide & Légende des annotations */}
      <AnnotationLegendModal
        isOpen={isLegendOpen}
        onClose={() => setIsLegendOpen(false)}
      />

    </div>
  )
}

export default CorpusAnnotation
