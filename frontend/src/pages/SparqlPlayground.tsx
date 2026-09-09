import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  executeSparqlQuery,
  fetchSavedQueries,
  deleteSavedQuery
} from '../api/client'
import { SavedSparqlQuery } from '../types'
import { VenusViewer } from '../components/visualization/VenusViewer'
import { SaveQueryModal } from '../components/SaveQueryModal'
import { SparqlEditor } from '../components/sparql/SparqlEditor'
import { SparqlQuerySidebar, HistoryItem } from '../components/sparql/SparqlQuerySidebar'
import { parseCitation } from '../utils/citation'
import { useI18n } from '../i18n'
import {
  Code,
  Play,
  Table as TableIcon,
  Network,
  Download,
  FileSpreadsheet,
  FileCode,
  AlertTriangle,
  Loader2,
  Bookmark,
  ExternalLink,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Check,
  Copy,
  Clock,
  RotateCcw,
  Sparkles,
  Info,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Plus
} from 'lucide-react'

const LOCAL_STORAGE_HISTORY_KEY = 'zoomathia_sparql_history'

export const SparqlPlayground: React.FC = () => {
  const { t } = useI18n()
  const location = useLocation()
  const queryClient = useQueryClient()

  // 1. Récupération des requêtes sauvegardées
  const { data: savedQueries = [], isLoading: isQueriesLoading } = useQuery({
    queryKey: ['savedQueries'],
    queryFn: () => fetchSavedQueries(),
  })

  const [selectedQueryId, setSelectedQueryId] = useState<number | ''>('')
  const [queryTitle, setQueryTitle] = useState<string>('')
  const [queryDescription, setQueryDescription] = useState<string>('')
  const [queryText, setQueryText] = useState('')
  const [viewMode, setViewMode] = useState<'table' | 'graph'>('table')
  const [error, setError] = useState<string | null>(null)
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [executionDuration, setExecutionDuration] = useState<number | null>(null)
  const executionStartTimeRef = useRef<number>(0)

  // Détection si la requête sélectionnée est une question officielle non modifiable directement
  const selectedQuery = useMemo(() => {
    return savedQueries.find((q) => q.id === selectedQueryId)
  }, [savedQueries, selectedQueryId])

  const isBuiltin = selectedQuery?.is_builtin ?? false

  // Historique local des requêtes exécutées
  const [historyQueries, setHistoryQueries] = useState<HistoryItem[]>(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_HISTORY_KEY)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })

  // États pour le tableau de résultats
  const [tableSearch, setTableSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(25)
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [copiedTsv, setCopiedTsv] = useState(false)

  // Initialisation avec une requête transmise (ex: depuis CQs) ou la première requête enregistrée
  useEffect(() => {
    if (location.state?.queryText) {
      setQueryText(location.state.queryText)
      setSelectedQueryId('')
      setQueryTitle(location.state?.title || t.sparql.newQuery)
      setQueryDescription('')
      setError(null)
      return
    }
    if (savedQueries.length > 0 && selectedQueryId === '' && !queryText) {
      const first = savedQueries[0]
      setSelectedQueryId(first.id)
      setQueryTitle(first.title)
      setQueryDescription(first.description || '')
      setQueryText(first.query_text)
    }
  }, [savedQueries, selectedQueryId, location.state, t.sparql.newQuery])

  // Changement de requête sélectionnée dans la bibliothèque
  const handleSelectQuery = (query: SavedSparqlQuery) => {
    setSelectedQueryId(query.id)
    setQueryTitle(query.title)
    setQueryDescription(query.description || '')
    setQueryText(query.query_text)
    setError(null)
  }

  // Création d'une nouvelle requête vierge personnalisable
  const handleNewQuery = () => {
    setSelectedQueryId('')
    setQueryTitle('')
    setQueryDescription('')
    setQueryText(
      `PREFIX zoom: <http://ns.inria.fr/zoomathia/>\nPREFIX oa: <http://www.w3.org/ns/oa#>\nPREFIX skos: <http://www.w3.org/2004/02/skos/core#>\n\nSELECT ?s ?p ?o\nWHERE {\n  ?s ?p ?o .\n}\nLIMIT 50`
    )
    setError(null)
  }

  // Cloner une CQ officielle pour la personnaliser librement
  const handleCloneQuery = () => {
    setSelectedQueryId('')
    setQueryTitle(queryTitle ? `${queryTitle} (${t.sparql.customBadge})` : t.sparql.newQuery)
    setError(null)
  }

  // Application d'un modèle prédéfini
  const handleApplyTemplate = (templateCode: string) => {
    setQueryText(templateCode)
    setSelectedQueryId('')
    setQueryTitle(t.sparql.newQuery)
    setQueryDescription('')
    setError(null)
  }

  // Sélection depuis l'historique : restaure le code, le titre réel et l'intention
  const handleSelectHistory = (item: HistoryItem) => {
    setQueryText(item.query)
    setSelectedQueryId('')
    setQueryTitle(item.title || t.sparql.untitledQuery)
    setQueryDescription(item.description || '')
    setError(null)
  }

  // Vider l'historique local
  const handleClearHistory = () => {
    setHistoryQueries([])
    try {
      localStorage.removeItem(LOCAL_STORAGE_HISTORY_KEY)
    } catch {}
  }

  // Enregistrement dans l'historique local après exécution réussie
  const addToHistory = (executedQuery: string) => {
    const trimmed = executedQuery.trim()
    if (!trimmed) return

    // Titre : soit le titre déjà présent, soit un libellé déduit du SPARQL
    let itemTitle = queryTitle?.trim()
    if (!itemTitle || itemTitle === t.sparql.newQuery) {
      const meaningfulLine = trimmed
        .split('\n')
        .find((l) => !l.startsWith('#') && !l.trim().toUpperCase().startsWith('PREFIX')) || ''
      const cleanedLine = meaningfulLine.replace(/\s+/g, ' ').trim()
      itemTitle = cleanedLine ? cleanedLine.substring(0, 50) : t.sparql.adhocQuery
    }

    setHistoryQueries((prev) => {
      // Filtrer les doublons exacts récents
      const filtered = prev.filter((item) => item.query.trim() !== trimmed)
      const newItem: HistoryItem = {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        query: trimmed,
        title: itemTitle,
        description: queryDescription?.trim() || undefined,
        timestamp: Date.now()
      }
      const updated = [newItem, ...filtered].slice(0, 15) // Garder les 15 dernières
      try {
        localStorage.setItem(LOCAL_STORAGE_HISTORY_KEY, JSON.stringify(updated))
      } catch {}
      return updated
    })
  }

  // Mutation d'exécution SPARQL
  const sparqlMutation = useMutation({
    mutationFn: (q: string) => {
      executionStartTimeRef.current = performance.now()
      return executeSparqlQuery(q)
    },
    onSuccess: (data) => {
      const duration = Math.round(performance.now() - executionStartTimeRef.current)
      setExecutionDuration(duration)
      setError(null)
      setCurrentPage(1)
      addToHistory(queryText)

      if (data.spoReady && viewMode === 'table' && data.count <= 100) {
        setViewMode('graph')
      }
    },
    onError: (err: any) => {
      setExecutionDuration(null)
      setError(err?.message || "Erreur lors de l'exécution de la requête SPARQL.")
    }
  })

  const handleRunQuery = () => {
    setError(null)
    const trimmed = queryText.trim()
    if (!trimmed) return

    // Blocage strict des requêtes fédérées SERVICE (sécurité SSRF et prévention d'appels externes)
    if (/\bSERVICE\b/i.test(trimmed)) {
      setError(t.sparql.errorServiceBlocked)
      return
    }

    // Blocage strict des requêtes CONSTRUCT et DESCRIBE (génération de graphes non tabulaires)
    if (/\b(CONSTRUCT|DESCRIBE)\b/i.test(trimmed)) {
      setError(t.sparql.errorConstructDescribeBlocked)
      return
    }

    if (!/\b(SELECT|ASK)\b/i.test(trimmed)) {
      setError(t.sparql.errorSelectAskRequired)
      return
    }

    sparqlMutation.mutate(trimmed)
  }

  // Suppression d'une requête personnalisée
  const handleDeleteQuery = async (id: number) => {
    if (!window.confirm(t.sparql.deleteConfirm)) {
      return
    }
    try {
      await deleteSavedQuery(id)
      queryClient.invalidateQueries({ queryKey: ['savedQueries'] })
      if (selectedQueryId === id) {
        handleNewQuery()
      }
    } catch (err: any) {
      setError(err?.message || "Impossible de supprimer la requête.")
    }
  }

  const queryResult = sparqlMutation.data
  const columns = queryResult?.head?.vars || []
  const rawRows = queryResult?.results?.bindings || []

  // Filtrage et tri des résultats tabulaires
  const filteredRows = useMemo(() => {
    if (!rawRows.length) return []
    let list = rawRows

    if (tableSearch.trim()) {
      const searchLower = tableSearch.toLowerCase()
      list = list.filter((row) => {
        return columns.some((col) => {
          const val = row[col]?.value || ''
          return val.toLowerCase().includes(searchLower)
        })
      })
    }

    if (sortCol) {
      list = [...list].sort((a, b) => {
        const valA = a[sortCol]?.value || ''
        const valB = b[sortCol]?.value || ''
        const comp = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' })
        return sortDirection === 'asc' ? comp : -comp
      })
    }

    return list
  }, [rawRows, columns, tableSearch, sortCol, sortDirection])

  // Pagination
  const totalPages = pageSize > 0 ? Math.ceil(filteredRows.length / pageSize) : 1
  const paginatedRows = useMemo(() => {
    if (pageSize <= 0) return filteredRows
    const start = (currentPage - 1) * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [filteredRows, currentPage, pageSize])

  const handleSort = (col: string) => {
    if (sortCol === col) {
      if (sortDirection === 'asc') {
        setSortDirection('desc')
      } else {
        setSortCol(null)
      }
    } else {
      setSortCol(col)
      setSortDirection('asc')
    }
  }

  // Export JSON
  const exportJson = () => {
    if (!queryResult) return
    const blob = new Blob([JSON.stringify(queryResult, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `zoomathia_sparql_${Date.now()}.json`
    a.click()
  }

  // Export CSV
  const exportCsv = () => {
    if (!queryResult || rawRows.length === 0) return
    const header = columns.join(',')
    const csvLines = rawRows.map((r) =>
      columns.map((c) => `"${(r[c]?.value || '').replace(/"/g, '""')}"`).join(',')
    )
    const blob = new Blob([[header, ...csvLines].join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `zoomathia_sparql_${Date.now()}.csv`
    a.click()
  }

  // Copie rapide TSV dans le presse-papier
  const copyTsv = () => {
    if (!queryResult || rawRows.length === 0) return
    const header = columns.map((c) => `?${c}`).join('\t')
    const tsvLines = filteredRows.map((r) =>
      columns.map((c) => (r[c]?.value || '').replace(/\t/g, ' ').replace(/\n/g, ' ')).join('\t')
    )
    const text = [header, ...tsvLines].join('\n')
    navigator.clipboard.writeText(text)
    setCopiedTsv(true)
    setTimeout(() => setCopiedTsv(false), 2000)
  }

  return (
    <div className="py-5 space-y-5 max-w-[1920px] mx-auto">
      
      {/* En-tête principal & statuts */}
      <div className="bg-white p-5 rounded-none border border-[#e6dfd3] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-none bg-[#faf4ee] text-[#9A6530] border border-[#f0eae0]">
              <Code className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-serif text-xl md:text-2xl font-bold text-[#2c2724]">
                {t.sparql.title}
              </h1>
              <p className="text-xs text-[#736a5f] mt-0.5">
                {t.sparql.subtitle}
              </p>
            </div>
          </div>
        </div>

        {/* Badges de statut et sécurité */}
        <div className="flex items-center space-x-2.5 flex-wrap">
          <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-[#fbf8f3] border border-[#ded5c6] rounded-none text-xs text-[#696156]">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className="font-medium">Corese Endpoint</span>
          </div>

          <div className="inline-flex items-center space-x-1 px-2.5 py-1 bg-amber-50/80 border border-amber-200/80 rounded-none text-[11px] text-amber-800">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>{t.sparql.guardAlertDesc}</span>
          </div>
        </div>
      </div>

      {/* Disposition en deux colonnes : Volet de bibliothèque + Atelier de travail */}
      <div className="flex flex-col lg:flex-row gap-5 items-start">
        
        {/* Volet latéral gauche : Bibliothèque de requêtes & modèles */}
        <SparqlQuerySidebar
          savedQueries={savedQueries}
          selectedQueryId={selectedQueryId}
          onSelectQuery={handleSelectQuery}
          onNewQuery={handleNewQuery}
          onDeleteQuery={handleDeleteQuery}
          onApplyTemplate={handleApplyTemplate}
          isQueriesLoading={isQueriesLoading}
          historyQueries={historyQueries}
          onSelectHistory={handleSelectHistory}
          onClearHistory={handleClearHistory}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        />

        {/* Atelier de travail central (Éditeur, Actions, Résultats) */}
        <div className="flex-1 min-w-0 w-full space-y-4">
          
          {/* Fiche de la requête active */}
          <div className="bg-white p-4.5 rounded-none border border-[#e6dfd3] shadow-xs space-y-3.5">
            
            {/* Ligne d'en-tête : Nature de la requête et boutons de contrôle */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#f0eae0]">
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <span className="text-xs font-semibold text-[#855424] uppercase tracking-wider">
                  {selectedQueryId === '' 
                    ? t.sparql.newQueryDraft 
                    : isBuiltin 
                    ? t.sparql.officialQueryTitle.replace('{id}', String(selectedQueryId)) 
                    : t.sparql.customQueryTitle.replace('{id}', String(selectedQueryId))}
                </span>
                {isBuiltin && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-none bg-amber-100/80 text-amber-800 border border-amber-200">
                    {t.sparql.readOnlyBadge}
                  </span>
                )}
                {!isBuiltin && selectedQueryId !== '' && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-none bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {t.sparql.customEditBadge}
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-2">
                {isBuiltin && (
                  <button
                    type="button"
                    onClick={handleCloneQuery}
                    className="inline-flex items-center space-x-1 px-2.5 py-1 bg-[#faf8f5] hover:bg-[#9A6530] hover:text-white border border-[#ded5c6] rounded-none text-xs text-[#595248] transition-colors cursor-pointer"
                    title={t.sparql.cloneQueryTooltip}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t.sparql.cloneQueryBtn}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleNewQuery}
                  className="inline-flex items-center space-x-1 px-2.5 py-1 bg-[#faf8f5] hover:bg-[#f0eae0] border border-[#ded5c6] rounded-none text-xs text-[#595248] transition-colors cursor-pointer"
                  title={t.sparql.resetQueryTooltip}
                >
                  <RotateCcw className="w-3 h-3 text-[#9A6530]" />
                  <span>{t.sparql.resetQuery}</span>
                </button>
              </div>
            </div>

            {/* Champs Nom et Intentions de la requête */}
            {isBuiltin ? (
              <div className="space-y-2">
                <h2 className="font-serif font-bold text-lg text-[#2c2724]">
                  {queryTitle}
                </h2>
                {queryDescription && (
                  <div className="p-3 bg-[#faf8f5] border border-[#f0eae0] rounded-none text-xs text-[#595248] flex items-start space-x-2 leading-relaxed">
                    <Info className="w-4 h-4 text-[#9A6530] shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-[#855424]">{t.sparql.researchGoal}</span>{' '}
                      {queryDescription}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3 bg-[#fdfbf7] p-3.5 rounded-none border border-[#ece3d4]">
                <div>
                  <label className="block text-[11px] font-semibold text-[#855424] uppercase tracking-wider mb-1">
                    {t.sparql.queryNameLabel}
                  </label>
                  <input
                    type="text"
                    value={queryTitle}
                    onChange={(e) => setQueryTitle(e.target.value)}
                    placeholder={t.sparql.queryNamePlaceholder}
                    className="w-full font-serif font-bold text-sm md:text-base text-[#2c2724] p-2.5 bg-white border border-[#cfc5b4] rounded-none focus:ring-2 focus:ring-[#9A6530] focus:outline-none placeholder-[#9e9486]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#855424] uppercase tracking-wider mb-1">
                    {t.sparql.queryIntentLabel}
                  </label>
                  <textarea
                    rows={2}
                    value={queryDescription}
                    onChange={(e) => setQueryDescription(e.target.value)}
                    placeholder={t.sparql.queryIntentPlaceholder}
                    className="w-full text-xs text-[#2c2724] p-2.5 bg-white border border-[#cfc5b4] rounded-none focus:ring-2 focus:ring-[#9A6530] focus:outline-none placeholder-[#9e9486] leading-relaxed resize-y"
                  />
                </div>
              </div>
            )}

            {/* Composant Éditeur SPARQL enrichi avec coloration syntaxique */}
            <SparqlEditor
              value={queryText}
              onChange={setQueryText}
              onRun={handleRunQuery}
              isPending={sparqlMutation.isPending}
            />

            {/* Barre d'action principale */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
              <div className="flex items-center space-x-2 text-xs text-[#8c8275]">
                {executionDuration !== null && (
                  <div className="flex items-center space-x-1 text-[#595248] bg-[#faf8f5] px-2 py-1 rounded-none border border-[#f0eae0]">
                    <Clock className="w-3.5 h-3.5 text-[#9A6530]" />
                    <span>
                      {executionDuration} {t.sparql.executionTime}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center space-x-2.5 justify-end">
                <button
                  type="button"
                  onClick={() => setIsSaveModalOpen(true)}
                  disabled={!queryText.trim()}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 border border-[#9A6530] text-[#9A6530] hover:bg-[#faf4ee] rounded-none font-semibold text-xs transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  <span>
                    {!isBuiltin && selectedQueryId !== '' ? t.sparql.updateQueryBtn : t.sparql.saveQueryBtn}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleRunQuery}
                  disabled={sparqlMutation.isPending || !queryText.trim()}
                  className="inline-flex items-center space-x-2 px-6 py-2 bg-[#9A6530] hover:bg-[#855424] text-white rounded-none font-semibold text-xs shadow-sm hover:shadow transition-all disabled:opacity-50 cursor-pointer"
                >
                  {sparqlMutation.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{t.sparql.running}</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>{t.sparql.runQueryBtn}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Affichage d'erreur avec message soigné */}
            {error && (
              <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-none text-xs leading-relaxed flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">{t.common.error} :</span> {error}
                </div>
              </div>
            )}
          </div>

          {/* Restitution des Résultats */}
          {queryResult && (
            <div className="bg-white p-5 rounded-none border border-[#e6dfd3] shadow-xs space-y-4">
              
              {/* En-tête des résultats & Outils */}
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pb-3 border-b border-[#f0eae0]">
                <div className="flex items-center space-x-3">
                  <h2 className="font-serif font-bold text-base text-[#2c2724]">
                    {t.sparql.title}
                  </h2>
                  <span className="px-2 py-0.5 rounded-full bg-[#f4ede2] text-xs font-medium text-[#73471c]">
                    {queryResult.count} {t.sparql.resultsCount}
                  </span>
                  {executionDuration !== null && (
                    <span className="text-xs text-[#8c8275]">
                      ({executionDuration} ms)
                    </span>
                  )}
                </div>

                {/* Bascule d'affichage & Outils d'exportation */}
                <div className="flex items-center space-x-2 flex-wrap gap-y-2">
                  
                  {/* Onglets Tableau / Graphe */}
                  <div className="flex items-center space-x-1 bg-[#f4ede2] p-1 rounded-none border border-[#ded5c6]">
                    <button
                      type="button"
                      onClick={() => setViewMode('table')}
                      className={`flex items-center space-x-1.5 px-3 py-1 rounded-none text-xs font-medium transition-all ${
                        viewMode === 'table'
                          ? 'bg-white text-[#9A6530] shadow-xs'
                          : 'text-[#696156] hover:text-[#2c2724]'
                      }`}
                    >
                      <TableIcon className="w-3.5 h-3.5" />
                      <span>{t.sparql.tableTab}</span>
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => setViewMode('graph')}
                      disabled={!queryResult.spoReady}
                      title={!queryResult.spoReady ? t.sparql.graphRequiresNodes : ''}
                      className={`flex items-center space-x-1.5 px-3 py-1 rounded-none text-xs font-medium transition-all disabled:opacity-40 ${
                        viewMode === 'graph'
                          ? 'bg-white text-[#9A6530] shadow-xs'
                          : 'text-[#696156] hover:text-[#2c2724]'
                      }`}
                    >
                      <Network className="w-3.5 h-3.5" />
                      <span>{t.sparql.graphTab}</span>
                    </button>
                  </div>

                  {/* Boutons d'export */}
                  <div className="flex items-center space-x-1.5 border-l border-[#ded5c6] pl-2">
                    <button
                      type="button"
                      onClick={copyTsv}
                      disabled={rawRows.length === 0}
                      className="inline-flex items-center space-x-1 px-2.5 py-1 bg-white border border-[#ded5c6] rounded-none text-xs text-[#595248] hover:bg-[#f4ede2] transition-colors disabled:opacity-40 cursor-pointer"
                      title={t.sparql.copyTsv}
                    >
                      {copiedTsv ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span className="text-emerald-700 font-medium">{t.sparql.copied}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>{t.sparql.copyTsv}</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={exportCsv}
                      disabled={rawRows.length === 0}
                      className="inline-flex items-center space-x-1 px-2.5 py-1 bg-white border border-[#ded5c6] rounded-none text-xs text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-40 cursor-pointer"
                      title={t.common.exportCsv}
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>CSV</span>
                    </button>

                    <button
                      type="button"
                      onClick={exportJson}
                      disabled={rawRows.length === 0}
                      className="inline-flex items-center space-x-1 px-2.5 py-1 bg-white border border-[#ded5c6] rounded-none text-xs text-[#3b6ea5] hover:bg-blue-50 transition-colors cursor-pointer"
                      title={t.common.exportJson}
                    >
                      <FileCode className="w-3.5 h-3.5" />
                      <span>JSON</span>
                    </button>
                  </div>

                </div>
              </div>

              {/* Vue Tableau des résultats */}
              {viewMode === 'table' && (
                <div className="space-y-3">
                  
                  {/* Barre de recherche dans le tableau */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 text-xs">
                    <div className="relative w-full sm:w-72">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#9e9486]" />
                      <input
                        type="text"
                        value={tableSearch}
                        onChange={(e) => {
                          setTableSearch(e.target.value)
                          setCurrentPage(1)
                        }}
                        placeholder={t.sparql.filterResultsPlaceholder}
                        className="w-full pl-8 pr-3 py-1.5 bg-[#faf9f6] border border-[#ded5c6] rounded-none text-xs text-[#2c2724] placeholder-[#9e9486] focus:outline-none focus:ring-1 focus:ring-[#9A6530]"
                      />
                    </div>

                    <div className="flex items-center space-x-2 text-[#736a5f] self-end sm:self-auto">
                      <span>{t.sparql.rowsPerPage}</span>
                      <select
                        value={pageSize}
                        onChange={(e) => {
                          setPageSize(Number(e.target.value))
                          setCurrentPage(1)
                        }}
                        className="p-1 border border-[#ded5c6] rounded bg-[#faf9f6] text-xs text-[#2c2724] focus:outline-none focus:ring-1 focus:ring-[#9A6530]"
                      >
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={-1}>{t.sparql.allRows}</option>
                      </select>
                    </div>
                  </div>

                  {/* Tableau paginé & stylisé */}
                  <div className="overflow-x-auto border border-[#e6dfd3] rounded-none shadow-xs">
                    <table className="min-w-full divide-y divide-[#e6dfd3] text-sm">
                      <thead className="bg-[#faf9f6]">
                        <tr>
                          {columns.map((col) => {
                            const isSorted = sortCol === col
                            return (
                              <th
                                key={col}
                                onClick={() => handleSort(col)}
                                className="px-4 py-2.5 text-left font-semibold text-[#595248] uppercase tracking-wider font-mono text-xs cursor-pointer select-none hover:bg-[#f0eae0] transition-colors"
                              >
                                <div className="flex items-center space-x-1">
                                  <span>?{col}</span>
                                  {isSorted ? (
                                    sortDirection === 'asc' ? (
                                      <ArrowUp className="w-3 h-3 text-[#9A6530]" />
                                    ) : (
                                      <ArrowDown className="w-3 h-3 text-[#9A6530]" />
                                    )
                                  ) : (
                                    <ArrowUpDown className="w-3 h-3 text-[#b0a799] opacity-40 hover:opacity-100" />
                                  )}
                                </div>
                              </th>
                            )
                          })}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#f0eae0] bg-white">
                        {paginatedRows.length === 0 ? (
                          <tr>
                            <td colSpan={columns.length} className="text-center py-8 text-xs text-[#8c8275]">
                              {t.sparql.noResults}
                            </td>
                          </tr>
                        ) : (
                          paginatedRows.map((row, rowIdx) => (
                            <tr key={rowIdx} className="hover:bg-[#faf8f4] transition-colors">
                              {columns.map((col) => {
                                const cell = row[col]
                                const cellVal = cell?.value || ''
                                const isUrl = cellVal.startsWith('http://') || cellVal.startsWith('https://')
                                const isParagraph = isUrl && (cellVal.includes('paragraph') || cellVal.includes('zoomathia') || cellVal.includes('phi') || cellVal.includes('tlg'))
                                const citation = isParagraph ? parseCitation(cellVal) : null

                                return (
                                  <td
                                    key={col}
                                    className="px-4 py-2 text-xs text-[#2c2724] border-r border-[#f4ede2] last:border-r-0 max-w-sm truncate"
                                    title={cellVal}
                                  >
                                    {citation && citation.isZoomathiaUri ? (
                                      <Link
                                        to={`/explore-work?uri=${encodeURIComponent(cellVal)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="group inline-flex flex-col gap-0.5 hover:underline"
                                      >
                                        <span className="text-[11px] font-semibold text-[#2563eb] flex items-center gap-1">
                                          <span>{citation.author}</span>
                                          <ExternalLink className="w-3 h-3 opacity-60 group-hover:opacity-100" />
                                        </span>
                                        <span className="text-[11px] text-[#595248]">
                                          {citation.work} ({citation.book}, {citation.section})
                                        </span>
                                      </Link>
                                    ) : isParagraph ? (
                                      <Link
                                        to={`/explore-work?uri=${encodeURIComponent(cellVal)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[#3b6ea5] hover:underline inline-flex items-center gap-1 font-mono text-xs"
                                      >
                                        <ExternalLink className="w-3 h-3 shrink-0" />
                                        <span>{cellVal.split('/').pop()}</span>
                                      </Link>
                                    ) : isUrl ? (
                                      <a
                                        href={cellVal}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-[#9A6530] hover:underline font-mono text-xs inline-flex items-center gap-1"
                                      >
                                        <span>{cellVal.split('/').pop() || cellVal}</span>
                                        <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                                      </a>
                                    ) : (
                                      <span className="font-mono">{cellVal}</span>
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

                  {/* Barre de pagination */}
                  {pageSize > 0 && totalPages > 1 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs text-[#736a5f]">
                      <div>
                        {t.sparql.showingRows
                          .replace('{start}', String((currentPage - 1) * pageSize + 1))
                          .replace('{end}', String(Math.min(currentPage * pageSize, filteredRows.length)))
                          .replace('{total}', String(filteredRows.length))}
                      </div>

                      <div className="flex items-center space-x-1.5">
                        <button
                          type="button"
                          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                          className="px-2.5 py-1 bg-white border border-[#ded5c6] rounded-none hover:bg-[#f4ede2] transition-colors disabled:opacity-40 cursor-pointer"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <span className="px-2 font-medium text-[#2c2724]">
                          {currentPage} / {totalPages}
                        </span>
                        <button
                          type="button"
                          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                          className="px-2.5 py-1 bg-white border border-[#ded5c6] rounded-none hover:bg-[#f4ede2] transition-colors disabled:opacity-40 cursor-pointer"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              )}

              {/* Vue Graphe VENUS */}
              {viewMode === 'graph' && (
                <div className="h-[650px] border border-[#e6dfd3] rounded-none overflow-hidden shadow-inner">
                  <VenusViewer
                    spoData={queryResult}
                    title={queryTitle || t.sparql.title}
                  />
                </div>
              )}

            </div>
          )}

        </div>

      </div>

      {/* Modal d'enregistrement de requête */}
      <SaveQueryModal
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        queryText={queryText}
        initialTitle={queryTitle}
        initialDescription={queryDescription}
        queryId={selectedQueryId}
        isBuiltin={isBuiltin}
        onSuccess={(id) => {
          setSelectedQueryId(id)
          queryClient.invalidateQueries({ queryKey: ['savedQueries'] })
        }}
      />

    </div>
  )
}
