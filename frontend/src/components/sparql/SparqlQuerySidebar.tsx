import React, { useState, useMemo, useId } from 'react'
import { SavedSparqlQuery } from '../../types'
import { useI18n } from '../../i18n'
import { formatAuthor } from '../../features/contributions'
import { fill } from '../../features/contributions/lib/fill'
import { getApiErrorMessage } from '../../api/errors'
import { Alert, Button } from '../../shared/ui'
import { FolderOpen, Search, History, Trash2, Plus, ChevronLeft, ChevronRight, Download, X } from 'lucide-react'

export interface HistoryItem {
  id: string
  query: string
  title?: string
  description?: string
  timestamp: number
}

interface SparqlQuerySidebarProps {
  savedQueries: SavedSparqlQuery[]
  selectedQueryId: number | ''
  onSelectQuery: (query: SavedSparqlQuery) => void
  onNewQuery: () => void
  /** Asks to delete a query. The button shows only when the backend lists `delete` for it (RM-QC-06). */
  onDeleteQuery: (query: SavedSparqlQuery) => void
  onApplyTemplate: (templateCode: string) => void
  isQueriesLoading?: boolean
  /** Failure of the saved-query list: shown instead of the lists, never read as "no query" (rule 9). */
  loadError?: unknown
  /** Reloads the saved-query list. */
  onRetryLoad?: () => void
  /** True while the retry runs: the retry button shows it and is disabled. */
  isRetryingLoad?: boolean
  historyQueries: HistoryItem[]
  onSelectHistory: (item: HistoryItem) => void
  onClearHistory: () => void
  isCollapsed: boolean
  onToggleCollapse: () => void
}

/** Keeps the saved queries whose title, description, category or code contains `searchTerm`. */
function filterQueries(list: SavedSparqlQuery[], searchTerm: string): SavedSparqlQuery[] {
  if (!searchTerm.trim()) return list
  const lower = searchTerm.toLowerCase()
  return list.filter(
    (q) =>
      q.title.toLowerCase().includes(lower) ||
      (q.description && q.description.toLowerCase().includes(lower)) ||
      q.category.toLowerCase().includes(lower) ||
      q.query_text.toLowerCase().includes(lower),
  )
}

/**
 * Library of the SPARQL playground: official questions, the user's queries (both from the server,
 * with a loading and a failure state), the local history, quick templates and the JSON export.
 */
export const SparqlQuerySidebar: React.FC<SparqlQuerySidebarProps> = ({
  savedQueries,
  selectedQueryId,
  onSelectQuery,
  onNewQuery,
  onDeleteQuery,
  onApplyTemplate,
  isQueriesLoading = false,
  loadError,
  onRetryLoad,
  isRetryingLoad = false,
  historyQueries,
  onSelectHistory,
  onClearHistory,
  isCollapsed,
  onToggleCollapse,
}) => {
  const { t } = useI18n()
  const [activeTab, setActiveTab] = useState<'cq' | 'custom' | 'history'>('cq')
  const [searchTerm, setSearchTerm] = useState('')
  const searchId = useId()
  const hasLoadError = loadError !== undefined && loadError !== null

  const templates = useMemo(
    () => [
      {
        label: t.sparql.templateSelectTitle,
        desc: t.sparql.templateSelectDesc,
        code: `PREFIX zoom: <http://ns.inria.fr/zoomathia/>\nPREFIX oa: <http://www.w3.org/ns/oa#>\nPREFIX skos: <http://www.w3.org/2004/02/skos/core#>\n\nSELECT ?s ?p ?o\nWHERE {\n  ?s ?p ?o .\n}\nLIMIT 50`,
      },
      {
        label: t.sparql.templateConceptTitle,
        desc: t.sparql.templateConceptDesc,
        code: `PREFIX zoom: <http://ns.inria.fr/zoomathia/>\nPREFIX oa: <http://www.w3.org/ns/oa#>\nPREFIX skos: <http://www.w3.org/2004/02/skos/core#>\n\nSELECT DISTINCT ?paragraph ?conceptLabel ?mention\nWHERE {\n  ?annotation oa:hasTarget [ oa:hasSource ?paragraph ] ;\n              oa:hasBody ?concept ;\n              oa:hasSelector [ oa:exact ?mention ] .\n  ?concept skos:prefLabel ?conceptLabel .\n}\nLIMIT 50`,
      },
      {
        label: t.sparql.templateAskTitle,
        desc: t.sparql.templateAskDesc,
        code: `PREFIX zoom: <http://ns.inria.fr/zoomathia/>\n\nASK {\n  ?s a ?type .\n}`,
      },
    ],
    [t],
  )

  // Séparation CQs officielles et requêtes utilisateur
  const officialQueries = useMemo(() => {
    return savedQueries.filter((q) => q.is_builtin)
  }, [savedQueries])

  const customQueries = useMemo(() => {
    return savedQueries.filter((q) => !q.is_builtin)
  }, [savedQueries])

  const filteredOfficials = useMemo(() => filterQueries(officialQueries, searchTerm), [officialQueries, searchTerm])
  const filteredCustoms = useMemo(() => filterQueries(customQueries, searchTerm), [customQueries, searchTerm])

  const filteredHistory = useMemo(() => {
    if (!searchTerm.trim()) return historyQueries
    const lower = searchTerm.toLowerCase()
    return historyQueries.filter(
      (h) =>
        (h.title && h.title.toLowerCase().includes(lower)) ||
        (h.description && h.description.toLowerCase().includes(lower)) ||
        h.query.toLowerCase().includes(lower),
    )
  }, [historyQueries, searchTerm])

  if (isCollapsed) {
    return (
      <div className="hidden w-14 shrink-0 flex-col items-center rounded-none border border-rule bg-white px-2 py-4 shadow-sm transition-all lg:flex">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="rounded-none p-2 text-ink-subtle transition-colors hover:bg-paper-raised hover:text-accent-strong"
          title={t.sparql.showSidebar}
          aria-label={t.sparql.showSidebar}
        >
          <ChevronRight aria-hidden="true" className="h-5 w-5" />
        </button>
        <div className="writing-vertical mt-6 flex flex-col items-center space-y-4 font-serif text-xs text-ink-subtle select-none">
          <FolderOpen className="h-4 w-4 text-accent-strong" />
          <span className="tracking-widest uppercase [writing-mode:vertical-rl]">{t.sparql.sidebarTitle}</span>
        </div>
      </div>
    )
  }

  return (
    <aside className="flex h-[750px] w-full shrink-0 flex-col overflow-hidden rounded-none border border-rule bg-white shadow-sm transition-all lg:w-80">
      {/* En-tête du volet */}
      <div className="flex items-center justify-between border-b border-rule bg-paper-raised p-3.5">
        <div className="flex items-center space-x-2">
          <FolderOpen className="h-4 w-4 text-accent-strong" />
          <h2 className="font-serif text-sm font-bold text-ink">{t.sparql.sidebarTitle}</h2>
        </div>
        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={onNewQuery}
            className="rounded-none p-1 text-accent-strong transition-colors hover:bg-paper-sunken"
            title={t.sparql.newQuery}
            aria-label={t.sparql.newQuery}
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden rounded-none p-1 text-ink-subtle transition-colors hover:bg-paper-sunken hover:text-ink lg:inline-flex"
            title={t.sparql.hideSidebar}
            aria-label={t.sparql.hideSidebar}
          >
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Barre de recherche */}
      <div className="border-b border-rule bg-white p-2.5">
        <div className="relative">
          <Search aria-hidden="true" className="absolute top-2.5 left-2.5 h-3.5 w-3.5 text-ink-subtle" />
          <label htmlFor={searchId} className="sr-only">
            {t.sparql.searchLabel}
          </label>
          <input
            id={searchId}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t.sparql.searchPlaceholder}
            className="w-full rounded-none border border-rule-strong bg-paper-raised py-1.5 pr-7 pl-8 text-xs text-ink placeholder-ink-subtle focus-visible:outline-2 focus-visible:outline-accent"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute top-2 right-2 text-ink-subtle hover:text-ink"
              aria-label={t.sparql.clearSearch}
            >
              <X aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Onglets de navigation de la bibliothèque */}
      <div className="flex border-b border-rule bg-paper-raised text-xs font-medium">
        <button
          type="button"
          onClick={() => setActiveTab('cq')}
          aria-pressed={activeTab === 'cq'}
          className={`flex flex-1 items-center justify-center space-x-1 border-b-2 py-2 text-center transition-all ${
            activeTab === 'cq'
              ? 'border-accent bg-white font-semibold text-accent-strong'
              : 'border-transparent text-ink-subtle hover:text-ink'
          }`}
        >
          <span>{t.sparql.tabCq}</span>
          {!hasLoadError && (
            <span className="py-0.2 rounded-full bg-paper-sunken px-1.5 font-mono text-[10px] text-ink-muted">
              {officialQueries.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('custom')}
          aria-pressed={activeTab === 'custom'}
          className={`flex flex-1 items-center justify-center space-x-1 border-b-2 py-2 text-center transition-all ${
            activeTab === 'custom'
              ? 'border-accent bg-white font-semibold text-accent-strong'
              : 'border-transparent text-ink-subtle hover:text-ink'
          }`}
        >
          <span>{t.sparql.tabCustom}</span>
          {!hasLoadError && (
            <span className="py-0.2 rounded-full bg-paper-sunken px-1.5 font-mono text-[10px] text-ink-muted">
              {customQueries.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('history')}
          aria-pressed={activeTab === 'history'}
          className={`flex flex-1 items-center justify-center space-x-1 border-b-2 py-2 text-center transition-all ${
            activeTab === 'history'
              ? 'border-accent bg-white font-semibold text-accent-strong'
              : 'border-transparent text-ink-subtle hover:text-ink'
          }`}
        >
          <History className="h-3 w-3" />
          <span>{t.sparql.tabHistory}</span>
          {historyQueries.length > 0 && (
            <span className="py-0.2 rounded-full bg-paper-sunken px-1.5 font-mono text-[10px] text-ink-muted">
              {historyQueries.length}
            </span>
          )}
        </button>
      </div>

      {/* Liste défilante de requêtes */}
      <div className="flex-1 scrollbar-thin space-y-1.5 overflow-y-auto p-2">
        {isQueriesLoading && <div className="py-8 text-center text-xs text-ink-subtle">{t.sparql.loadingLibrary}</div>}

        {/* A failed load is never shown as an empty list (rule 9); the history is local and unaffected. */}
        {hasLoadError && !isQueriesLoading && activeTab !== 'history' && (
          <div className="space-y-2 p-1">
            <Alert tone="error">{getApiErrorMessage(loadError, t)}</Alert>
            {onRetryLoad && (
              <Button variant="secondary" size="sm" onClick={onRetryLoad} isLoading={isRetryingLoad}>
                {t.common.retry}
              </Button>
            )}
          </div>
        )}

        {/* 1. Onglet CQs */}
        {activeTab === 'cq' && !isQueriesLoading && !hasLoadError && (
          <>
            {filteredOfficials.length === 0 ? (
              <div className="py-8 text-center text-xs text-ink-subtle">{t.sparql.noQueriesFound}</div>
            ) : (
              filteredOfficials.map((q) => {
                const isSelected = selectedQueryId === q.id
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => onSelectQuery(q)}
                    aria-current={isSelected || undefined}
                    className={`block w-full cursor-pointer rounded-none border p-2.5 text-left transition-all ${
                      isSelected
                        ? 'border-accent bg-paper-sunken'
                        : 'border-rule bg-paper hover:border-rule-strong hover:bg-paper-raised'
                    }`}
                  >
                    <span className="mb-1 flex items-center justify-between gap-1">
                      <span className="rounded-none bg-paper-sunken px-1.5 py-0.5 font-mono text-[10px] font-bold text-accent-strong uppercase">
                        {fill(t.sparql.qcBadge, { id: String(q.id) })}
                      </span>
                      <span className="max-w-[120px] truncate text-[10px] text-ink-subtle">{q.category}</span>
                    </span>
                    <span className="line-clamp-2 block text-xs leading-snug font-medium text-ink">{q.title}</span>
                  </button>
                )
              })
            )}
          </>
        )}

        {/* 2. Onglet Requêtes personnalisées */}
        {activeTab === 'custom' && !isQueriesLoading && !hasLoadError && (
          <>
            {filteredCustoms.length === 0 ? (
              <div className="space-y-2 py-8 text-center text-xs text-ink-subtle">
                <p>{t.sparql.noQueriesFound}</p>
                <button
                  type="button"
                  onClick={onNewQuery}
                  className="inline-flex items-center space-x-1 text-xs text-accent-strong hover:underline"
                >
                  <Plus className="h-3 w-3" />
                  <span>{t.sparql.newQuery}</span>
                </button>
              </div>
            ) : (
              filteredCustoms.map((q) => {
                const isSelected = selectedQueryId === q.id
                const deleteLabel = fill(t.sparql.deleteTitle, { title: q.title })
                return (
                  <div
                    key={q.id}
                    className={`relative rounded-none border p-2.5 text-left transition-all ${
                      isSelected
                        ? 'border-accent bg-paper-sunken'
                        : 'border-rule bg-paper hover:border-rule-strong hover:bg-paper-raised'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectQuery(q)}
                      aria-current={isSelected || undefined}
                      className="block w-full cursor-pointer text-left"
                    >
                      <span className="mb-1 flex items-center justify-between gap-1 pr-6">
                        <span className="rounded-none border border-success bg-success-soft px-1.5 py-0.5 font-mono text-[10px] text-success">
                          {t.sparql.customBadge}
                        </span>
                        <span className="max-w-[100px] truncate text-[10px] text-ink-subtle">
                          {formatAuthor(q.author, q.author_label, t.contributions.line)}
                        </span>
                      </span>
                      <span className="line-clamp-2 block pr-4 text-xs leading-snug font-medium text-ink">
                        {q.title}
                      </span>
                    </button>

                    {q.allowed_actions.includes('delete') && (
                      <button
                        type="button"
                        onClick={() => onDeleteQuery(q)}
                        className="absolute top-2 right-2 rounded-none p-1 text-ink-muted hover:bg-danger-soft hover:text-danger focus-visible:outline-2 focus-visible:outline-accent"
                        aria-label={deleteLabel}
                        title={deleteLabel}
                      >
                        <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                      </button>
                    )}
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
                  className="cursor-pointer text-[10px] text-ink-subtle underline hover:text-red-700"
                >
                  {t.sparql.clearHistory}
                </button>
              </div>
            )}

            {filteredHistory.length === 0 ? (
              <div className="py-8 text-center text-xs text-ink-subtle">{t.sparql.emptyHistory}</div>
            ) : (
              filteredHistory.map((item) => {
                const dateStr = new Date(item.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })
                const firstLine =
                  item.query
                    .trim()
                    .split('\n')
                    .find((l) => !l.startsWith('#') && !l.startsWith('PREFIX')) || item.query.trim().split('\n')[0]
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectHistory(item)}
                    className="block w-full cursor-pointer rounded-none border border-rule bg-white p-2.5 text-left transition-all hover:border-rule-strong hover:bg-paper-raised focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <span className="mb-1 flex items-center justify-between gap-1 text-[11px]">
                      <span className="max-w-[170px] truncate font-semibold text-ink" title={item.title}>
                        {item.title || t.sparql.untitledQuery}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-ink-subtle">{dateStr}</span>
                    </span>
                    {item.description && (
                      <span className="mb-1 block truncate text-[10px] text-ink-subtle">{item.description}</span>
                    )}
                    <code className="line-clamp-2 block rounded-none border border-rule bg-paper-raised p-1 font-mono text-[11px] text-ink-muted">
                      {firstLine}
                    </code>
                  </button>
                )
              })
            )}
          </div>
        )}
      </div>

      {/* Pied de panneau : Modèles rapides et export JSON */}
      <div className="space-y-2 border-t border-rule bg-paper-raised p-2.5">
        <div>
          <span className="mb-1 block text-[11px] font-semibold tracking-wider text-ink-subtle uppercase">
            {t.sparql.templatesTitle}
          </span>
          <div className="grid grid-cols-1 gap-1">
            {templates.map((tmpl) => (
              <button
                key={tmpl.label}
                type="button"
                onClick={() => onApplyTemplate(tmpl.code)}
                className="flex w-full cursor-pointer items-center justify-between rounded-none border border-rule-strong bg-white px-2 py-1 text-left text-[11px] text-ink-muted transition-colors hover:bg-paper-sunken"
                title={tmpl.desc}
              >
                <span className="truncate font-medium">{tmpl.label}</span>
                <span className="shrink-0 font-mono text-[10px] text-accent-strong">{t.sparql.insertTemplate}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Bouton d'exportation de la bibliothèque */}
        <a
          href="/api/queries/export/json"
          download
          className="inline-flex w-full items-center justify-center space-x-1.5 rounded-none border border-rule-strong bg-white py-1.5 text-xs text-ink-subtle transition-colors hover:bg-paper-sunken"
          title={t.common.exportJson}
        >
          <Download className="h-3.5 w-3.5" />
          <span>
            {t.common.exportJson} {t.sparql.libraryExportSuffix}
          </span>
        </a>
      </div>
    </aside>
  )
}
