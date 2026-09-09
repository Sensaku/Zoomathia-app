import React, { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  fetchAuthors,
  fetchWorks,
  fetchCollections,
  searchConcepts,
  fetchConcepts,
  fetchSectionAnnotations,
  postCustomSearch
} from '../api/client'
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
  X
} from 'lucide-react'
import { useI18n } from '../i18n'
import { ConceptCriterion, CollectionCriterion, AnnotationMap, Paragraph, ConceptCategory } from '../types'
import { MultiSelectCombobox, ComboboxOption } from '../components/MultiSelectCombobox'
import { ConceptCriteriaCard, CollectionCriteriaCard } from '../components/ConceptCriteriaCard'
import {
  ConceptCategoryIcon,
  ConceptCategoryBadge,
  getConceptCategoryInfo,
  CATEGORY_TOC_HOVER,
  CATEGORY_TOC_PINNED
} from '../components/ConceptCategoryBadge'
import {
  ReadingParagraphCard,
  PinnedConceptBanner,
  useConceptInspection
} from '../components/reading'

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
    queryFn: fetchAuthors
  })

  const { data: works = [] } = useQuery({
    queryKey: ['works'],
    queryFn: fetchWorks
  })

  const { data: collections = [] } = useQuery({
    queryKey: ['collections', language],
    queryFn: () => fetchCollections(language)
  })

  // Recherche de concepts TheZoo en direct
  const { data: searchedConcepts = [], isFetching: isSearchingConcepts } = useQuery({
    queryKey: ['searchConcepts', conceptSearchInput, language],
    queryFn: () => searchConcepts(conceptSearchInput.trim(), language, 40),
    enabled: conceptSearchInput.trim().length >= 2
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
    }
  })

  // Concepts & annotations du paragraphe actif sélectionné
  const { data: activeAnnotations = {}, isLoading: isAnnotationsLoading } = useQuery({
    queryKey: ['concepts', activeParagraphUri, language],
    queryFn: () => fetchConcepts(activeParagraphUri, language),
    enabled: !!activeParagraphUri
  })


  // Options pour combobox Auteurs & Œuvres
  const authorOptions: ComboboxOption[] = useMemo(
    () => authors.map((a) => ({ value: a.name, label: a.name })),
    [authors]
  )

  const workOptions: ComboboxOption[] = useMemo(() => {
    return works.map((w) => ({
      value: w.uri,
      label: w.title,
      subtitle: w.author ? `${w.author}` : undefined
    }))
  }, [works])

  // Ajout d'un concept
  const handleAddConcept = (c: {
    uri: string
    label: string
    type?: string
    category?: ConceptCategory
    collection?: string | null
  }) => {
    if (conceptCriteria.some((item) => item.uri === c.uri)) return
    setConceptCriteria((prev) => [
      ...prev,
      {
        uri: c.uri,
        label: c.label,
        type: c.type,
        category: c.category,
        collection: c.collection,
        include_subconcepts: false,
        polarity: 'include'
      }
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
        polarity: 'include'
      }
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

    searchMutation.mutate({
      author: selectedAuthors,
      work: selectedWorks,
      excluded_works: excludedWorks,
      concept_criteria: conceptCriteria,
      collection_criteria: collectionCriteria,
      match_mode: matchMode
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
  const sparqlQuery = searchMutation.data?.sparql || ''

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
    enabled: !!sectionForAnnotations
  })

  // Fusion avec les annotations directes du paragraphe si nécessaire
  const referenceAnnotations = useMemo(() => {
    const refs: Record<string, Record<string, any>> = { ...(sectionAnnotData?.reference_annotations || {}) }
    if (activeParagraphUri && activeAnnotations && Object.keys(activeAnnotations).length > 0) {
      refs[activeParagraphUri] = {
        ...(refs[activeParagraphUri] || {}),
        ...activeAnnotations
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
    setActiveParagraphUri
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
    handleFocusParagraph
  } = inspectionState

  // Comptages pour les onglets de filtres
  const textScopeCount = selectedAuthors.length + selectedWorks.length + excludedWorks.length
  const conceptCount = conceptCriteria.length
  const collectionCount = collectionCriteria.length

  return (
    <div className="py-4 sm:py-6 space-y-4 sm:space-y-6 max-w-[1920px] w-full px-2 sm:px-4 lg:px-6 mx-auto">
      {/* En-tête de la Page */}
      <div className="bg-white p-6 rounded-none border border-[#e6dfd3] shadow-xs flex items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="p-3 rounded-none bg-[#f4ede2] text-[#9A6530]">
            <Library className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-serif text-2xl md:text-3xl font-bold text-[#2c2724]">
              {t.corpus.title}
            </h1>
            <p className="text-sm sm:text-base text-[#696156]">{t.corpus.subtitle}</p>
          </div>
        </div>

        {/* Bouton de bascule d'affichage des filtres si résultats présents */}
        {searchMutation.isSuccess && resultTree.length > 0 && (
          <button
            type="button"
            onClick={() => setIsFilterCollapsed(!isFilterCollapsed)}
            className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-none border border-[#cfc5b4] bg-[#faf9f6] hover:bg-[#f4ede2] text-sm font-semibold text-[#543b22] transition-colors cursor-pointer shrink-0 shadow-2xs"
          >
            <SlidersHorizontal className="w-4 h-4 text-[#9A6530]" />
            <span>{isFilterCollapsed ? t.corpus.showFilters : t.corpus.hideFilters}</span>
          </button>
        )}
      </div>

      {/* Constructeur de Sous-Corpus (Filtres) */}
      {(!searchMutation.isSuccess || !isFilterCollapsed) && (
        <div className="bg-white rounded-none border border-[#e6dfd3] shadow-xs">
          {/* Navigation par Onglets des 3 Facettes */}
          <div className="flex border-b border-[#f0eae0] bg-[#faf9f6] text-sm sm:text-base font-semibold rounded-none">
            <button
              type="button"
              onClick={() => setActiveTab('text')}
              className={`flex-1 py-4 px-6 flex items-center justify-center space-x-2 border-b-2 transition-all cursor-pointer ${
                activeTab === 'text'
                  ? 'border-[#9A6530] text-[#9A6530] bg-white font-bold shadow-xs'
                  : 'border-transparent text-[#736a5f] hover:text-[#2c2724]'
              }`}
            >
              <BookOpen className="w-4.5 h-4.5" />
              <span>{t.corpus.tabTextScope}</span>
              {textScopeCount > 0 && (
                <span className="ml-2 inline-flex items-center justify-center text-center min-w-[22px] h-5.5 px-2 rounded-full bg-[#9A6530] text-white text-xs font-bold leading-none">
                  {textScopeCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('concepts')}
              className={`flex-1 py-4 px-6 flex items-center justify-center space-x-2 border-b-2 transition-all cursor-pointer ${
                activeTab === 'concepts'
                  ? 'border-[#9A6530] text-[#9A6530] bg-white font-bold shadow-xs'
                  : 'border-transparent text-[#736a5f] hover:text-[#2c2724]'
              }`}
            >
              <Sparkles className="w-4.5 h-4.5" />
              <span>{t.corpus.tabTaxonomy}</span>
              {conceptCount > 0 && (
                <span className="ml-2 inline-flex items-center justify-center text-center min-w-[22px] h-5.5 px-2 rounded-full bg-[#9A6530] text-white text-xs font-bold leading-none">
                  {conceptCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('collections')}
              className={`flex-1 py-4 px-6 flex items-center justify-center space-x-2 border-b-2 transition-all cursor-pointer ${
                activeTab === 'collections'
                  ? 'border-[#9A6530] text-[#9A6530] bg-white font-bold shadow-xs'
                  : 'border-transparent text-[#736a5f] hover:text-[#2c2724]'
              }`}
            >
              <Layers className="w-4.5 h-4.5" />
              <span>{t.corpus.tabCollections}</span>
              {collectionCount > 0 && (
                <span className="ml-2 inline-flex items-center justify-center text-center min-w-[22px] h-5.5 px-2 rounded-full bg-[#9A6530] text-white text-xs font-bold leading-none">
                  {collectionCount}
                </span>
              )}
            </button>
          </div>

          {/* Corps des Facettes */}
          <div className="p-6 min-h-[160px]">
            {/* FACETTE 1 : Périmètre Textuel (Auteurs & Œuvres) */}
            {activeTab === 'text' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-150">
                <MultiSelectCombobox
                  label={t.corpus.authorFilter}
                  icon={<User className="w-3.5 h-3.5 text-[#9A6530]" />}
                  placeholder="Tous les auteurs (ou sélectionnez un ou plusieurs auteurs)"
                  options={authorOptions}
                  selectedValues={selectedAuthors}
                  onChange={setSelectedAuthors}
                />

                <MultiSelectCombobox
                  label={t.corpus.workFilter}
                  icon={<BookOpen className="w-3.5 h-3.5 text-[#9A6530]" />}
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
              <div className="space-y-4 animate-in fade-in duration-150">
                <div>
                  <label className="flex items-center space-x-2 text-sm font-semibold uppercase tracking-wider text-[#63503d] mb-2">
                    <Sparkles className="w-4 h-4 text-[#9A6530]" />
                    <span>Rechercher un concept dans le thésaurus TheZoo</span>
                  </label>
                  <div className="relative">
                    <Search className="w-4.5 h-4.5 absolute left-3.5 top-3.5 text-[#8c8275]" />
                    <input
                      type="text"
                      value={conceptSearchInput}
                      onChange={(e) => setConceptSearchInput(e.target.value)}
                      placeholder={t.corpus.searchConceptsPlaceholder}
                      className="w-full pl-11 pr-11 py-3 rounded-none border border-[#cfc5b4] bg-[#faf9f6] text-sm text-[#2c2724] focus:outline-none focus:ring-2 focus:ring-[#9A6530] focus:bg-white transition-all shadow-2xs"
                    />
                    {isSearchingConcepts && (
                      <Loader2 className="w-4 h-4 absolute right-3.5 top-3.5 animate-spin text-[#9A6530]" />
                    )}
                  </div>
                </div>

                {conceptSearchInput.trim().length >= 2 && (
                  <div className="p-2 bg-white rounded-none border border-[#cfc5b4] shadow-xl space-y-1 max-h-72 overflow-y-auto">
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
                            className={`flex items-center justify-between p-2.5 rounded-none text-sm cursor-pointer transition-colors ${
                              isAlreadyAdded
                                ? 'bg-[#f4ede2] text-[#8c8275] cursor-default'
                                : 'hover:bg-[#faf9f6] text-[#2c2724]'
                            }`}
                          >
                            <div className="flex items-center space-x-3 min-w-0 pr-2">
                              <ConceptCategoryIcon
                                category={item.category}
                                collection={item.collection}
                                label={item.label}
                                uri={item.uri}
                                className="w-4.5 h-4.5 shrink-0"
                              />
                              <div className="min-w-0">
                                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                                  <span className="font-semibold text-sm block truncate">{item.label}</span>
                                  <ConceptCategoryBadge
                                    category={item.category}
                                    collection={item.collection}
                                    label={item.label}
                                    uri={item.uri}
                                  />
                                </div>
                                <span className="text-xs text-[#736a5f] block truncate font-mono mt-0.5">
                                  {item.uri}
                                </span>
                              </div>
                            </div>
                            <span
                              className={`px-2.5 py-1 rounded-none text-xs font-semibold flex items-center space-x-1 shrink-0 ${
                                isAlreadyAdded
                                  ? 'bg-stone-200 text-stone-600'
                                  : 'bg-[#9A6530] text-white hover:bg-[#855424]'
                              }`}
                            >
                              <Plus className="w-3.5 h-3.5" />
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
                    <span className="flex items-center space-x-2 font-semibold uppercase tracking-wider">
                      <Tag className="w-4 h-4 text-[#9A6530]" />
                      <span>Concepts sélectionnés</span>
                      <span className="inline-flex items-center justify-center text-center leading-none min-w-[20px] h-5 px-1.5 rounded-full bg-[#eaddcb] text-[#543b22] text-xs font-bold">
                        {conceptCriteria.length}
                      </span>
                    </span>
                    {conceptCriteria.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setConceptCriteria([])}
                        className="text-[#9A6530] hover:underline text-xs sm:text-sm font-medium cursor-pointer"
                      >
                        Supprimer tous les concepts
                      </button>
                    )}
                  </div>

                  {conceptCriteria.length === 0 ? (
                    <div className="p-6 rounded-none border border-dashed border-[#cfc5b4] bg-[#faf9f6] text-center text-sm text-[#8c8275] space-y-1">
                      <p className="font-medium">{t.corpus.noConceptsSelected}</p>
                      <p className="text-xs text-[#a19688]">{t.corpus.addConceptPrompt}</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
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
              <div className="space-y-4 animate-in fade-in duration-150">
                <div>
                  <label className="flex items-center space-x-2 text-sm font-semibold uppercase tracking-wider text-[#63503d] mb-2">
                    <Layers className="w-4 h-4 text-[#3b6ea5]" />
                    <span>{t.corpus.selectCollectionPrompt}</span>
                  </label>
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      handleAddCollection(e.target.value)
                      e.target.value = ''
                    }}
                    className="w-full p-3 rounded-none border border-[#cfc5b4] bg-[#faf9f6] text-sm text-[#2c2724] focus:ring-2 focus:ring-[#9A6530] focus:bg-white focus:outline-none cursor-pointer shadow-2xs"
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
                    <span className="flex items-center space-x-2 font-semibold uppercase tracking-wider">
                      <Layers className="w-4 h-4 text-[#3b6ea5]" />
                      <span>Collections actives</span>
                      <span className="inline-flex items-center justify-center text-center leading-none min-w-[20px] h-5 px-1.5 rounded-full bg-sky-100 text-[#245580] text-xs font-bold border border-sky-200">
                        {collectionCriteria.length}
                      </span>
                    </span>
                    {collectionCriteria.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setCollectionCriteria([])}
                        className="text-[#9A6530] hover:underline text-xs sm:text-sm font-medium cursor-pointer"
                      >
                        Supprimer toutes les collections
                      </button>
                    )}
                  </div>

                  {collectionCriteria.length === 0 ? (
                    <div className="p-6 rounded-none border border-dashed border-[#cfc5b4] bg-[#faf9f6] text-center text-sm text-[#8c8275]">
                      {t.corpus.noCollectionsSelected}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
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
                              setCollectionCriteria(
                                collectionCriteria.filter((c) => c.uri !== colCrit.uri)
                              )
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
            <div className="mx-6 mb-4 p-4 rounded-none bg-amber-50 border border-amber-200 text-amber-900 text-sm flex items-center space-x-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <span>{t.corpus.warningOnlyExclusions}</span>
            </div>
          )}

          {/* Barre de Synthèse & Déclenchement de la Recherche */}
          <div className="p-5 sm:p-6 bg-[#faf9f6] border-t border-[#f0eae0] rounded-none flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            <div className="flex items-center space-x-4 text-sm text-[#595248]">
              <span className="font-semibold text-[#63503d]">Logique d'inclusion :</span>
              <div className="inline-flex rounded-none border border-[#cfc5b4] bg-white p-0.5">
                <button
                  type="button"
                  onClick={() => setMatchMode('OR')}
                  className={`px-4 py-1.5 rounded-none text-sm font-medium transition-colors cursor-pointer ${
                    matchMode === 'OR'
                      ? 'bg-[#9A6530] text-white shadow-xs font-semibold'
                      : 'text-[#736a5f] hover:text-[#2c2724]'
                  }`}
                >
                  {t.corpus.matchModeOr}
                </button>
                <button
                  type="button"
                  onClick={() => setMatchMode('AND')}
                  className={`px-4 py-1.5 rounded-none text-sm font-medium transition-colors cursor-pointer ${
                    matchMode === 'AND'
                      ? 'bg-[#9A6530] text-white shadow-xs font-semibold'
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
                className="inline-flex items-center space-x-1.5 px-4 py-2.5 rounded-none border border-[#cfc5b4] text-sm font-medium text-[#736a5f] hover:bg-white hover:text-[#2c2724] transition-colors cursor-pointer shadow-2xs"
              >
                <RotateCcw className="w-4 h-4" />
                <span>{t.corpus.clearAllFilters}</span>
              </button>

              <button
                type="button"
                onClick={handleSearch}
                disabled={searchMutation.isPending || isInvalidPureNegative}
                className="inline-flex items-center space-x-2 px-7 py-2.5 bg-[#9A6530] hover:bg-[#855424] text-white rounded-none font-bold text-sm shadow-sm transition-all disabled:opacity-50 cursor-pointer"
              >
                {searchMutation.isPending ? (
                  <>
                    <Loader2 className="w-4.5 h-4.5 animate-spin" />
                    <span>{t.corpus.searching}</span>
                  </>
                ) : (
                  <>
                    <Search className="w-4.5 h-4.5" />
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
              <span className="font-serif font-bold text-lg text-[#2c2724] whitespace-nowrap">
                Sous-Corpus extrait :
              </span>
              <span className="px-3 py-1 rounded-full bg-[#f4ede2] text-[#543b22] font-semibold text-xs sm:text-sm whitespace-nowrap">
                {resultTree.length} {resultTree.length > 1 ? 'œuvres' : 'œuvre'}
              </span>
              <span className="px-3 py-1 rounded-full bg-amber-100 text-[#7a4c1a] font-semibold text-xs sm:text-sm whitespace-nowrap">
                {totalParagraphsExtracted.toLocaleString()} {totalParagraphsExtracted > 1 ? 'passages' : 'passage'}
              </span>
            </div>

            {sparqlQuery && (
              <div className="flex items-center space-x-2 shrink-0">
                <a
                  href={`/api/download-custom-search-json?sparql=${encodeURIComponent(sparqlQuery)}`}
                  download
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-[#ded5c6] rounded-none text-xs sm:text-sm font-medium text-[#3b6ea5] hover:bg-[#f4ede2] transition-colors shadow-2xs whitespace-nowrap"
                >
                  <FileCode className="w-4 h-4 shrink-0" />
                  <span>{t.common.exportJson}</span>
                </a>
                <a
                  href={`/api/download-custom-search-csv?sparql=${encodeURIComponent(sparqlQuery)}`}
                  download
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-[#ded5c6] rounded-none text-xs sm:text-sm font-medium text-emerald-700 hover:bg-[#f4ede2] transition-colors shadow-2xs whitespace-nowrap"
                >
                  <FileSpreadsheet className="w-4 h-4 shrink-0" />
                  <span>{t.common.exportCsv}</span>
                </a>
              </div>
            )}
          </div>

          {resultTree.length === 0 ? (
            <div className="bg-white rounded-none border border-[#e6dfd3] p-12 text-center text-sm text-[#736a5f]">
              {t.corpus.noResults}
            </div>
          ) : (
            /* Disposition en 3 colonnes équilibrées : Sommaire (3) / Lecture (6) / Annotations (3) */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:items-stretch lg:h-[calc(100vh-220px)] lg:min-h-[580px] lg:max-h-[850px]">
              {/* COLONNE 1 : Table des Matières du Sous-Corpus (3 cols = 25%) */}
              <aside className="lg:col-span-3 xl:col-span-3 h-full bg-white rounded-none border border-[#e6dfd3] shadow-xs flex flex-col overflow-hidden">
                <div className="p-3.5 sm:p-4 border-b border-[#f0eae0] bg-[#faf8f4] flex items-center justify-between gap-2 shrink-0">
                  <h3 className="font-serif font-bold text-sm sm:text-base text-[#2c2724] flex items-center space-x-2 min-w-0">
                    <ListOrdered className="w-4 h-4 text-[#9A6530] shrink-0" />
                    <span className="whitespace-nowrap">{t.corpus.subcorpusToc}</span>
                  </h3>
                  <span className="text-xs font-bold text-[#8c8275] bg-[#f0eae0] px-2.5 py-0.5 rounded-full shrink-0 whitespace-nowrap">
                    {resultTree.length} {resultTree.length > 1 ? 'œuvres' : 'œuvre'}
                  </span>
                </div>

                {/* Recherche rapide dans la TOC */}
                <div className="p-2.5 border-b border-[#f0eae0] shrink-0">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#8c8275]" />
                    <input
                      type="text"
                      value={tocFilter}
                      onChange={(e) => setTocFilter(e.target.value)}
                      placeholder={t.corpus.filterTocPlaceholder}
                      className="w-full pl-9 pr-3 py-1.5 rounded-none border border-[#e6dfd3] bg-[#fcfbf9] text-xs sm:text-sm text-[#2c2724] focus:outline-none focus:ring-2 focus:ring-[#9A6530]"
                    />
                  </div>
                </div>

                {/* Liste hiérarchique des œuvres et sections */}
                <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2 pb-12 scrollbar-thin">
                  {resultTree
                    .filter(
                      (w) =>
                        !tocFilter ||
                        w.title?.toLowerCase().includes(tocFilter.toLowerCase()) ||
                        w.author?.toLowerCase().includes(tocFilter.toLowerCase())
                    )
                    .map((workNode) => {
                      const isWorkActive = currentActiveWork?.uri === workNode.uri
                      const isWorkCollapsed = !!collapsedWorks[workNode.uri]
                      const totalWorkParas =
                        workNode.children?.reduce(
                          (acc: number, sec: any) => acc + (sec.children?.length || 0),
                          0
                        ) || 0

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
                            className={`w-full text-left p-2.5 rounded-none flex items-center justify-between transition-colors cursor-pointer border ${
                              isWorkActive
                                ? 'bg-[#f4ede2] border-[#ded5c6] font-semibold text-[#543b22] shadow-xs'
                                : 'bg-[#faf9f6] border-[#f0eae0] hover:bg-[#f4eee4] text-[#2c2724]'
                            }`}
                          >
                            <div className="flex items-start space-x-2 min-w-0 pr-1 flex-1">
                              <BookOpen className="w-4 h-4 text-[#9A6530] shrink-0 mt-0.5" />
                              <div className="min-w-0 flex-1">
                                <span className="block truncate font-serif text-sm font-bold text-[#2c2724] leading-snug">
                                  {workNode.title}
                                </span>
                                <span className="flex items-center space-x-1 text-xs text-[#736a5f] mt-0.5 truncate">
                                  <User className="w-3 h-3 shrink-0 text-[#9A6530]" />
                                  <span className="truncate">{workNode.author}</span>
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center space-x-1.5 shrink-0 ml-1">
                              <span className="inline-flex items-center justify-center text-center leading-none text-xs px-2 py-0.5 rounded-full bg-[#eaddcb] text-[#543b22] font-bold whitespace-nowrap">
                                {totalWorkParas}
                              </span>
                              <span
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setCollapsedWorks({
                                    ...collapsedWorks,
                                    [workNode.uri]: !isWorkCollapsed
                                  })
                                }}
                                className="p-1 hover:bg-black/5 rounded-none cursor-pointer"
                              >
                                {isWorkCollapsed ? (
                                  <ChevronRight className="w-4 h-4 text-[#8c8275]" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-[#8c8275]" />
                                )}
                              </span>
                            </div>
                          </button>

                          {/* Sections sous l'œuvre */}
                          {!isWorkCollapsed && (
                            <div className="pl-2 border-l-2 border-[#e6dfd3] space-y-1 ml-2 my-1">
                              {workNode.children?.map((sec: any) => {
                                const isSecActive =
                                  currentActiveSection?.uri === sec.uri && isWorkActive
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
                                      className={`w-full text-left px-2.5 py-1.5 rounded-none flex items-center justify-between text-xs sm:text-sm transition-colors cursor-pointer ${
                                        isSecActive
                                          ? 'bg-[#9A6530] text-white font-semibold shadow-xs'
                                          : 'text-[#544b41] hover:bg-[#f4eee4]'
                                      }`}
                                    >
                                      <span className="truncate font-medium flex-1 mr-1">
                                        {sec.title || `Section ${sec.id}`}
                                      </span>
                                      <div className="flex items-center space-x-1.5 shrink-0">
                                        <span
                                          className={`text-[11px] px-1.5 py-0.5 rounded-none font-bold whitespace-nowrap ${
                                            isSecActive
                                              ? 'bg-white/20 text-white'
                                              : 'bg-[#f0eae0] text-[#736a5f]'
                                          }`}
                                        >
                                          {sec.children?.length || 0}
                                        </span>
                                        <span
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setCollapsedSections({
                                              ...collapsedSections,
                                              [sec.uri]: !isSecCollapsed
                                            })
                                          }}
                                          className="p-0.5 rounded-none hover:bg-black/10 cursor-pointer"
                                        >
                                          {isSecCollapsed ? (
                                            <ChevronRight className="w-3.5 h-3.5" />
                                          ) : (
                                            <ChevronDown className="w-3.5 h-3.5" />
                                          )}
                                        </span>
                                      </div>
                                    </button>

                                    {/* Palette de puces/chips pour les paragraphes (§) */}
                                    {!isSecCollapsed && (
                                      <div className="p-2 bg-[#fdfcf9] rounded-none border border-[#ede5d8] my-1 ml-1.5">
                                        <div className="flex items-center justify-between pb-1 mb-1.5 border-b border-[#f0eae0] text-xs text-[#8c8275]">
                                          <span className="font-semibold uppercase tracking-wider text-[10px] text-[#63503d]">Passages (§)</span>
                                          <span className="text-[10px] font-medium">{sec.children?.length || 0} extraits</span>
                                        </div>
                                        <div className="flex flex-wrap gap-1 max-h-48 overflow-y-auto scrollbar-thin pr-0.5">
                                          {sec.children?.map((p: any) => {
                                            const isParaActive = activeParagraphUri === p.uri
                                            const isHovering = hoveredConcept !== null
                                            const hasInspectedP = activeInspectionConcept !== null && activeInspectionParagraphUris.has(p.uri)
                                            const isHoveredP = isHovering && hasInspectedP
                                            const isPinnedP = !isHovering && !!pinnedConcept && hasInspectedP

                                            return (
                                              <button
                                                key={p.uri}
                                                type="button"
                                                onClick={() => {
                                                  setActiveWorkUri(workNode.uri)
                                                  setActiveSectionUri(sec.uri)
                                                  handleFocusParagraph(p.uri)
                                                }}
                                                className={`px-2 py-1 rounded-none text-xs font-mono font-bold transition-all cursor-pointer border ${
                                                  isParaActive
                                                    ? 'bg-[#9A6530] text-white border-[#855424] shadow-xs ring-1 ring-[#9A6530]/40'
                                                    : isHoveredP
                                                      ? `${CATEGORY_TOC_HOVER[activeInspectionCategory] || CATEGORY_TOC_HOVER.general} shadow-2xs`
                                                      : isPinnedP
                                                        ? `${CATEGORY_TOC_PINNED[activeInspectionCategory] || CATEGORY_TOC_PINNED.general} shadow-2xs`
                                                        : 'bg-white text-[#543b22] border-[#ded5c6] hover:bg-[#f4ede2] hover:border-[#9A6530]/50'
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
              <main className="lg:col-span-6 xl:col-span-6 h-full bg-white rounded-none border border-[#e6dfd3] shadow-xs flex flex-col overflow-hidden">
                {/* En-tête de lecture */}
                <div className="p-3.5 sm:p-4 border-b border-[#f0eae0] bg-[#faf8f4] flex items-center justify-between gap-3 shrink-0">
                  <div className="min-w-0 flex-1">
                    <h2 className="font-serif font-bold text-base sm:text-lg md:text-xl text-[#2c2724] truncate">
                      {currentActiveWork?.title || 'Lecture du sous-corpus'}
                    </h2>
                    <span className="text-xs sm:text-sm text-[#736a5f] truncate block">
                      {currentActiveWork?.author} •{' '}
                      {currentActiveSection?.title || `Section ${currentActiveSection?.id || 1}`}
                    </span>
                  </div>

                  {/* Contrôleur de taille du texte */}
                  <div className="flex items-center space-x-1 bg-[#faf9f6] p-1 rounded-none border border-[#e6dfd3] shrink-0">
                    <button
                      type="button"
                      onClick={() => setTextSize('normal')}
                      className={`px-2.5 py-1 text-xs sm:text-sm font-serif rounded-none transition-colors cursor-pointer ${
                        textSize === 'normal'
                          ? 'bg-[#9A6530] text-white font-bold shadow-xs'
                          : 'text-[#543b22] hover:bg-[#eaddcb]'
                      }`}
                      title="Texte normal"
                    >
                      A
                    </button>
                    <button
                      type="button"
                      onClick={() => setTextSize('large')}
                      className={`px-2.5 py-1 text-xs sm:text-sm font-serif rounded-none transition-colors cursor-pointer ${
                        textSize === 'large'
                          ? 'bg-[#9A6530] text-white font-bold shadow-xs'
                          : 'text-[#543b22] hover:bg-[#eaddcb]'
                      }`}
                      title="Texte grand"
                    >
                      A+
                    </button>
                    <button
                      type="button"
                      onClick={() => setTextSize('xlarge')}
                      className={`px-2.5 py-1 text-xs sm:text-sm font-serif rounded-none transition-colors cursor-pointer ${
                        textSize === 'xlarge'
                          ? 'bg-[#9A6530] text-white font-bold shadow-xs'
                          : 'text-[#543b22] hover:bg-[#eaddcb]'
                      }`}
                      title="Texte très grand"
                    >
                      A++
                    </button>
                  </div>
                </div>

                {/* Paragraphes de la section active */}
                <div id="subcorpus-reading-pane" className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-5 pb-24 scrollbar-thin">
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
                        idx={idx}
                        isCurrentPara={activeParagraphUri === p.uri}
                        referenceMap={referenceAnnotations[p.uri]}
                        stagedList={stagedAnnotations}
                        inspectionState={inspectionState}
                        textSize={textSize}
                        onClick={() => setActiveParagraphUri(p.uri)}
                        activeParagraphText={t.work.activeParagraph}
                      />
                    ))
                  )}
                </div>
              </main>

              {/* COLONNE 3 : Panneau des Concepts & Annotations (3 cols = 25%) */}
              <aside className="lg:col-span-3 xl:col-span-3 h-full bg-white rounded-none border border-[#e6dfd3] shadow-xs flex flex-col overflow-hidden">
                <div className="p-3.5 sm:p-4 border-b border-[#f0eae0] bg-[#faf8f4] flex items-center justify-between gap-2 shrink-0">
                  <h3 className="font-serif font-bold text-sm sm:text-base text-[#2c2724] flex items-center space-x-2 min-w-0">
                    <Sparkles className="w-4 h-4 text-[#9A6530] shrink-0" />
                    <span className="whitespace-nowrap">{t.corpus.subcorpusAnnotations}</span>
                  </h3>
                  <span className="inline-flex items-center justify-center text-center leading-none text-xs font-bold text-[#9A6530] bg-amber-100 px-2.5 py-1 rounded-full border border-amber-300 shrink-0 whitespace-nowrap">
                    {Object.keys(activeAnnotations).length} {Object.keys(activeAnnotations).length > 1 ? 'concepts' : 'concept'}
                  </span>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-3 pb-24 scrollbar-thin text-sm">
                  {!activeParagraphUri ? (
                    <div className="p-6 text-center text-sm text-[#8c8275] italic">
                      {t.corpus.selectParagraphHint}
                    </div>
                  ) : isAnnotationsLoading ? (
                    <div className="p-8 text-center space-y-2">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#9A6530]" />
                      <p className="text-sm text-[#8c8275]">Chargement des concepts annotés...</p>
                    </div>
                  ) : Object.keys(activeAnnotations).length === 0 ? (
                    <div className="p-6 text-center text-sm text-[#8c8275] bg-[#faf9f6] rounded-none border border-dashed border-[#e6dfd3]">
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
                          className={`p-3 sm:p-3.5 rounded-none border transition-all text-sm space-y-2 cursor-pointer ${
                            isPinned
                              ? 'border-[#9A6530] bg-[#fdf7ee] ring-2 ring-amber-500 shadow-sm'
                              : isHovered
                                ? 'border-[#9A6530] bg-[#f4ede2] shadow-xs ring-1 ring-[#9A6530]'
                                : 'border-[#f0eae0] bg-[#fcfbf9] hover:bg-[#faf9f6]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-1.5">
                            <div className="flex items-start space-x-2.5 min-w-0 flex-1">
                              <div className="mt-0.5 shrink-0">
                                <ConceptCategoryIcon
                                  category={item.category}
                                  collection={item.collection}
                                  label={item.label}
                                  uri={item.concept}
                                  className="w-4.5 h-4.5"
                                />
                              </div>
                              <div className="relative group/label min-w-0 flex-1">
                                <span
                                  className="font-semibold text-sm sm:text-base text-[#2c2724] leading-snug break-words block group-hover/label:text-[#9A6530] transition-colors"
                                  title={item.label}
                                >
                                  {displayLabel}
                                  {isPinned && <span className="ml-1.5 text-xs inline-block" title="Annotation épinglée">📌</span>}
                                </span>

                                {/* Popup flottant automatique au survol si label long (>22 caractères) */}
                                {item.label && item.label.length > 22 && (
                                  <div className="hidden group-hover/label:flex flex-col absolute left-0 bottom-full mb-2 z-50 w-72 sm:w-88 p-3 bg-[#241f1c] text-[#fbf9f5] rounded-none shadow-2xl border border-[#4a4038] text-xs space-y-1.5 pointer-events-none">
                                    <div className="flex items-center space-x-1.5 text-amber-400 font-semibold text-[11px]">
                                      <Sparkles className="w-3.5 h-3.5 shrink-0" />
                                      <span>Libellé complet TheZoo</span>
                                    </div>
                                    <p className="font-bold text-sm text-white leading-snug break-words">
                                      {item.label}
                                    </p>
                                    {item.collection && (
                                      <p className="text-[11px] text-[#cfc5b4]">
                                        Collection : <span className="text-white font-medium">{item.collection}</span>
                                      </p>
                                    )}
                                    <div className="pt-1 border-t border-white/10 flex items-center justify-between text-[10px] text-[#9c9183]">
                                      <span className="font-mono">{formatConceptId(item.concept)}</span>
                                      {item.offset && item.offset.length > 0 && (
                                        <span>{item.offset.length} occurrence(s)</span>
                                      )}
                                    </div>
                                    {/* Flèche du tooltip vers le bas */}
                                    <div className="absolute left-6 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-[#241f1c]" />
                                  </div>
                                )}

                                <div className="mt-1 flex flex-wrap gap-1">
                                  <ConceptCategoryBadge
                                    category={item.category}
                                    collection={item.collection}
                                    label={item.label}
                                    uri={item.concept}
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
                              className="text-[#8c8275] hover:text-[#9A6530] p-1 shrink-0 transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>

                          <div className="flex items-center justify-between text-xs text-[#8c8275] pt-1.5 border-t border-[#f0eae0]/60 gap-2">
                            <span className="font-mono text-[11px] truncate min-w-0 flex-1 text-[#8c8275]" title={item.concept}>
                              {formatConceptId(item.concept)}
                            </span>
                            {item.offset && item.offset.length > 0 && (
                              <span className="inline-flex items-center justify-center text-center leading-none px-2 py-0.5 rounded-full bg-[#f0eae0] font-semibold text-[#543b22] text-[11px] shrink-0 whitespace-nowrap">
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
