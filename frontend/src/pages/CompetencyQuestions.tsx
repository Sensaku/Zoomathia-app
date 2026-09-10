import React, { useState, useMemo, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchQCList, fetchQC, fetchQCSpo } from '../api/client'
import { VenusViewer } from '../components/visualization/VenusViewer'
import { SparqlHighlighter } from '../components/common/SparqlHighlighter'
import { parseCitation } from '../utils/citation'
import {
  Table as TableIcon,
  Network,
  FileSpreadsheet,
  FileCode,
  AlertCircle,
  Loader2,
  Code2,
  Copy,
  Check,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Layers,
  Sparkles,
  BookOpen,
  Compass,
  History,
  X,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Info,
  Quote,
  HelpCircle,
} from 'lucide-react'
import { useI18n } from '../i18n'

/**
 * Traduction et clarification des noms de colonnes SPARQL
 */
const getColumnLabel = (col: string, lang: 'fr' | 'en' = 'fr'): string => {
  const map: Record<string, { fr: string; en: string }> = {
    paragraph: { fr: 'Passage antique', en: 'Ancient passage' },
    name_animal: { fr: 'Animal / Espèce', en: 'Animal / Species' },
    animal_name: { fr: 'Animal / Espèce', en: 'Animal / Species' },
    name_construction: { fr: 'Habitat / Nidification', en: 'Habitat / Nesting' },
    name_relation: { fr: 'Relation / Interaction', en: 'Relation / Interaction' },
    name_anthroponym: { fr: 'Personnage historique / mythologique', en: 'Historical / Mythological figure' },
    mention_animal: { fr: 'Extrait textuel (animal)', en: 'Text quote (animal)' },
    mention_social: { fr: 'Extrait (communication)', en: 'Text quote (communication)' },
    name_conso: { fr: 'Usage culinaire', en: 'Culinary usage' },
    mention_conso: { fr: 'Extrait (consommation)', en: 'Text quote (consumption)' },
    name_use: { fr: 'Usage technique', en: 'Technical usage' },
    mention_use: { fr: 'Extrait (usage)', en: 'Text quote (usage)' },
    name_part: { fr: 'Partie anatomique', en: 'Anatomical part' },
    gestation: { fr: 'Gestation / Incubation', en: 'Gestation / Incubation' },
    mention_gestation: { fr: 'Extrait (gestation)', en: 'Text quote (gestation)' },
    mention_pregnancy: { fr: 'Extrait (gestation)', en: 'Text quote (gestation)' },
    name_authority: { fr: 'Autorité antique citée', en: 'Ancient authority cited' },
    name_period: { fr: 'Période historique', en: 'Historical period' },
    name_place: { fr: 'Lieu géographique', en: 'Geographic place' },
    name_environment: { fr: 'Phénomène / Environnement', en: 'Phenomenon / Environment' },
    name_ethology: { fr: 'Comportement éthologique', en: 'Ethological behavior' },
    name_relationship: { fr: 'Activité / Relation humaine', en: 'Human activity / Relation' },
  }
  return map[col.toLowerCase()]?.[lang] || col
}


export const CompetencyQuestions: React.FC = () => {
  const { t, language } = useI18n()
  const navigate = useNavigate()

  const [selectedQCId, setSelectedQCId] = useState<number>(1)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'graph' | 'table'>('graph')
  const [showSparql, setShowSparql] = useState(false)
  const [copiedSparql, setCopiedSparql] = useState(false)
  const [nodeLimit, setNodeLimit] = useState<number>(25)
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null)

  // États pour la table de données interactive
  const [tableSearch, setTableSearch] = useState('')
  const [sortCol, setSortCol] = useState<number | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)

  // 1. Chargement de la liste des questions
  const { data: qcList = [], isLoading: isListLoading } = useQuery({
    queryKey: ['qcList'],
    queryFn: fetchQCList,
  })

  // 2. Chargement des données tabulaires SPARQL pour la question sélectionnée
  const { data: qcData, isLoading: isQCLoading, error: qcError } = useQuery({
    queryKey: ['qcData', selectedQCId],
    queryFn: () => fetchQC(selectedQCId),
    enabled: !!selectedQCId,
  })

  // 3. Chargement des données SPO pour le composant VENUS
  const { data: spoData, isLoading: isSpoLoading } = useQuery({
    queryKey: ['qcSpo', selectedQCId],
    queryFn: () => fetchQCSpo(selectedQCId),
    enabled: !!selectedQCId && viewMode === 'graph',
  })

  // Question active
  const currentQC = qcList.find((q) => q.id === selectedQCId)

  // Catégories thématiques de recherche
  const categories = useMemo(() => [
    { id: 'all', label: t.cqs.allCategories, icon: Layers },
    { id: 'ethology', label: t.cqs.catEthology, icon: Sparkles },
    { id: 'human_animal', label: t.cqs.catHumanAnimal, icon: BookOpen },
    { id: 'transmission_history', label: t.cqs.catTransmission, icon: History },
    { id: 'geography_environment', label: t.cqs.catGeography, icon: Compass },
  ], [t])

  // Filtrage des questions selon la catégorie choisie
  const filteredQcList = useMemo(() => {
    if (selectedCategory === 'all') return qcList
    return qcList.filter((q) => q.category === selectedCategory)
  }, [qcList, selectedCategory])

  // Changement de catégorie avec sélection automatique de la première question correspondante
  const handleCategoryChange = (catId: string) => {
    setSelectedCategory(catId)
    const matching = catId === 'all' ? qcList : qcList.filter((q) => q.category === catId)
    if (matching.length > 0 && !matching.some((q) => q.id === selectedQCId)) {
      setSelectedQCId(matching[0].id)
      setSelectedEntity(null)
    }
  }

  // Sélection d'entité stabilisée pour éviter tout re-render du canvas VENUS
  const handleSelectEntity = useCallback((entityName: string) => {
    setSelectedEntity(entityName)
  }, [])

  // Copie de la requête SPARQL dans le presse-papiers
  const handleCopySparql = () => {
    if (!qcData?.query) return
    navigator.clipboard.writeText(qcData.query)
    setCopiedSparql(true)
    setTimeout(() => setCopiedSparql(false), 2000)
  }

  // Ouverture de la requête dans le Playground SPARQL
  const handleOpenInPlayground = () => {
    if (!qcData?.query) return
    navigate('/sparql', {
      state: {
        queryText: qcData.query,
        title: currentQC ? `QC ${currentQC.id} - ${currentQC.title}` : 'Requête QC',
      },
    })
  }

  // Analyse des occurrences de l'entité sélectionnée pour le panneau d'inspection
  const inspectedEntityData = useMemo(() => {
    if (!selectedEntity || !qcData?.table?.data) return null

    const columns = qcData.table.columns || []
    const paraColIdx = columns.findIndex((c) => c.toLowerCase().includes('paragraph') || c.toLowerCase() === 'p')

    const matchedRows = qcData.table.data.filter((row) =>
      row.some((cell) => cell.toLowerCase() === selectedEntity.toLowerCase())
    )

    const relatedEntities = new Set<string>()
    const paragraphs = new Set<string>()

    for (const row of matchedRows) {
      for (let i = 0; i < row.length; i++) {
        if (i === paraColIdx) {
          if (row[i]) paragraphs.add(row[i].trim())
        } else if (row[i] && row[i].toLowerCase() !== selectedEntity.toLowerCase()) {
          relatedEntities.add(row[i].trim())
        }
      }
    }

    return {
      entity: selectedEntity,
      totalMentions: matchedRows.length,
      relatedEntities: Array.from(relatedEntities),
      paragraphs: Array.from(paragraphs),
    }
  }, [selectedEntity, qcData])

  // Filtrage et tri de la table de données
  const filteredAndSortedTableData = useMemo(() => {
    if (!qcData?.table?.data) return []

    let rows = qcData.table.data

    if (tableSearch.trim()) {
      const q = tableSearch.toLowerCase()
      rows = rows.filter((row) => row.some((cell) => cell.toLowerCase().includes(q)))
    }

    if (sortCol !== null) {
      rows = [...rows].sort((a, b) => {
        const valA = a[sortCol] || ''
        const valB = b[sortCol] || ''
        const cmp = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' })
        return sortDirection === 'asc' ? cmp : -cmp
      })
    }

    return rows
  }, [qcData, tableSearch, sortCol, sortDirection])

  // Pagination de la table
  const paginatedTableData = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredAndSortedTableData.slice(start, start + pageSize)
  }, [filteredAndSortedTableData, currentPage, pageSize])

  const totalPages = Math.ceil(filteredAndSortedTableData.length / pageSize) || 1

  const handleSort = (colIdx: number) => {
    if (sortCol === colIdx) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(colIdx)
      setSortDirection('asc')
    }
  }

  const questionTitle = language === 'fr' && currentQC?.title_fr ? currentQC.title_fr : currentQC?.title

  return (
    <div className="space-y-6 py-6 max-w-[1720px] mx-auto px-2 sm:px-4">
      
      {/* 1. Carte En-tête & Sélection Scientifique */}
      <div className="bg-white rounded-none border border-[#ded5c6] shadow-xs p-5 md:p-6 space-y-5">
        
        {/* Titre de la page & Sélecteur de vue */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-none bg-[#9A6530]/10 text-[#9A6530] text-xs font-semibold uppercase tracking-wider border border-[#9A6530]/20">
                Corpus Ancien & SPARQL
              </span>
              <span className="text-xs text-[#8c8275]">• Zoomathia Benchmark</span>
            </div>
            <h1 className="font-serif text-2xl md:text-3xl font-bold text-[#2c2724] mt-1">
              {t.cqs.title}
            </h1>
            <p className="text-xs md:text-sm text-[#696156] mt-0.5">
              {t.cqs.subtitle}
            </p>
          </div>

          {/* Sélecteur de mode de vue (Graphe VENUS vs Tableau) */}
          <div className="flex items-center space-x-1 bg-[#f4ede2] p-1 rounded-none border border-[#ded5c6] self-start lg:self-auto shadow-inner">
            <button
              onClick={() => setViewMode('graph')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-none text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'graph'
                  ? 'bg-white text-[#9A6530] shadow-xs border border-[#ded5c6]'
                  : 'text-[#696156] hover:text-[#2c2724]'
              }`}
              type="button"
            >
              <Network className="w-4 h-4 text-[#9A6530]" />
              <span>{t.cqs.graphView}</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-none text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-white text-[#9A6530] shadow-xs border border-[#ded5c6]'
                  : 'text-[#696156] hover:text-[#2c2724]'
              }`}
              type="button"
            >
              <TableIcon className="w-4 h-4 text-[#2563eb]" />
              <span>{t.cqs.tableView}</span>
            </button>
          </div>
        </div>

        {/* 1. Zone de Filtrage Thématique */}
        <div className="pt-3 border-t border-[#f0eae0] space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#736a5f] flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[#9A6530]" />
                {t.cqs.filterByThemeLabel}
              </span>
              <p className="text-[11px] text-[#8c8275]">
                {t.cqs.filterByThemeDesc}
              </p>
            </div>
            {selectedCategory !== 'all' && (
              <button
                type="button"
                onClick={() => handleCategoryChange('all')}
                className="text-xs text-[#9A6530] hover:text-[#73471c] font-semibold underline flex items-center gap-1 cursor-pointer self-start sm:self-auto"
              >
                <X className="w-3.5 h-3.5" />
                <span>{t.cqs.clearFilter.replace('{total}', String(qcList.length))}</span>
              </button>
            )}
          </div>

          {/* Pilules des Catégories Thématiques */}
          <div className="flex flex-wrap items-center gap-2">
            {categories.map((cat) => {
              const Icon = cat.icon
              const isSelected = selectedCategory === cat.id
              const count = cat.id === 'all'
                ? qcList.length
                : qcList.filter((q) => q.category === cat.id).length

              return (
                <button
                  key={cat.id}
                  onClick={() => handleCategoryChange(cat.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-none text-xs font-medium transition-all border cursor-pointer ${
                    isSelected
                      ? 'bg-[#9A6530] text-white border-[#9A6530] shadow-xs font-semibold'
                      : 'bg-[#faf9f6] text-[#696156] border-[#ded5c6] hover:border-[#9A6530]/50 hover:bg-[#f4ede2] hover:text-[#2c2724]'
                  }`}
                  type="button"
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{cat.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-semibold ${
                    isSelected ? 'bg-white/30 text-white' : 'bg-[#eae3d5] text-[#595248]'
                  }`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Bannière explicative quand un filtre thématique est actif */}
          {selectedCategory !== 'all' && (
            <div className="p-2.5 bg-amber-50/90 border border-amber-200 rounded-none text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  {t.cqs.activeFilterNotice
                    .replace('{category}', categories.find((c) => c.id === selectedCategory)?.label || selectedCategory)
                    .replace('{count}', String(filteredQcList.length))
                    .replace('{total}', String(qcList.length))}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCategoryChange('all')}
                className="text-xs text-[#9A6530] hover:text-[#73471c] font-bold underline shrink-0 cursor-pointer self-start sm:self-auto"
              >
                {t.cqs.clearFilter.replace('{total}', String(qcList.length))}
              </button>
            </div>
          )}
        </div>

        {/* 2. Sélecteur Déroulant de la Question */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between">
            <label htmlFor="qc-select" className="block text-xs font-bold uppercase tracking-wider text-[#736a5f]">
              {t.cqs.selectPrompt}
            </label>
            <span className="text-[11px] text-[#8c8275] font-mono">
              {selectedCategory === 'all'
                ? `QC ${selectedQCId} / ${qcList.length}`
                : `QC ${selectedQCId} (${filteredQcList.length} dans cette thématique)`}
            </span>
          </div>

          {isListLoading ? (
            <div className="h-11 bg-[#f4ede2] rounded-none animate-pulse w-full"></div>
          ) : (
            <select
              id="qc-select"
              value={selectedQCId}
              onChange={(e) => {
                const val = e.target.value
                if (val === '__ALL__') {
                  handleCategoryChange('all')
                  return
                }
                const newId = Number(val)
                setSelectedQCId(newId)
                setSelectedEntity(null)
                setCurrentPage(1)
                const q = qcList.find((item) => item.id === newId)
                if (q && selectedCategory !== 'all' && q.category !== selectedCategory) {
                  setSelectedCategory(q.category || 'all')
                }
              }}
              className="w-full p-3 rounded-lg border border-[#cfc5b4] bg-[#fdfbf7] text-[#2c2724] font-semibold text-sm md:text-base focus:ring-2 focus:ring-[#9A6530] focus:border-[#9A6530] focus:outline-none transition-all shadow-2xs cursor-pointer"
            >
              {selectedCategory === 'all' ? (
                // Organisation avec optgroup par thématique pour clarté maximale
                categories
                  .filter((c) => c.id !== 'all')
                  .map((cat) => {
                    const catQuestions = qcList.filter((q) => q.category === cat.id)
                    if (catQuestions.length === 0) return null
                    return (
                      <optgroup key={cat.id} label={`${cat.label} (${catQuestions.length})`}>
                        {catQuestions.map((qc) => {
                          const label = language === 'fr' && qc.title_fr ? qc.title_fr : qc.title
                          return (
                            <option key={qc.id} value={qc.id}>
                              QC {qc.id} : {label}
                            </option>
                          )
                        })}
                      </optgroup>
                    )
                  })
              ) : (
                // Affichage des questions de la thématique + option d'affichage global
                <>
                  {filteredQcList.map((qc) => {
                    const label = language === 'fr' && qc.title_fr ? qc.title_fr : qc.title
                    return (
                      <option key={qc.id} value={qc.id}>
                        QC {qc.id} : {label}
                      </option>
                    )
                  })}
                  <option value="__ALL__">
                    {t.cqs.seeAllQuestionsOption.replace('{total}', String(qcList.length))}
                  </option>
                </>
              )}
            </select>
          )}
        </div>

        {/* Carte de Contexte Scientifique & Accordéon SPARQL */}
        {currentQC && (
          <div className="rounded-none bg-[#faf8f3] border border-[#e8dfcf] p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-none bg-[#9A6530]/10 text-[#9A6530] shrink-0 mt-0.5">
                  <Quote className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <h2 className="font-serif text-base md:text-lg font-bold text-[#3a322b] leading-tight">
                    {questionTitle}
                  </h2>
                  {currentQC.title && language === 'fr' && currentQC.title_fr && (
                    <p className="text-xs text-[#7d7365] italic">
                      Original: "{currentQC.title}"
                    </p>
                  )}
                  <p className="text-xs md:text-sm text-[#595248] leading-relaxed pt-1">
                    <strong className="text-[#855424] font-semibold">{t.cqs.scientificGoal} :</strong>{' '}
                    {currentQC.goal || 'Identification et mise en relation des entités et relations annotées dans le corpus.'}
                  </p>
                </div>
              </div>

              {/* Bouton pour déplier le code SPARQL */}
              <button
                onClick={() => setShowSparql(!showSparql)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#9A6530] hover:text-[#855424] shrink-0 px-3 py-1.5 rounded-none border border-[#9A6530]/30 bg-white hover:bg-[#f8f4ec] transition-all shadow-2xs cursor-pointer self-start sm:self-auto"
                type="button"
              >
                <Code2 className="w-3.5 h-3.5 text-[#9A6530]" />
                <span>{showSparql ? t.cqs.hideSparql : t.cqs.showSparql}</span>
                {showSparql ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Accordéon avec le code SPARQL propre */}
            {showSparql && qcData?.query && (
              <div className="mt-3 pt-3 border-t border-[#e2d7c5] space-y-2 animate-in fade-in duration-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#6d6356]">
                      qc{selectedQCId}.rq
                    </span>
                    <span className="text-[11px] text-[#8c8275]">
                      (Requête officielle Zoomathia)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopySparql}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-[#ded5c6] rounded-none text-xs font-medium hover:bg-[#f4ede2] transition-colors cursor-pointer shadow-2xs"
                      title="Copier la requête SPARQL"
                      type="button"
                    >
                      {copiedSparql ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-700 font-semibold">{t.cqs.copied}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-[#736a5f]" />
                          <span>{t.cqs.copySparql}</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleOpenInPlayground}
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#9A6530] text-white rounded-none text-xs font-semibold hover:bg-[#855424] transition-colors shadow-2xs cursor-pointer"
                      title="Ouvrir dans le Playground SPARQL interactif"
                      type="button"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>{t.cqs.openInPlayground}</span>
                    </button>
                  </div>
                </div>
                <SparqlHighlighter
                  code={qcData.query}
                  maxHeight="max-h-64"
                  showLineNumbers={true}
                  copyable={false}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Barre d'outils secondaire & Export */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-[#736a5f] px-1">
        <div className="flex items-center gap-3">
          {qcData?.table?.data ? (
            <span className="px-3 py-1 rounded-none bg-[#f4ede2] border border-[#ded5c6] font-medium text-[#2c2724]">
              <strong>{qcData.table.data.length}</strong> {t.cqs.resultsFound}
            </span>
          ) : (
            <span className="text-[#8c8275]">{t.common.loading}</span>
          )}

          {selectedEntity && (
            <button
              onClick={() => setSelectedEntity(null)}
              className="inline-flex items-center gap-1.5 text-xs text-[#9A6530] bg-[#fbf7f0] px-2.5 py-1 rounded-none border border-[#9A6530]/40 hover:bg-[#f4ede2] transition-colors cursor-pointer font-medium"
              type="button"
            >
              <span>Focus : <strong>{selectedEntity}</strong></span>
              <X className="w-3 h-3 text-[#9A6530]" />
            </button>
          )}
        </div>

        {/* Boutons d'export des données */}
        <div className="flex items-center space-x-2 self-end sm:self-auto">
          <a
            href={`/api/download-qc-json?id=${selectedQCId}`}
            download
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-[#ded5c6] rounded-none text-xs font-medium text-[#2c2724] hover:bg-[#f4ede2] transition-colors shadow-2xs"
          >
            <FileCode className="w-3.5 h-3.5 text-[#3b6ea5]" />
            <span>{t.common.exportJson}</span>
          </a>
          <a
            href={`/api/download-qc-csv?id=${selectedQCId}`}
            download
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-[#ded5c6] rounded-none text-xs font-medium text-[#2c2724] hover:bg-[#f4ede2] transition-colors shadow-2xs"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>{t.common.exportCsv}</span>
          </a>
        </div>
      </div>

      {/* 3. Contenu Dynamique Principal */}
      {isQCLoading || isSpoLoading ? (
        <div className="bg-white rounded-none border border-[#ded5c6] p-16 flex flex-col items-center justify-center space-y-3 shadow-xs">
          <Loader2 className="w-8 h-8 text-[#9A6530] animate-spin" />
          <p className="text-sm font-semibold text-[#736a5f]">{t.cqs.loadingData}</p>
        </div>
      ) : qcError ? (
        <div className="bg-red-50 rounded-none border border-red-200 p-6 flex items-start space-x-3 text-red-700">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-sm">{t.cqs.errorExecuting}</h4>
            <p className="text-xs mt-1">{(qcError as Error).message}</p>
          </div>
        </div>
      ) : viewMode === 'graph' ? (
        /* VUE GRAPHE RELATIONNEL (VENUS) AVEC PANNEAU D'INSPECTION DÉTAILLÉ */
        <div className="flex flex-col lg:flex-row gap-5 items-start">
          <div className="flex-1 min-w-0 w-full">
            <VenusViewer
              spoData={spoData}
              title={currentQC?.vizuTitle}
              nodeLimit={nodeLimit}
              onNodeLimitChange={setNodeLimit}
              onSelectEntity={handleSelectEntity}
              selectedEntityName={selectedEntity}
            />
          </div>

          {/* Panneau d'Inspection Latéral */}
          {inspectedEntityData ? (
            <div className="w-full lg:w-96 shrink-0 bg-white rounded-none border border-[#ded5c6] shadow-xs p-4 space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between pb-3 border-b border-[#f0eae0]">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-3.5 h-3.5 rounded-none bg-[#2563eb] shrink-0"></span>
                  <h3 className="font-serif font-bold text-base text-[#2c2724] truncate">
                    {inspectedEntityData.entity}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedEntity(null)}
                  className="p-1 text-[#8c8275] hover:text-[#2c2724] hover:bg-[#f4ede2] rounded-none transition-colors cursor-pointer"
                  title={t.cqs.closePanel}
                  type="button"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Statistiques d'occurrences */}
              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                <div className="p-2.5 bg-[#faf8f5] rounded-none border border-[#ebe4d6]">
                  <span className="block font-bold text-[#9A6530] text-base">
                    {inspectedEntityData.totalMentions}
                  </span>
                  <span className="text-[11px] text-[#736a5f]">Mentions / Liens</span>
                </div>
                <div className="p-2.5 bg-[#faf8f5] rounded-none border border-[#ebe4d6]">
                  <span className="block font-bold text-[#2563eb] text-base">
                    {inspectedEntityData.paragraphs.length}
                  </span>
                  <span className="text-[11px] text-[#736a5f]">Passages Textuels</span>
                </div>
              </div>

              {/* Entités Co-occurrentes (Pivot interactif) */}
              {inspectedEntityData.relatedEntities.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#736a5f]">
                    {t.cqs.relatedTo} :
                  </h4>
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto scrollbar-thin pr-1">
                    {inspectedEntityData.relatedEntities.map((rel, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedEntity(rel)}
                        className="px-2.5 py-1 text-xs rounded-none bg-[#f4ede2] text-[#595248] hover:bg-[#9A6530] hover:text-white transition-colors border border-[#ded5c6] cursor-pointer"
                        type="button"
                      >
                        {rel}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Citations des passages textuels dans le corpus */}
              <div className="space-y-2 pt-2 border-t border-[#f0eae0]">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#736a5f] flex items-center justify-between">
                  <span>{t.cqs.occurrences} :</span>
                  <span className="text-[11px] font-normal text-[#8c8275]">
                    ({inspectedEntityData.paragraphs.length})
                  </span>
                </h4>

                <div className="space-y-2 max-h-80 overflow-y-auto scrollbar-thin pr-1">
                  {inspectedEntityData.paragraphs.length === 0 ? (
                    <p className="text-xs text-[#8c8275] italic">
                      Aucune référence textuelle directe identifiée.
                    </p>
                  ) : (
                    inspectedEntityData.paragraphs.map((paraUri, idx) => {
                      const citation = parseCitation(paraUri)

                      return (
                        <div
                          key={idx}
                          className="p-3 rounded-none border border-[#ded5c6] bg-[#fdfbf7] hover:bg-white hover:border-[#9A6530]/50 transition-all space-y-2 shadow-2xs"
                        >
                          <div className="space-y-0.5">
                            {citation.isZoomathiaUri ? (
                              <>
                                <span className="inline-block px-1.5 py-0.5 rounded-none text-[10px] font-semibold bg-[#2563eb]/10 text-[#2563eb] border border-[#2563eb]/20">
                                  {citation.author}
                                </span>
                                <p className="text-xs font-medium text-[#2c2724]">
                                  {citation.work} ({citation.book}, {citation.section})
                                </p>
                              </>
                            ) : (
                              <p className="text-xs font-mono text-[#3b6ea5] break-all">
                                {citation.displayLabel}
                              </p>
                            )}
                          </div>
                          
                          <div className="pt-1 flex justify-end">
                            <Link
                              to={`/explore-work?uri=${encodeURIComponent(paraUri.trim())}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-semibold text-[#9A6530] hover:text-[#855424] hover:underline"
                            >
                              <span>{t.cqs.readInWork}</span>
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="hidden lg:flex w-80 shrink-0 p-6 bg-[#fcfbf9] rounded-none border border-dashed border-[#ded5c6] text-xs text-[#8c8275] space-y-3 text-center flex-col items-center justify-center self-stretch">
              <div className="p-3 rounded-none bg-[#f4ede2] text-[#9A6530]">
                <HelpCircle className="w-6 h-6" />
              </div>
              <p className="font-semibold text-sm text-[#595248]">
                Inspection Interactive
              </p>
              <p className="leading-relaxed text-xs">
                {t.cqs.selectNodeHint}
              </p>
            </div>
          )}
        </div>
      ) : (
        /* VUE TABULAIRE ÉLÉGANTE ET ANALYTIQUE */
        <div className="bg-white rounded-none border border-[#ded5c6] shadow-xs overflow-hidden space-y-4 p-5">
          {/* Barre de recherche et paramètres du tableau */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-[#f0eae0]">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#8c8275]" />
              <input
                type="text"
                value={tableSearch}
                onChange={(e) => {
                  setTableSearch(e.target.value)
                  setCurrentPage(1)
                }}
                placeholder={t.cqs.searchTablePlaceholder}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-none border border-[#ded5c6] bg-[#faf9f6] focus:outline-none focus:ring-2 focus:ring-[#9A6530] transition-all shadow-2xs"
              />
            </div>

            {/* Sélecteur de pagination */}
            <div className="flex items-center gap-2 text-xs text-[#736a5f]">
              <span className="font-medium">{t.cqs.rowsPerPage}</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setCurrentPage(1)
                }}
                className="px-2.5 py-1 text-xs rounded-none border border-[#ded5c6] bg-[#faf9f6] focus:outline-none text-[#2c2724] font-semibold cursor-pointer shadow-2xs"
              >
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          {/* Tableau des Données */}
          <div className="overflow-x-auto max-h-[640px] rounded-none border border-[#ded5c6]">
            <table className="w-full text-left text-sm text-[#2c2724] border-collapse">
              <thead className="bg-[#f4ede2] text-[#595248] sticky top-0 border-b border-[#ded5c6] z-10 shadow-xs">
                <tr>
                  {qcData?.table?.columns.map((col, idx) => (
                    <th
                      key={idx}
                      onClick={() => handleSort(idx)}
                      className="p-3.5 font-bold text-xs uppercase tracking-wider border-r border-[#ded5c6]/60 last:border-r-0 cursor-pointer hover:bg-[#ebe1d0] transition-colors select-none"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span>{getColumnLabel(col, language as 'fr' | 'en')}</span>
                        {sortCol === idx ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp className="w-3.5 h-3.5 text-[#9A6530]" />
                          ) : (
                            <ArrowDown className="w-3.5 h-3.5 text-[#9A6530]" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3.5 h-3.5 text-[#ad9f8d] opacity-50" />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0eae0]">
                {paginatedTableData.length === 0 ? (
                  <tr>
                    <td
                      colSpan={qcData?.table?.columns.length || 1}
                      className="p-12 text-center text-xs text-[#8c8275] italic"
                    >
                      {t.cqs.noTableResults}
                    </td>
                  </tr>
                ) : (
                  paginatedTableData.map((row, rowIdx) => (
                    <tr key={rowIdx} className="hover:bg-[#faf7f2] transition-colors">
                      {row.map((cell, cellIdx) => {
                        const isUrl = cell.startsWith('http://') || cell.startsWith('https://')
                        const isParagraph = isUrl && (cell.includes('paragraph') || cell.includes('zoomathia') || cell.includes('phi') || cell.includes('tlg'))
                        const citation = isParagraph ? parseCitation(cell) : null

                        return (
                          <td
                            key={cellIdx}
                            className="p-3 text-xs md:text-sm max-w-sm truncate border-r border-[#f0eae0]/80 last:border-r-0"
                            title={cell}
                          >
                            {citation && citation.isZoomathiaUri ? (
                              <Link
                                to={`/explore-work?uri=${encodeURIComponent(cell.trim())}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group inline-flex flex-col gap-0.5 hover:underline"
                              >
                                <span className="text-[11px] font-semibold text-[#2563eb] flex items-center gap-1">
                                  <span>{citation.author}</span>
                                  <ExternalLink className="w-3 h-3 opacity-60 group-hover:opacity-100" />
                                </span>
                                <span className="text-xs text-[#595248]">
                                  {citation.work} ({citation.book}, {citation.section})
                                </span>
                              </Link>
                            ) : isParagraph ? (
                              <Link
                                to={`/explore-work?uri=${encodeURIComponent(cell.trim())}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#3b6ea5] hover:underline inline-flex items-center gap-1 font-sans text-xs"
                              >
                                <ExternalLink className="w-3 h-3 shrink-0" />
                                <span>{cell.split('/').pop()}</span>
                              </Link>
                            ) : isUrl ? (
                              <a
                                href={cell}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#3b6ea5] hover:underline font-mono text-xs"
                              >
                                {cell.split('/').pop()}
                              </a>
                            ) : (
                              <button
                                onClick={() => setSelectedEntity(cell)}
                                className="hover:text-[#9A6530] hover:underline text-left cursor-pointer transition-colors font-medium"
                                title="Inspecter cette entité dans le graphe"
                                type="button"
                              >
                                {cell}
                              </button>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Contrôles de pagination */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs text-[#736a5f]">
            <span>
              {t.cqs.showingRows
                .replace('{start}', String(Math.min((currentPage - 1) * pageSize + 1, filteredAndSortedTableData.length)))
                .replace('{end}', String(Math.min(currentPage * pageSize, filteredAndSortedTableData.length)))
                .replace('{total}', String(filteredAndSortedTableData.length))}
            </span>

            <div className="flex items-center space-x-1.5">
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                className="px-3 py-1.5 rounded-none border border-[#ded5c6] bg-[#faf9f6] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#f4ede2] transition-colors cursor-pointer shadow-2xs font-medium"
                type="button"
              >
                Précédent
              </button>
              <span className="px-3 py-1 font-semibold text-[#2c2724]">
                {currentPage} / {totalPages}
              </span>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                className="px-3 py-1.5 rounded-none border border-[#ded5c6] bg-[#faf9f6] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#f4ede2] transition-colors cursor-pointer shadow-2xs font-medium"
                type="button"
              >
                Suivant
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
