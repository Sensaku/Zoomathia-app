import React, { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  fetchAuthors,
  fetchWorks,
  fetchCollections,
  searchConcepts,
  fetchConcepts,
  fetchSectionAnnotations,
  postCustomSearch,
  downloadCustomSearch,
  CustomSearchExportFormat,
} from '../api/client'
import { getApiErrorMessage } from '../api/errors'
import { saveBlob } from '../utils/saveBlob'
import {
  Search,
  FileSpreadsheet,
  FileCode,
  Loader2,
  BookOpen,
  Library,
  Sparkles,
  Layers,
  RotateCcw,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Plus,
  SlidersHorizontal,
  ExternalLink,
  Tag,
  ListOrdered,
  User,
  X,
} from 'lucide-react'
import { useI18n } from '../i18n'
import {
  ConceptCriterion,
  CollectionCriterion,
  AnnotationMap,
  Paragraph,
  ConceptCategory,
  ConceptCollection,
} from '../types'
import { MultiSelectCombobox, ComboboxOption } from '../components/MultiSelectCombobox'
import { ConceptCriteriaCard, CollectionCriteriaCard } from '../components/ConceptCriteriaCard'
import {
  ConceptCategoryIcon,
  ConceptCategoryBadge,
  collectionLabels,
  CATEGORY_TOC_HOVER,
  CATEGORY_TOC_PINNED,
} from '../components/ConceptCategoryBadge'
import { useConceptInspection } from '../components/reading'
import { PinnedConceptBanner, ReadingParagraphCard } from '../features/reading'

export const ExploreCorpus: React.FC = () => {
  const { t, language } = useI18n()

  // 1. Périmètre Textuel
  const [selectedAuthors, setSelectedAuthors] = useState<string[]>([])
  const [selectedWorks, setSelectedWorks] = useState<string[]>([])
  const [excludedWorks, setExcludedWorks] = useState<string[]>([])

  // 2. Concepts & Taxonomie
  const [conceptCriteria, setConceptCriteria] = useState<ConceptCriterion[]>([])
  const [conceptSearchInput, setConceptSearchInput] = useState<string>('')

  // 3. Collections Thématiques
  const [collectionCriteria, setCollectionCriteria] = useState<CollectionCriterion[]>([])

  // 4. Logique & Mode de composition
  const [matchMode, setMatchMode] = useState<'OR' | 'AND'>('OR')
  const [activeTab, setActiveTab] = useState<'text' | 'concepts' | 'collections'>('text')
  const [isFilterCollapsed, setIsFilterCollapsed] = useState<boolean>(false)

  // 5. Navigation dans le Sous-Corpus (Table des matières, Sélection, Annotations)
  const [activeWorkUri, setActiveWorkUri] = useState<string>('')
  const [activeSectionUri, setActiveSectionUri] = useState<string>('')
  const [activeParagraphUri, setActiveParagraphUri] = useState<string>('')
  const [collapsedWorks, setCollapsedWorks] = useState<Record<string, boolean>>({})
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})
  const [tocFilter, setTocFilter] = useState<string>('')
  const [textSize, setTextSize] = useState<'normal' | 'large' | 'xlarge'>('large')

  // Requêtes API de base
  const { data: authors = [] } = useQuery({
    queryKey: ['authors'],
    queryFn: fetchAuthors,
  })

  const { data: works = [] } = useQuery({
    queryKey: ['works'],
    queryFn: fetchWorks,
  })

  const { data: collections = [] } = useQuery({
    queryKey: ['collections', language],
    queryFn: () => fetchCollections(language),
  })

  // Recherche de concepts TheZoo en direct
  const { data: searchedConcepts = [], isFetching: isSearchingConcepts } = useQuery({
    queryKey: ['searchConcepts', conceptSearchInput, language],
    queryFn: () => searchConcepts(conceptSearchInput.trim(), language, 40),
    enabled: conceptSearchInput.trim().length >= 2,
  })

  // Mutation de recherche personnalisée
  const searchMutation = useMutation({
    mutationFn: postCustomSearch,
    onSuccess: (data) => {
      // Si la recherche renvoie des résultats, on pré-sélectionne le premier passage et replie les filtres
      if (data.tree && data.tree.length > 0) {
        setIsFilterCollapsed(true)
        const firstWork = data.tree[0]
        setActiveWorkUri(firstWork.uri)
        const firstSec = firstWork.children?.[0]
        if (firstSec) {
          setActiveSectionUri(firstSec.uri)
          const firstPara = firstSec.children?.[0]
          if (firstPara) {
            setActiveParagraphUri(firstPara.uri)
          }
        }
      }
    },
  })

  // Search export (RM-EXP-01): the server rebuilds the query from the criteria of the last
  // successful search, then the file is saved in the browser.
  const [exportingFormat, setExportingFormat] = useState<CustomSearchExportFormat | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  const handleExport = async (format: CustomSearchExportFormat) => {
    const payload = searchMutation.variables
    if (!payload || exportingFormat) return
    setExportError(null)
    setExportingFormat(format)
    try {
      const blob = await downloadCustomSearch(payload, format)
      saveBlob(blob, `export_custom_search.${format}`)
    } catch (err) {
      setExportError(getApiErrorMessage(err, t))
    } finally {
      setExportingFormat(null)
    }
  }

  // Concepts & annotations du paragraphe actif sélectionné
  const { data: activeAnnotations = {}, isLoading: isAnnotationsLoading } = useQuery({
    queryKey: ['concepts', activeParagraphUri, language],
    queryFn: () => fetchConcepts(activeParagraphUri, language),
    enabled: !!activeParagraphUri,
  })

  // Options pour combobox Auteurs & Œuvres
  const authorOptions: ComboboxOption[] = useMemo(
    () => authors.map((a) => ({ value: a.name, label: a.name })),
    [authors],
  )

  const workOptions: ComboboxOption[] = useMemo(() => {
    return works.map((w) => ({
      value: w.uri,
      label: w.title,
      subtitle: w.author ? `${w.author}` : undefined,
    }))
  }, [works])

  // Ajout d'un concept
  const handleAddConcept = (c: {
    uri: string
    label: string
    type?: string
    category?: ConceptCategory
    collections?: ConceptCollection[]
  }) => {
    if (conceptCriteria.some((item) => item.uri === c.uri)) return
    setConceptCriteria((prev) => [
      ...prev,
      {
        uri: c.uri,
        label: c.label,
        type: c.type,
        category: c.category,
        collections: c.collections,
        include_subconcepts: false,
        polarity: 'include',
      },
    ])
    setConceptSearchInput('')
  }

  // Ajout d'une collection
  const handleAddCollection = (collUri: string) => {
    if (!collUri || collectionCriteria.some((item) => item.uri === collUri)) return
    const collObj = collections.find((c) => c.uri === collUri)
    setCollectionCriteria((prev) => [
      ...prev,
      {
        uri: collUri,
        label: collObj?.label || collUri,
        polarity: 'include',
      },
    ])
  }

  // Garde-fous
  const hasPositiveScope =
    selectedAuthors.length > 0 ||
    selectedWorks.length > 0 ||
    conceptCriteria.some((c) => c.polarity === 'include') ||
    collectionCriteria.some((c) => c.polarity === 'include')

  const hasExclusions =
    excludedWorks.length > 0 ||
    conceptCriteria.some((c) => c.polarity === 'exclude') ||
    collectionCriteria.some((c) => c.polarity === 'exclude')

  const isInvalidPureNegative = !hasPositiveScope && hasExclusions

  // Lancement de la recherche
  const handleSearch = () => {
    if (isInvalidPureNegative) return

    setExportError(null)
    searchMutation.mutate({
      author: selectedAuthors,
      work: selectedWorks,
      excluded_works: excludedWorks,
      concept_criteria: conceptCriteria,
      collection_criteria: collectionCriteria,
      match_mode: matchMode,
    })
  }

  // Réinitialiser tous les critères
  const handleResetFilters = () => {
    setSelectedAuthors([])
    setSelectedWorks([])
    setExcludedWorks([])
    setConceptCriteria([])
    setCollectionCriteria([])
    setMatchMode('OR')
    setActiveParagraphUri('')
  }

  const resultTree = searchMutation.data?.tree || []

  // Décompte total des paragraphes extraits
  const totalParagraphsExtracted = useMemo(() => {
    let count = 0
    resultTree.forEach((w) => {
      w.children?.forEach((sec: any) => {
        count += sec.children?.length || 0
      })
    })
    return count
  }, [resultTree])

  // Synchronisation automatique de la sélection dès que resultTree change
  useEffect(() => {
    if (resultTree.length > 0 && !activeWorkUri) {
      const firstW = resultTree[0]
      setActiveWorkUri(firstW.uri)
      const firstS = firstW.children?.[0]
      if (firstS) {
        setActiveSectionUri(firstS.uri)
        const firstP = firstS.children?.[0]
        if (firstP) setActiveParagraphUri(firstP.uri)
      }
    }
  }, [resultTree, activeWorkUri])

  // Œuvre active dans le résultat
  const currentActiveWork = useMemo(() => {
    return resultTree.find((w) => w.uri === activeWorkUri) || resultTree[0]
  }, [resultTree, activeWorkUri])

  // Section active dans l'œuvre active
  const currentActiveSection = useMemo(() => {
    if (!currentActiveWork) return null
    return (
      currentActiveWork.children?.find((sec: any) => sec.uri === activeSectionUri) ||
      currentActiveWork.children?.[0] ||
      null
    )
  }, [currentActiveWork, activeSectionUri])

  // Paragraphes à afficher dans la zone centrale de lecture
  const displayParagraphs: any[] = useMemo(() => {
    if (currentActiveSection && currentActiveSection.children?.length > 0) {
      return currentActiveSection.children
    }
    // Si pas de section précise, affiche tous les paragraphes de l'œuvre
    const list: any[] = []
    currentActiveWork?.children?.forEach((sec: any) => {
      sec.children?.forEach((p: any) => {
        list.push({ ...p, sectionTitle: sec.title || `Section ${sec.id}` })
      })
    })
    return list
  }, [currentActiveWork, currentActiveSection])

  // Annotations de la section active (Corese + Staging)
  const sectionForAnnotations = currentActiveSection?.uri || activeSectionUri
  const { data: sectionAnnotData } = useQuery({
    queryKey: ['sectionAnnotations', sectionForAnnotations, language],
    queryFn: () => fetchSectionAnnotations(sectionForAnnotations, language),
    enabled: !!sectionForAnnotations,
  })

  // Fusion avec les annotations directes du paragraphe si nécessaire
  const referenceAnnotations = useMemo(() => {
    const refs: Record<string, Record<string, any>> = { ...(sectionAnnotData?.reference_annotations || {}) }
    if (activeParagraphUri && activeAnnotations && Object.keys(activeAnnotations).length > 0) {
      refs[activeParagraphUri] = {
        ...(refs[activeParagraphUri] || {}),
        ...activeAnnotations,
      }
    }
    return refs
  }, [sectionAnnotData, activeParagraphUri, activeAnnotations])

  const stagedAnnotations = sectionAnnotData?.staged_annotations || []

  // Inspection synchronisée (survol prioritaire, épinglage, multi-paragraphes)
  const inspectionState = useConceptInspection({
    referenceAnnotations,
    stagedAnnotations,
    paragraphs: displayParagraphs,
    setActiveParagraphUri,
  })

  const {
    hoveredConcept,
    setHoveredConcept,
    pinnedConcept,
    setPinnedConcept,
    activeInspectionConcept,
    activeInspectionParagraphUris,
    activeInspectionCategory,
    pinnedConceptLabel,
    pinnedConceptCategory,
    pinnedParagraphsList,
    pinnedParagraphUris,
    hoveredParagraphUris,
    handleFocusParagraph,
  } = inspectionState

  // Comptages pour les onglets de filtres
  const textScopeCount = selectedAuthors.length + selectedWorks.length + excludedWorks.length
  const conceptCount = conceptCriteria.length
  const collectionCount = collectionCriteria.length

  return (
    <div className="mx-auto w-full max-w-[1920px] space-y-4 px-2 py-4 sm:space-y-6 sm:px-4 sm:py-6 lg:px-6">
      {/* En-tête de la Page */}
      <div className="flex items-center justify-between gap-4 rounded-none border border-[#e6dfd3] bg-white p-6 shadow-xs">
        <div className="flex items-center space-x-3.5">
          <div className="rounded-none bg-[#f4ede2] p-3 text-[#9A6530]">
            <Library className="h-6 w-6" />
          </div>
          <div>
            <h1 className="font-serif text-2xl font-bold text-[#2c2724] md:text-3xl">{t.corpus.title}</h1>
            <p className="text-sm text-[#696156] sm:text-base">{t.corpus.subtitle}</p>
          </div>
        </div>

        {/* Bouton de bascule d'affichage des filtres si résultats présents */}
        {searchMutation.isSuccess && resultTree.length > 0 && (
          <button
            type="button"
            onClick={() => setIsFilterCollapsed(!isFilterCollapsed)}
            className="inline-flex shrink-0 cursor-pointer items-center space-x-2 rounded-none border border-[#cfc5b4] bg-[#faf9f6] px-4 py-2.5 text-sm font-semibold text-[#543b22] shadow-2xs transition-colors hover:bg-[#f4ede2]"
          >
            <SlidersHorizontal className="h-4 w-4 text-[#9A6530]" />
            <span>{isFilterCollapsed ? t.corpus.showFilters : t.corpus.hideFilters}</span>
          </button>
        )}
      </div>

      {/* Constructeur de Sous-Corpus (Filtres) */}
      {(!searchMutation.isSuccess || !isFilterCollapsed) && (
        <div className="rounded-none border border-[#e6dfd3] bg-white shadow-xs">
          {/* Navigation par Onglets des 3 Facettes */}
          <div className="flex rounded-none border-b border-[#f0eae0] bg-[#faf9f6] text-sm font-semibold sm:text-base">
            <button
              type="button"
              onClick={() => setActiveTab('text')}
              className={`flex flex-1 cursor-pointer items-center justify-center space-x-2 border-b-2 px-6 py-4 transition-all ${
                activeTab === 'text'
                  ? 'border-[#9A6530] bg-white font-bold text-[#9A6530] shadow-xs'
                  : 'border-transparent text-[#736a5f] hover:text-[#2c2724]'
              }`}
            >
              <BookOpen className="h-4.5 w-4.5" />
              <span>{t.corpus.tabTextScope}</span>
              {textScopeCount > 0 && (
                <span className="ml-2 inline-flex h-5.5 min-w-[22px] items-center justify-center rounded-full bg-[#9A6530] px-2 text-center text-xs leading-none font-bold text-white">
                  {textScopeCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('concepts')}
              className={`flex flex-1 cursor-pointer items-center justify-center space-x-2 border-b-2 px-6 py-4 transition-all ${
                activeTab === 'concepts'
                  ? 'border-[#9A6530] bg-white font-bold text-[#9A6530] shadow-xs'
                  : 'border-transparent text-[#736a5f] hover:text-[#2c2724]'
              }`}
            >
              <Sparkles className="h-4.5 w-4.5" />
              <span>{t.corpus.tabTaxonomy}</span>
              {conceptCount > 0 && (
                <span className="ml-2 inline-flex h-5.5 min-w-[22px] items-center justify-center rounded-full bg-[#9A6530] px-2 text-center text-xs leading-none font-bold text-white">
                  {conceptCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('collections')}
              className={`flex flex-1 cursor-pointer items-center justify-center space-x-2 border-b-2 px-6 py-4 transition-all ${
                activeTab === 'collections'
                  ? 'border-[#9A6530] bg-white font-bold text-[#9A6530] shadow-xs'
                  : 'border-transparent text-[#736a5f] hover:text-[#2c2724]'
              }`}
            >
              <Layers className="h-4.5 w-4.5" />
              <span>{t.corpus.tabCollections}</span>
              {collectionCount > 0 && (
                <span className="ml-2 inline-flex h-5.5 min-w-[22px] items-center justify-center rounded-full bg-[#9A6530] px-2 text-center text-xs leading-none font-bold text-white">
                  {collectionCount}
                </span>
              )}
            </button>
          </div>

          {/* Corps des Facettes */}
          <div className="min-h-[160px] p-6">
            {/* FACETTE 1 : Périmètre Textuel (Auteurs & Œuvres) */}
            {activeTab === 'text' && (
              <div className="animate-in fade-in grid grid-cols-1 gap-6 duration-150 md:grid-cols-2">
                <MultiSelectCombobox
                  label={t.corpus.authorFilter}
                  icon={<User className="h-3.5 w-3.5 text-[#9A6530]" />}
                  placeholder="Tous les auteurs (ou sélectionnez un ou plusieurs auteurs)"
                  options={authorOptions}
                  selectedValues={selectedAuthors}
                  onChange={setSelectedAuthors}
                />

                <MultiSelectCombobox
                  label={t.corpus.workFilter}
                  icon={<BookOpen className="h-3.5 w-3.5 text-[#9A6530]" />}
                  placeholder="Toutes les œuvres (ou sélectionnez des œuvres précises)"
                  options={workOptions}
                  selectedValues={selectedWorks}
                  onChange={setSelectedWorks}
                  allowExclusion={true}
                  excludedValues={excludedWorks}
                  onExcludedChange={setExcludedWorks}
                />
              </div>
            )}

            {/* FACETTE 2 : Concepts TheZoo & Taxonomie */}
            {activeTab === 'concepts' && (
              <div className="animate-in fade-in space-y-4 duration-150">
                <div>
                  <label className="mb-2 flex items-center space-x-2 text-sm font-semibold tracking-wider text-[#63503d] uppercase">
                    <Sparkles className="h-4 w-4 text-[#9A6530]" />
                    <span>Rechercher un concept dans le thésaurus TheZoo</span>
                  </label>
                  <div className="relative">
                    <Search className="absolute top-3.5 left-3.5 h-4.5 w-4.5 text-[#8c8275]" />
                    <input
                      type="text"
                      value={conceptSearchInput}
                      onChange={(e) => setConceptSearchInput(e.target.value)}
                      placeholder={t.corpus.searchConceptsPlaceholder}
                      className="w-full rounded-none border border-[#cfc5b4] bg-[#faf9f6] py-3 pr-11 pl-11 text-sm text-[#2c2724] shadow-2xs transition-all focus:bg-white focus:ring-2 focus:ring-[#9A6530] focus:outline-none"
                    />
                    {isSearchingConcepts && (
                      <Loader2 className="absolute top-3.5 right-3.5 h-4 w-4 animate-spin text-[#9A6530]" />
                    )}
                  </div>
                </div>

                {conceptSearchInput.trim().length >= 2 && (
                  <div className="max-h-72 space-y-1 overflow-y-auto rounded-none border border-[#cfc5b4] bg-white p-2 shadow-xl">
                    {searchedConcepts.length === 0 ? (
                      <div className="p-4 text-center text-sm text-[#8c8275]">
                        Aucun concept TheZoo trouvé pour « {conceptSearchInput} ».
                      </div>
                    ) : (
                      searchedConcepts.map((item) => {
                        const isAlreadyAdded = conceptCriteria.some((c) => c.uri === item.uri)
                        return (
                          <div
                            key={item.uri}
                            onClick={() => !isAlreadyAdded && handleAddConcept(item)}
                            className={`flex cursor-pointer items-center justify-between rounded-none p-2.5 text-sm transition-colors ${
                              isAlreadyAdded
                                ? 'cursor-default bg-[#f4ede2] text-[#8c8275]'
                                : 'text-[#2c2724] hover:bg-[#faf9f6]'
                            }`}
                          >
                            <div className="flex min-w-0 items-center space-x-3 pr-2">
                              <ConceptCategoryIcon category={item.category} className="h-4.5 w-4.5 shrink-0" />
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center space-x-2 gap-y-1">
                                  <span className="block text-sm font-semibold break-words whitespace-normal">
                                    {item.label}
                                  </span>
                                  <ConceptCategoryBadge category={item.category} collections={item.collections} />
                                </div>
                                <span className="mt-0.5 block truncate font-mono text-xs text-[#736a5f]">
                                  {item.uri}
                                </span>
                              </div>
                            </div>
                            <span
                              className={`flex shrink-0 items-center space-x-1 rounded-none px-2.5 py-1 text-xs font-semibold ${
                                isAlreadyAdded
                                  ? 'bg-stone-200 text-stone-600'
                                  : 'bg-[#9A6530] text-white hover:bg-[#855424]'
                              }`}
                            >
                              <Plus className="h-3.5 w-3.5" />
                              <span>{isAlreadyAdded ? 'Déjà ajouté' : 'Ajouter'}</span>
                            </span>
                          </div>
                        )
                      })
                    )}
                  </div>
                )}

                <div className="space-y-2.5 pt-2">
                  <div className="flex items-center justify-between text-sm text-[#63503d]">
                    <span className="flex items-center space-x-2 font-semibold tracking-wider uppercase">
                      <Tag className="h-4 w-4 text-[#9A6530]" />
                      <span>Concepts sélectionnés</span>
                      <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#eaddcb] px-1.5 text-center text-xs leading-none font-bold text-[#543b22]">
                        {conceptCriteria.length}
                      </span>
                    </span>
                    {conceptCriteria.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setConceptCriteria([])}
                        className="cursor-pointer text-xs font-medium text-[#9A6530] hover:underline sm:text-sm"
                      >
                        Supprimer tous les concepts
                      </button>
                    )}
                  </div>

                  {conceptCriteria.length === 0 ? (
                    <div className="space-y-1 rounded-none border border-dashed border-[#cfc5b4] bg-[#faf9f6] p-6 text-center text-sm text-[#8c8275]">
                      <p className="font-medium">{t.corpus.noConceptsSelected}</p>
                      <p className="text-xs text-[#a19688]">{t.corpus.addConceptPrompt}</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                      {conceptCriteria.map((crit, idx) => (
                        <ConceptCriteriaCard
                          key={crit.uri}
                          criterion={crit}
                          onUpdate={(updated) => {
                            const newCrit = [...conceptCriteria]
                            newCrit[idx] = updated
                            setConceptCriteria(newCrit)
                          }}
                          onRemove={() => {
                            setConceptCriteria(conceptCriteria.filter((c) => c.uri !== crit.uri))
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* FACETTE 3 : Collections Thématiques */}
            {activeTab === 'collections' && (
              <div className="animate-in fade-in space-y-4 duration-150">
                <div>
                  <label className="mb-2 flex items-center space-x-2 text-sm font-semibold tracking-wider text-[#63503d] uppercase">
                    <Layers className="h-4 w-4 text-[#3b6ea5]" />
                    <span>{t.corpus.selectCollectionPrompt}</span>
                  </label>
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      handleAddCollection(e.target.value)
                      e.target.value = ''
                    }}
                    className="w-full cursor-pointer rounded-none border border-[#cfc5b4] bg-[#faf9f6] p-3 text-sm text-[#2c2724] shadow-2xs focus:bg-white focus:ring-2 focus:ring-[#9A6530] focus:outline-none"
                  >
                    <option value="" disabled>
                      -- Choisir une collection thématique parmi les 14 inventaires TheZoo --
                    </option>
                    {collections.map((coll) => (
                      <option key={coll.uri} value={coll.uri}>
                        {coll.label} ({coll.memberCount} {t.corpus.membersCount})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2.5 pt-2">
                  <div className="flex items-center justify-between text-sm text-[#63503d]">
                    <span className="flex items-center space-x-2 font-semibold tracking-wider uppercase">
                      <Layers className="h-4 w-4 text-[#3b6ea5]" />
                      <span>Collections actives</span>
                      <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full border border-sky-200 bg-sky-100 px-1.5 text-center text-xs leading-none font-bold text-[#245580]">
                        {collectionCriteria.length}
                      </span>
                    </span>
                    {collectionCriteria.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setCollectionCriteria([])}
                        className="cursor-pointer text-xs font-medium text-[#9A6530] hover:underline sm:text-sm"
                      >
                        Supprimer toutes les collections
                      </button>
                    )}
                  </div>

                  {collectionCriteria.length === 0 ? (
                    <div className="rounded-none border border-dashed border-[#cfc5b4] bg-[#faf9f6] p-6 text-center text-sm text-[#8c8275]">
                      {t.corpus.noCollectionsSelected}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                      {collectionCriteria.map((colCrit, idx) => {
                        const collMeta = collections.find((c) => c.uri === colCrit.uri)
                        return (
                          <CollectionCriteriaCard
                            key={colCrit.uri}
                            criterion={colCrit}
                            memberCount={collMeta?.memberCount}
                            onUpdate={(updated) => {
                              const newColls = [...collectionCriteria]
                              newColls[idx] = updated
                              setCollectionCriteria(newColls)
                            }}
                            onRemove={() => {
                              setCollectionCriteria(collectionCriteria.filter((c) => c.uri !== colCrit.uri))
                            }}
                          />
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Alerte si recherche uniquement négative */}
          {isInvalidPureNegative && (
            <div className="mx-6 mb-4 flex items-center space-x-3 rounded-none border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
              <span>{t.corpus.warningOnlyExclusions}</span>
            </div>
          )}

          {/* Search failure (backend guardrails: RM-ACC-02) */}
          {searchMutation.isError && (
            <div
              role="alert"
              className="mx-6 mb-4 flex items-start space-x-3 rounded-none border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            >
              <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
              <span>
                <span className="font-semibold">{t.corpus.searchFailed}</span>{' '}
                {getApiErrorMessage(searchMutation.error, t)}
              </span>
            </div>
          )}

          {/* Barre de Synthèse & Déclenchement de la Recherche */}
          <div className="flex flex-col items-stretch justify-between gap-4 rounded-none border-t border-[#f0eae0] bg-[#faf9f6] p-5 sm:p-6 md:flex-row md:items-center">
            <div className="flex items-center space-x-4 text-sm text-[#595248]">
              <span className="font-semibold text-[#63503d]">Logique d'inclusion :</span>
              <div className="inline-flex rounded-none border border-[#cfc5b4] bg-white p-0.5">
                <button
                  type="button"
                  onClick={() => setMatchMode('OR')}
                  className={`cursor-pointer rounded-none px-4 py-1.5 text-sm font-medium transition-colors ${
                    matchMode === 'OR'
                      ? 'bg-[#9A6530] font-semibold text-white shadow-xs'
                      : 'text-[#736a5f] hover:text-[#2c2724]'
                  }`}
                >
                  {t.corpus.matchModeOr}
                </button>
                <button
                  type="button"
                  onClick={() => setMatchMode('AND')}
                  className={`cursor-pointer rounded-none px-4 py-1.5 text-sm font-medium transition-colors ${
                    matchMode === 'AND'
                      ? 'bg-[#9A6530] font-semibold text-white shadow-xs'
                      : 'text-[#736a5f] hover:text-[#2c2724]'
                  }`}
                >
                  {t.corpus.matchModeAnd}
                </button>
              </div>
            </div>

            <div className="flex items-center space-x-3 self-end md:self-auto">
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex cursor-pointer items-center space-x-1.5 rounded-none border border-[#cfc5b4] px-4 py-2.5 text-sm font-medium text-[#736a5f] shadow-2xs transition-colors hover:bg-white hover:text-[#2c2724]"
              >
                <RotateCcw className="h-4 w-4" />
                <span>{t.corpus.clearAllFilters}</span>
              </button>

              <button
                type="button"
                onClick={handleSearch}
                disabled={searchMutation.isPending || isInvalidPureNegative}
                className="inline-flex cursor-pointer items-center space-x-2 rounded-none bg-[#9A6530] px-7 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-[#855424] disabled:opacity-50"
              >
                {searchMutation.isPending ? (
                  <>
                    <Loader2 className="h-4.5 w-4.5 animate-spin" />
                    <span>{t.corpus.searching}</span>
                  </>
                ) : (
                  <>
                    <Search className="h-4.5 w-4.5" />
                    <span>{t.corpus.searchButton}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VUE TRIPTYQUE DU SOUS-CORPUS (Sommaire / Zone de Lecture / Concepts & Annotations) */}
      {searchMutation.isSuccess && (
        <div className="space-y-4">
          {/* Barre d'en-tête du sous-corpus : Compteurs et Exports */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <div className="flex flex-wrap items-center gap-2.5 text-sm">
              <span className="font-serif text-lg font-bold whitespace-nowrap text-[#2c2724]">
                Sous-Corpus extrait :
              </span>
              <span className="rounded-full bg-[#f4ede2] px-3 py-1 text-xs font-semibold whitespace-nowrap text-[#543b22] sm:text-sm">
                {resultTree.length} {resultTree.length > 1 ? 'œuvres' : 'œuvre'}
              </span>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold whitespace-nowrap text-[#7a4c1a] sm:text-sm">
                {totalParagraphsExtracted.toLocaleString()} {totalParagraphsExtracted > 1 ? 'passages' : 'passage'}
              </span>
            </div>

            {searchMutation.variables && (
              <div className="flex shrink-0 items-center space-x-2">
                <button
                  type="button"
                  onClick={() => handleExport('json')}
                  disabled={exportingFormat !== null}
                  aria-busy={exportingFormat === 'json'}
                  className="inline-flex cursor-pointer items-center space-x-1.5 rounded-none border border-[#ded5c6] bg-white px-3 py-1.5 text-xs font-medium whitespace-nowrap text-[#3b6ea5] shadow-2xs transition-colors hover:bg-[#f4ede2] disabled:cursor-default disabled:opacity-50 sm:text-sm"
                >
                  {exportingFormat === 'json' ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  ) : (
                    <FileCode className="h-4 w-4 shrink-0" />
                  )}
                  <span>{t.common.exportJson}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExport('csv')}
                  disabled={exportingFormat !== null}
                  aria-busy={exportingFormat === 'csv'}
                  className="inline-flex cursor-pointer items-center space-x-1.5 rounded-none border border-[#ded5c6] bg-white px-3 py-1.5 text-xs font-medium whitespace-nowrap text-emerald-700 shadow-2xs transition-colors hover:bg-[#f4ede2] disabled:cursor-default disabled:opacity-50 sm:text-sm"
                >
                  {exportingFormat === 'csv' ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-4 w-4 shrink-0" />
                  )}
                  <span>{t.common.exportCsv}</span>
                </button>
              </div>
            )}
          </div>

          {exportError && (
            <div
              role="alert"
              className="flex items-start space-x-3 rounded-none border border-red-200 bg-red-50 p-3.5 text-sm text-red-700"
            >
              <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
              <span>
                <span className="font-semibold">{t.corpus.exportFailed}</span> {exportError}
              </span>
            </div>
          )}

          {resultTree.length === 0 ? (
            <div className="rounded-none border border-[#e6dfd3] bg-white p-12 text-center text-sm text-[#736a5f]">
              {t.corpus.noResults}
            </div>
          ) : (
            /* Disposition en 3 colonnes équilibrées : Sommaire (3) / Lecture (6) / Annotations (3) */
            <div className="grid grid-cols-1 gap-4 lg:h-[calc(100vh-220px)] lg:max-h-[850px] lg:min-h-[580px] lg:grid-cols-12 lg:items-stretch">
              {/* COLONNE 1 : Table des Matières du Sous-Corpus (3 cols = 25%) */}
              <aside className="flex h-full flex-col overflow-hidden rounded-none border border-[#e6dfd3] bg-white shadow-xs lg:col-span-3 xl:col-span-3">
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#f0eae0] bg-[#faf8f4] p-3.5 sm:p-4">
                  <h3 className="flex min-w-0 items-center space-x-2 font-serif text-sm font-bold text-[#2c2724] sm:text-base">
                    <ListOrdered className="h-4 w-4 shrink-0 text-[#9A6530]" />
                    <span className="whitespace-nowrap">{t.corpus.subcorpusToc}</span>
                  </h3>
                  <span className="shrink-0 rounded-full bg-[#f0eae0] px-2.5 py-0.5 text-xs font-bold whitespace-nowrap text-[#8c8275]">
                    {resultTree.length} {resultTree.length > 1 ? 'œuvres' : 'œuvre'}
                  </span>
                </div>

                {/* Recherche rapide dans la TOC */}
                <div className="shrink-0 border-b border-[#f0eae0] p-2.5">
                  <div className="relative">
                    <Search className="absolute top-2.5 left-3 h-4 w-4 text-[#8c8275]" />
                    <input
                      type="text"
                      value={tocFilter}
                      onChange={(e) => setTocFilter(e.target.value)}
                      placeholder={t.corpus.filterTocPlaceholder}
                      className="w-full rounded-none border border-[#e6dfd3] bg-[#fcfbf9] py-1.5 pr-3 pl-9 text-xs text-[#2c2724] focus:ring-2 focus:ring-[#9A6530] focus:outline-none sm:text-sm"
                    />
                  </div>
                </div>

                {/* Liste hiérarchique des œuvres et sections */}
                <div className="min-h-0 flex-1 scrollbar-thin space-y-2 overflow-y-auto p-2.5 pb-12">
                  {resultTree
                    .filter(
                      (w) =>
                        !tocFilter ||
                        w.title?.toLowerCase().includes(tocFilter.toLowerCase()) ||
                        w.author?.toLowerCase().includes(tocFilter.toLowerCase()),
                    )
                    .map((workNode) => {
                      const isWorkActive = currentActiveWork?.uri === workNode.uri
                      const isWorkCollapsed = !!collapsedWorks[workNode.uri]
                      const totalWorkParas =
                        workNode.children?.reduce((acc: number, sec: any) => acc + (sec.children?.length || 0), 0) || 0

                      return (
                        <div key={workNode.uri} className="space-y-1">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveWorkUri(workNode.uri)
                              const firstSec = workNode.children?.[0]
                              if (firstSec) {
                                setActiveSectionUri(firstSec.uri)
                                const firstP = firstSec.children?.[0]
                                if (firstP) {
                                  setActiveParagraphUri(firstP.uri)
                                  setTimeout(() => {
                                    const el = document.getElementById(firstP.uri)
                                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
                                  }, 50)
                                }
                              }
                            }}
                            className={`flex w-full cursor-pointer items-center justify-between rounded-none border p-2.5 text-left transition-colors ${
                              isWorkActive
                                ? 'border-[#ded5c6] bg-[#f4ede2] font-semibold text-[#543b22] shadow-xs'
                                : 'border-[#f0eae0] bg-[#faf9f6] text-[#2c2724] hover:bg-[#f4eee4]'
                            }`}
                          >
                            <div className="flex min-w-0 flex-1 items-start space-x-2 pr-1">
                              <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-[#9A6530]" />
                              <div className="min-w-0 flex-1">
                                <span className="block truncate font-serif text-sm leading-snug font-bold text-[#2c2724]">
                                  {workNode.title}
                                </span>
                                <span className="mt-0.5 flex items-center space-x-1 truncate text-xs text-[#736a5f]">
                                  <User className="h-3 w-3 shrink-0 text-[#9A6530]" />
                                  <span className="truncate">{workNode.author}</span>
                                </span>
                              </div>
                            </div>
                            <div className="ml-1 flex shrink-0 items-center space-x-1.5">
                              <span className="inline-flex items-center justify-center rounded-full bg-[#eaddcb] px-2 py-0.5 text-center text-xs leading-none font-bold whitespace-nowrap text-[#543b22]">
                                {totalWorkParas}
                              </span>
                              <span
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setCollapsedWorks({
                                    ...collapsedWorks,
                                    [workNode.uri]: !isWorkCollapsed,
                                  })
                                }}
                                className="cursor-pointer rounded-none p-1 hover:bg-black/5"
                              >
                                {isWorkCollapsed ? (
                                  <ChevronRight className="h-4 w-4 text-[#8c8275]" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-[#8c8275]" />
                                )}
                              </span>
                            </div>
                          </button>

                          {/* Sections sous l'œuvre */}
                          {!isWorkCollapsed && (
                            <div className="my-1 ml-2 space-y-1 border-l-2 border-[#e6dfd3] pl-2">
                              {workNode.children?.map((sec: any) => {
                                const isSecActive = currentActiveSection?.uri === sec.uri && isWorkActive
                                const isSecCollapsed = !!collapsedSections[sec.uri]

                                return (
                                  <div key={sec.uri} className="space-y-0.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveWorkUri(workNode.uri)
                                        setActiveSectionUri(sec.uri)
                                        const firstP = sec.children?.[0]
                                        if (firstP) {
                                          setActiveParagraphUri(firstP.uri)
                                          setTimeout(() => {
                                            const el = document.getElementById(firstP.uri)
                                            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
                                          }, 50)
                                        }
                                      }}
                                      className={`flex w-full cursor-pointer items-center justify-between rounded-none px-2.5 py-1.5 text-left text-xs transition-colors sm:text-sm ${
                                        isSecActive
                                          ? 'bg-[#9A6530] font-semibold text-white shadow-xs'
                                          : 'text-[#544b41] hover:bg-[#f4eee4]'
                                      }`}
                                    >
                                      <span className="mr-1 flex-1 truncate font-medium">
                                        {sec.title || `Section ${sec.id}`}
                                      </span>
                                      <div className="flex shrink-0 items-center space-x-1.5">
                                        <span
                                          className={`rounded-none px-1.5 py-0.5 text-[11px] font-bold whitespace-nowrap ${
                                            isSecActive ? 'bg-white/20 text-white' : 'bg-[#f0eae0] text-[#736a5f]'
                                          }`}
                                        >
                                          {sec.children?.length || 0}
                                        </span>
                                        <span
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setCollapsedSections({
                                              ...collapsedSections,
                                              [sec.uri]: !isSecCollapsed,
                                            })
                                          }}
                                          className="cursor-pointer rounded-none p-0.5 hover:bg-black/10"
                                        >
                                          {isSecCollapsed ? (
                                            <ChevronRight className="h-3.5 w-3.5" />
                                          ) : (
                                            <ChevronDown className="h-3.5 w-3.5" />
                                          )}
                                        </span>
                                      </div>
                                    </button>

                                    {/* Palette de puces/chips pour les paragraphes (§) */}
                                    {!isSecCollapsed && (
                                      <div className="my-1 ml-1.5 rounded-none border border-[#ede5d8] bg-[#fdfcf9] p-2">
                                        <div className="mb-1.5 flex items-center justify-between border-b border-[#f0eae0] pb-1 text-xs text-[#8c8275]">
                                          <span className="text-[10px] font-semibold tracking-wider text-[#63503d] uppercase">
                                            Passages (§)
                                          </span>
                                          <span className="text-[10px] font-medium">
                                            {sec.children?.length || 0} extraits
                                          </span>
                                        </div>
                                        <div className="flex max-h-48 scrollbar-thin flex-wrap gap-1 overflow-y-auto pr-0.5">
                                          {sec.children?.map((p: any) => {
                                            const isParaActive = activeParagraphUri === p.uri
                                            const isHoveredP =
                                              !!hoveredConcept && (hoveredParagraphUris?.has(p.uri) ?? false)
                                            const isPinnedP =
                                              !!pinnedConcept && (pinnedParagraphUris?.has(p.uri) ?? false)

                                            return (
                                              <button
                                                key={p.uri}
                                                type="button"
                                                onClick={() => {
                                                  setActiveWorkUri(workNode.uri)
                                                  setActiveSectionUri(sec.uri)
                                                  handleFocusParagraph(p.uri)
                                                }}
                                                className={`cursor-pointer rounded-none border px-2 py-1 font-mono text-xs font-bold transition-colors ${
                                                  isParaActive
                                                    ? 'border-[#855424] bg-[#9A6530] text-white shadow-xs ring-1 ring-[#9A6530]/40'
                                                    : isHoveredP
                                                      ? CATEGORY_TOC_HOVER[activeInspectionCategory] ||
                                                        CATEGORY_TOC_HOVER.general
                                                      : isPinnedP
                                                        ? CATEGORY_TOC_PINNED[pinnedConceptCategory] ||
                                                          CATEGORY_TOC_PINNED.general
                                                        : 'border-[#ded5c6] bg-white text-[#543b22] hover:border-[#9A6530]/50 hover:bg-[#f4ede2]'
                                                }`}
                                                title={`Passage § ${p.id}`}
                                              >
                                                § {p.id}
                                              </button>
                                            )
                                          })}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                </div>
              </aside>

              {/* COLONNE 2 : Zone de Lecture du Sous-Corpus (6 cols = 50%) */}
              <main className="flex h-full flex-col overflow-hidden rounded-none border border-[#e6dfd3] bg-white shadow-xs lg:col-span-6 xl:col-span-6">
                {/* En-tête de lecture */}
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#f0eae0] bg-[#faf8f4] p-3.5 sm:p-4">
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-serif text-base font-bold text-[#2c2724] sm:text-lg md:text-xl">
                      {currentActiveWork?.title || 'Lecture du sous-corpus'}
                    </h2>
                    <span className="block truncate text-xs text-[#736a5f] sm:text-sm">
                      {currentActiveWork?.author} •{' '}
                      {currentActiveSection?.title || `Section ${currentActiveSection?.id || 1}`}
                    </span>
                  </div>

                  {/* Contrôleur de taille du texte */}
                  <div className="flex shrink-0 items-center space-x-1 rounded-none border border-[#e6dfd3] bg-[#faf9f6] p-1">
                    <button
                      type="button"
                      onClick={() => setTextSize('normal')}
                      className={`cursor-pointer rounded-none px-2.5 py-1 font-serif text-xs transition-colors sm:text-sm ${
                        textSize === 'normal'
                          ? 'bg-[#9A6530] font-bold text-white shadow-xs'
                          : 'text-[#543b22] hover:bg-[#eaddcb]'
                      }`}
                      title="Texte normal"
                    >
                      A
                    </button>
                    <button
                      type="button"
                      onClick={() => setTextSize('large')}
                      className={`cursor-pointer rounded-none px-2.5 py-1 font-serif text-xs transition-colors sm:text-sm ${
                        textSize === 'large'
                          ? 'bg-[#9A6530] font-bold text-white shadow-xs'
                          : 'text-[#543b22] hover:bg-[#eaddcb]'
                      }`}
                      title="Texte grand"
                    >
                      A+
                    </button>
                    <button
                      type="button"
                      onClick={() => setTextSize('xlarge')}
                      className={`cursor-pointer rounded-none px-2.5 py-1 font-serif text-xs transition-colors sm:text-sm ${
                        textSize === 'xlarge'
                          ? 'bg-[#9A6530] font-bold text-white shadow-xs'
                          : 'text-[#543b22] hover:bg-[#eaddcb]'
                      }`}
                      title="Texte très grand"
                    >
                      A++
                    </button>
                  </div>
                </div>

                {/* Paragraphes de la section active */}
                <div
                  id="subcorpus-reading-pane"
                  className="min-h-0 flex-1 scrollbar-thin space-y-5 overflow-y-auto p-4 pb-24 sm:p-6"
                >
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

                  {displayParagraphs.length === 0 ? (
                    <div className="p-8 text-center text-sm text-[#8c8275]">
                      Aucun passage extrait pour cette section.
                    </div>
                  ) : (
                    displayParagraphs.map((p: any, idx: number) => (
                      <ReadingParagraphCard
                        key={p.uri || idx}
                        p={p}
                        isCurrentPara={activeParagraphUri === p.uri}
                        referenceMap={referenceAnnotations[p.uri]}
                        stagedList={stagedAnnotations}
                        inspectionState={inspectionState}
                        textSize={textSize}
                        onActivate={() => setActiveParagraphUri(p.uri)}
                      />
                    ))
                  )}
                </div>
              </main>

              {/* COLONNE 3 : Panneau des Concepts & Annotations (3 cols = 25%) */}
              <aside className="flex h-full flex-col overflow-hidden rounded-none border border-[#e6dfd3] bg-white shadow-xs lg:col-span-3 xl:col-span-3">
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#f0eae0] bg-[#faf8f4] p-3.5 sm:p-4">
                  <h3 className="flex min-w-0 items-center space-x-2 font-serif text-sm font-bold text-[#2c2724] sm:text-base">
                    <Sparkles className="h-4 w-4 shrink-0 text-[#9A6530]" />
                    <span className="whitespace-nowrap">{t.corpus.subcorpusAnnotations}</span>
                  </h3>
                  <span className="inline-flex shrink-0 items-center justify-center rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1 text-center text-xs leading-none font-bold whitespace-nowrap text-[#9A6530]">
                    {Object.keys(activeAnnotations).length}{' '}
                    {Object.keys(activeAnnotations).length > 1 ? 'concepts' : 'concept'}
                  </span>
                </div>

                <div className="min-h-0 flex-1 scrollbar-thin space-y-3 overflow-y-auto p-3.5 pb-24 text-sm">
                  {!activeParagraphUri ? (
                    <div className="p-6 text-center text-sm text-[#8c8275] italic">{t.corpus.selectParagraphHint}</div>
                  ) : isAnnotationsLoading ? (
                    <div className="space-y-2 p-8 text-center">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#9A6530]" />
                      <p className="text-sm text-[#8c8275]">Chargement des concepts annotés...</p>
                    </div>
                  ) : Object.keys(activeAnnotations).length === 0 ? (
                    <div className="rounded-none border border-dashed border-[#e6dfd3] bg-[#faf9f6] p-6 text-center text-sm text-[#8c8275]">
                      Aucun concept répertorié sur ce passage particulier.
                    </div>
                  ) : (
                    Object.values(activeAnnotations).map((item) => {
                      const isPinned = pinnedConcept === item.concept
                      const isHovered = hoveredConcept === item.concept

                      // Harmonisation typographique du libellé de concept
                      const displayLabel =
                        item.label && item.label === item.label.toUpperCase() && item.label.length > 1
                          ? item.label.charAt(0).toUpperCase() + item.label.slice(1).toLowerCase()
                          : item.label

                      // Extraction propre de l'identifiant (sans query string brute)
                      const formatConceptId = (uri: string) => {
                        const match = uri.match(/[?&]idc=([^&]+)/)
                        if (match) return `TheZoo #${match[1]}`
                        const lastPart = uri.split('/').pop()?.split('#').pop() || uri
                        return lastPart.length > 18 ? lastPart.slice(0, 16) + '…' : lastPart
                      }

                      return (
                        <div
                          key={item.concept}
                          onMouseEnter={() => setHoveredConcept(item.concept)}
                          onMouseLeave={() => setHoveredConcept(null)}
                          onClick={() => setPinnedConcept((prev) => (prev === item.concept ? null : item.concept))}
                          className={`cursor-pointer space-y-2 rounded-none border p-3 text-sm transition-colors sm:p-3.5 ${
                            isPinned
                              ? 'border-[#9A6530] bg-[#fdf7ee] shadow-sm ring-2 ring-amber-500'
                              : isHovered
                                ? 'border-[#9A6530] bg-[#f4ede2] shadow-xs ring-1 ring-[#9A6530]'
                                : 'border-[#f0eae0] bg-[#fcfbf9] hover:bg-[#faf9f6]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-1.5">
                            <div className="flex min-w-0 flex-1 items-start space-x-2.5">
                              <div className="mt-0.5 shrink-0">
                                <ConceptCategoryIcon category={item.category} className="h-4.5 w-4.5" />
                              </div>
                              <div className="group/label relative min-w-0 flex-1">
                                <span
                                  className="block overflow-visible text-sm leading-snug font-semibold break-words whitespace-normal text-[#2c2724] transition-colors group-hover/label:text-[#9A6530] sm:text-base"
                                  title={item.label}
                                >
                                  {displayLabel}
                                  {isPinned && (
                                    <span className="ml-1.5 inline-block text-xs" title="Annotation épinglée">
                                      📌
                                    </span>
                                  )}
                                </span>

                                {/* Popup flottant automatique au survol si label long (>22 caractères) */}
                                {item.label && item.label.length > 22 && (
                                  <div className="pointer-events-none absolute bottom-full left-0 z-50 mb-2 hidden w-72 flex-col space-y-1.5 rounded-none border border-[#4a4038] bg-[#241f1c] p-3 text-xs text-[#fbf9f5] shadow-2xl group-hover/label:flex sm:w-88">
                                    <div className="flex items-center space-x-1.5 text-[11px] font-semibold text-amber-400">
                                      <Sparkles className="h-3.5 w-3.5 shrink-0" />
                                      <span>Libellé complet TheZoo</span>
                                    </div>
                                    <p className="text-sm leading-snug font-bold break-words text-white">
                                      {item.label}
                                    </p>
                                    {item.collections && item.collections.length > 0 && (
                                      <p className="text-[11px] font-medium text-white">
                                        {t.conceptCategories.collectionsTitle.replace('{list}', () =>
                                          collectionLabels(item.collections, language),
                                        )}
                                      </p>
                                    )}
                                    <div className="flex items-center justify-between border-t border-white/10 pt-1 text-[10px] text-[#9c9183]">
                                      <span className="font-mono">{formatConceptId(item.concept)}</span>
                                      {item.offset && item.offset.length > 0 && (
                                        <span>{item.offset.length} occurrence(s)</span>
                                      )}
                                    </div>
                                    {/* Flèche du tooltip vers le bas */}
                                    <div className="absolute top-full left-6 h-0 w-0 border-x-4 border-t-4 border-x-transparent border-t-[#241f1c]" />
                                  </div>
                                )}

                                <div className="mt-1 flex flex-wrap gap-1">
                                  <ConceptCategoryBadge
                                    category={item.category}
                                    collections={item.collections}
                                    size="sm"
                                  />
                                </div>
                              </div>
                            </div>
                            <a
                              href={item.concept}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={t.work.viewOnTheZoo}
                              onClick={(e) => e.stopPropagation()}
                              className="shrink-0 p-1 text-[#8c8275] transition-colors hover:text-[#9A6530]"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </div>

                          <div className="flex items-center justify-between gap-2 border-t border-[#f0eae0]/60 pt-1.5 text-xs text-[#8c8275]">
                            <span
                              className="min-w-0 flex-1 truncate font-mono text-[11px] text-[#8c8275]"
                              title={item.concept}
                            >
                              {formatConceptId(item.concept)}
                            </span>
                            {item.offset && item.offset.length > 0 && (
                              <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-[#f0eae0] px-2 py-0.5 text-center text-[11px] leading-none font-semibold whitespace-nowrap text-[#543b22]">
                                {item.offset.length} occ.
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </aside>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
