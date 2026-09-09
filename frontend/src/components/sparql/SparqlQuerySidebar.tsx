import React, { useState, useMemo } from 'react'
import { SavedSparqlQuery } from '../../types'
import { useI18n } from '../../i18n'
import {
  FolderOpen,
  Search,
  Sparkles,
  History,
  Trash2,
  Plus,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  FileCode2,
  Download,
  X,
  Tag
} from 'lucide-react'

export interface HistoryItem {
  id: string;
  query: string;
  title?: string;
  description?: string;
  timestamp: number;
}

interface SparqlQuerySidebarProps {
  savedQueries: SavedSparqlQuery[];
  selectedQueryId: number | '';
  onSelectQuery: (query: SavedSparqlQuery) => void;
  onNewQuery: () => void;
  onDeleteQuery: (id: number) => void;
  onApplyTemplate: (templateCode: string) => void;
  isQueriesLoading?: boolean;
  historyQueries: HistoryItem[];
  onSelectHistory: (item: HistoryItem) => void;
  onClearHistory: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const SparqlQuerySidebar: React.FC<SparqlQuerySidebarProps> = ({
  savedQueries,
  selectedQueryId,
  onSelectQuery,
  onNewQuery,
  onDeleteQuery,
  onApplyTemplate,
  isQueriesLoading = false,
  historyQueries,
  onSelectHistory,
  onClearHistory,
  isCollapsed,
  onToggleCollapse
}) => {
  const { t, language } = useI18n()
  const [activeTab, setActiveTab] = useState<'cq' | 'custom' | 'history'>('cq')
  const [searchTerm, setSearchTerm] = useState('')

  const templates = useMemo(() => [
    {
      label: t.sparql.templateSelectTitle,
      desc: t.sparql.templateSelectDesc,
      code: `PREFIX zoom: <http://ns.inria.fr/zoomathia/>\nPREFIX oa: <http://www.w3.org/ns/oa#>\nPREFIX skos: <http://www.w3.org/2004/02/skos/core#>\n\nSELECT ?s ?p ?o\nWHERE {\n  ?s ?p ?o .\n}\nLIMIT 50`
    },
    {
      label: t.sparql.templateConceptTitle,
      desc: t.sparql.templateConceptDesc,
      code: `PREFIX zoom: <http://ns.inria.fr/zoomathia/>\nPREFIX oa: <http://www.w3.org/ns/oa#>\nPREFIX skos: <http://www.w3.org/2004/02/skos/core#>\n\nSELECT DISTINCT ?paragraph ?conceptLabel ?mention\nWHERE {\n  ?annotation oa:hasTarget [ oa:hasSource ?paragraph ] ;\n              oa:hasBody ?concept ;\n              oa:hasSelector [ oa:exact ?mention ] .\n  ?concept skos:prefLabel ?conceptLabel .\n}\nLIMIT 50`
    },
    {
      label: t.sparql.templateAskTitle,
      desc: t.sparql.templateAskDesc,
      code: `PREFIX zoom: <http://ns.inria.fr/zoomathia/>\n\nASK {\n  ?s a ?type .\n}`
    }
  ], [t])

  // Séparation CQs officielles et requêtes utilisateur
  const officialQueries = useMemo(() => {
    return savedQueries.filter((q) => q.is_builtin)
  }, [savedQueries])

  const customQueries = useMemo(() => {
    return savedQueries.filter((q) => !q.is_builtin)
  }, [savedQueries])

  // Filtrage selon le terme de recherche
  const filterList = (list: SavedSparqlQuery[]) => {
    if (!searchTerm.trim()) return list
    const lower = searchTerm.toLowerCase()
    return list.filter(
      (q) =>
        q.title.toLowerCase().includes(lower) ||
        (q.description && q.description.toLowerCase().includes(lower)) ||
        q.category.toLowerCase().includes(lower) ||
        q.query_text.toLowerCase().includes(lower)
    )
  }

  const filteredOfficials = useMemo(() => filterList(officialQueries), [officialQueries, searchTerm])
  const filteredCustoms = useMemo(() => filterList(customQueries), [customQueries, searchTerm])

  const filteredHistory = useMemo(() => {
    if (!searchTerm.trim()) return historyQueries
    const lower = searchTerm.toLowerCase()
    return historyQueries.filter(
      (h) =>
        (h.title && h.title.toLowerCase().includes(lower)) ||
        (h.description && h.description.toLowerCase().includes(lower)) ||
        h.query.toLowerCase().includes(lower)
    )
  }, [historyQueries, searchTerm])

  if (isCollapsed) {
    return (
      <div className="hidden lg:flex flex-col items-center py-4 px-2 bg-white border border-[#e6dfd3] rounded-none shadow-sm w-14 shrink-0 transition-all">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="p-2 text-[#736a5f] hover:text-[#9A6530] hover:bg-[#faf6f0] rounded-none transition-colors"
          title={t.sparql.showSidebar}
        >
          <ChevronRight className="w-5 h-5" />
        </button>
        <div className="mt-6 flex flex-col items-center space-y-4 text-xs font-serif writing-vertical text-[#8c8275] select-none">
          <FolderOpen className="w-4 h-4 text-[#9A6530]" />
          <span className="[writing-mode:vertical-rl] tracking-widest uppercase">
            {t.sparql.sidebarTitle}
          </span>
        </div>
      </div>
    )
  }

  return (
    <aside className="w-full lg:w-80 shrink-0 flex flex-col bg-white border border-[#e6dfd3] rounded-none shadow-sm overflow-hidden transition-all h-[750px]">
      
      {/* En-tête du volet */}
      <div className="p-3.5 bg-[#faf8f5] border-b border-[#e6dfd3] flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <FolderOpen className="w-4 h-4 text-[#9A6530]" />
          <h2 className="font-serif font-bold text-sm text-[#2c2724]">
            {t.sparql.sidebarTitle}
          </h2>
        </div>
        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={onNewQuery}
            className="p-1 text-[#9A6530] hover:bg-[#f0eae0] rounded-none transition-colors"
            title={t.sparql.newQuery}
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden lg:inline-flex p-1 text-[#736a5f] hover:text-[#2c2724] hover:bg-[#f0eae0] rounded-none transition-colors"
            title={t.sparql.hideSidebar}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Barre de recherche */}
      <div className="p-2.5 border-b border-[#f0eae0] bg-white">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#9e9486]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t.sparql.searchPlaceholder}
            className="w-full pl-8 pr-7 py-1.5 bg-[#faf9f6] border border-[#ded5c6] rounded-none text-xs text-[#2c2724] placeholder-[#9e9486] focus:outline-none focus:ring-1 focus:ring-[#9A6530]"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2 top-2 text-[#9e9486] hover:text-[#2c2724]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Onglets de navigation de la bibliothèque */}
      <div className="flex border-b border-[#f0eae0] bg-[#faf8f5] text-xs font-medium">
        <button
          type="button"
          onClick={() => setActiveTab('cq')}
          className={`flex-1 py-2 text-center border-b-2 transition-all flex items-center justify-center space-x-1 ${
            activeTab === 'cq'
              ? 'border-[#9A6530] text-[#9A6530] bg-white font-semibold'
              : 'border-transparent text-[#736a5f] hover:text-[#2c2724]'
          }`}
        >
          <span>{t.sparql.tabCq}</span>
          <span className="text-[10px] bg-[#f0eae0] px-1.5 py-0.2 rounded-full font-mono text-[#665e52]">
            {officialQueries.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('custom')}
          className={`flex-1 py-2 text-center border-b-2 transition-all flex items-center justify-center space-x-1 ${
            activeTab === 'custom'
              ? 'border-[#9A6530] text-[#9A6530] bg-white font-semibold'
              : 'border-transparent text-[#736a5f] hover:text-[#2c2724]'
          }`}
        >
          <span>{t.sparql.tabCustom}</span>
          <span className="text-[10px] bg-[#f0eae0] px-1.5 py-0.2 rounded-full font-mono text-[#665e52]">
            {customQueries.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-2 text-center border-b-2 transition-all flex items-center justify-center space-x-1 ${
            activeTab === 'history'
              ? 'border-[#9A6530] text-[#9A6530] bg-white font-semibold'
              : 'border-transparent text-[#736a5f] hover:text-[#2c2724]'
          }`}
        >
          <History className="w-3 h-3" />
          <span>{t.sparql.tabHistory}</span>
          {historyQueries.length > 0 && (
            <span className="text-[10px] bg-[#f0eae0] px-1.5 py-0.2 rounded-full font-mono text-[#665e52]">
              {historyQueries.length}
            </span>
          )}
        </button>
      </div>

      {/* Liste défilante de requêtes */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 scrollbar-thin">
        {isQueriesLoading && (
          <div className="py-8 text-center text-xs text-[#8c8275]">
            {t.sparql.loadingLibrary}
          </div>
        )}

        {/* 1. Onglet CQs */}
        {activeTab === 'cq' && !isQueriesLoading && (
          <>
            {filteredOfficials.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#8c8275]">
                {t.sparql.noQueriesFound}
              </div>
            ) : (
              filteredOfficials.map((q) => {
                const isSelected = selectedQueryId === q.id
                return (
                  <div
                    key={q.id}
                    onClick={() => onSelectQuery(q)}
                    className={`p-2.5 rounded-none border text-left cursor-pointer transition-all ${
                      isSelected
                        ? 'border-[#9A6530] bg-[#faf4ee] shadow-xs'
                        : 'border-[#f0eae0] bg-white hover:bg-[#faf8f5] hover:border-[#ded5c6]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded-none bg-[#ebdccb] text-[#73471c]">
                        QC {q.id}
                      </span>
                      <span className="text-[10px] text-[#8c8275] truncate max-w-[120px]">
                        {q.category}
                      </span>
                    </div>
                    <h3 className="text-xs font-medium text-[#2c2724] line-clamp-2 leading-snug">
                      {q.title}
                    </h3>
                  </div>
                )
              })
            )}
          </>
        )}

        {/* 2. Onglet Requêtes personnalisées */}
        {activeTab === 'custom' && !isQueriesLoading && (
          <>
            {filteredCustoms.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#8c8275] space-y-2">
                <p>{t.sparql.noQueriesFound}</p>
                <button
                  type="button"
                  onClick={onNewQuery}
                  className="inline-flex items-center space-x-1 text-xs text-[#9A6530] hover:underline"
                >
                  <Plus className="w-3 h-3" />
                  <span>{t.sparql.newQuery}</span>
                </button>
              </div>
            ) : (
              filteredCustoms.map((q) => {
                const isSelected = selectedQueryId === q.id
                return (
                  <div
                    key={q.id}
                    className={`p-2.5 rounded-none border text-left cursor-pointer transition-all group relative ${
                      isSelected
                        ? 'border-[#9A6530] bg-[#faf4ee] shadow-xs'
                        : 'border-[#f0eae0] bg-white hover:bg-[#faf8f5] hover:border-[#ded5c6]'
                    }`}
                  >
                    <div onClick={() => onSelectQuery(q)}>
                      <div className="flex items-center justify-between gap-1 mb-1 pr-6">
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-none bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {t.sparql.customBadge}
                        </span>
                        <span className="text-[10px] text-[#8c8275] truncate max-w-[100px]">
                          {q.author_name}
                        </span>
                      </div>
                      <h3 className="text-xs font-medium text-[#2c2724] line-clamp-2 leading-snug pr-4">
                        {q.title}
                      </h3>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteQuery(q.id)
                      }}
                      className="absolute right-2 top-2 p-1 text-[#9e9486] hover:text-red-700 hover:bg-red-50 rounded-none transition-colors opacity-80 group-hover:opacity-100"
                      title={t.common.delete}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              })
            )}
          </>
        )}

        {/* 3. Onglet Historique d'exécution local */}
        {activeTab === 'history' && (
          <div className="space-y-2">
            {filteredHistory.length > 0 && (
              <div className="flex justify-end pb-1">
                <button
                  type="button"
                  onClick={onClearHistory}
                  className="text-[10px] text-[#8c8275] hover:text-red-700 underline cursor-pointer"
                >
                  {t.sparql.clearHistory}
                </button>
              </div>
            )}

            {filteredHistory.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#8c8275]">
                {t.sparql.emptyHistory}
              </div>
            ) : (
              filteredHistory.map((item) => {
                const dateStr = new Date(item.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit'
                })
                const firstLine = item.query.trim().split('\n').find((l) => !l.startsWith('#') && !l.startsWith('PREFIX')) || item.query.trim().split('\n')[0]
                return (
                  <div
                    key={item.id}
                    onClick={() => onSelectHistory(item)}
                    className="p-2.5 rounded-none border border-[#f0eae0] bg-white hover:bg-[#faf8f5] hover:border-[#ded5c6] cursor-pointer text-left transition-all"
                  >
                    <div className="flex items-center justify-between text-[11px] mb-1 gap-1">
                      <span className="font-semibold text-[#2c2724] truncate max-w-[170px]" title={item.title}>
                        {item.title || t.sparql.untitledQuery}
                      </span>
                      <span className="font-mono text-[10px] text-[#a69d90] shrink-0">{dateStr}</span>
                    </div>
                    {item.description && (
                      <p className="text-[10px] text-[#736a5f] truncate mb-1">
                        {item.description}
                      </p>
                    )}
                    <code className="text-[11px] font-mono text-[#595248] line-clamp-2 block bg-[#faf9f6] p-1 rounded-none border border-[#f0eae0]">
                      {firstLine}
                    </code>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>

      {/* Pied de panneau : Modèles rapides et export JSON */}
      <div className="p-2.5 bg-[#faf8f5] border-t border-[#e6dfd3] space-y-2">
        <div>
          <span className="text-[11px] font-semibold text-[#8c8275] uppercase tracking-wider block mb-1">
            {t.sparql.templatesTitle}
          </span>
          <div className="grid grid-cols-1 gap-1">
            {templates.map((tmpl) => (
              <button
                key={tmpl.label}
                type="button"
                onClick={() => onApplyTemplate(tmpl.code)}
                className="w-full text-left px-2 py-1 bg-white hover:bg-[#f4ede2] border border-[#ded5c6] rounded-none text-[11px] text-[#595248] transition-colors flex items-center justify-between cursor-pointer"
                title={tmpl.desc}
              >
                <span className="font-medium truncate">{tmpl.label}</span>
                <span className="text-[10px] text-[#9A6530] font-mono shrink-0">{t.sparql.insertTemplate}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Bouton d'exportation de la bibliothèque */}
        <a
          href="/api/queries/export/json"
          download
          className="w-full inline-flex items-center justify-center space-x-1.5 py-1.5 bg-white hover:bg-[#f4ede2] border border-[#ded5c6] rounded-none text-xs text-[#736a5f] transition-colors"
          title={t.common.exportJson}
        >
          <Download className="w-3.5 h-3.5" />
          <span>{t.common.exportJson} {t.sparql.libraryExportSuffix}</span>
        </a>
      </div>

    </aside>
  )
}
