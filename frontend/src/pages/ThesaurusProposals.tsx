import React from 'react'
import { BASE_URL } from '../api/client'
import { getApiErrorMessage } from '../api/errors'
import { BookOpen, Check, Download, ExternalLink, Loader2, PlusCircle, Sparkles } from 'lucide-react'
import { useI18n } from '../i18n'
import { Alert, Button, TextField } from '../shared/ui'
import { CONTRIBUTION_STATUSES } from '../features/contributions'
import { ProposalCard } from '../features/contributions/components/ProposalCard'
import { ProposalForm } from '../features/contributions/components/ProposalForm'
import { useProposalFilters } from '../features/contributions/hooks/useProposalFilters'
import { useProposalList } from '../features/contributions/hooks/useProposalList'
import { fill } from '../features/contributions/lib/fill'

/** Term proposals (RM-THE-04): the proposal form and the reviewed list, filtered on the server (RM-ACC-03, RM-ACC-04). */
export const ThesaurusProposals: React.FC = () => {
  const { t } = useI18n()
  const text = t.thesaurus
  const filters = useProposalFilters()
  const list = useProposalList({ status: filters.status, q: filters.q })
  const proposals = list.data?.pages.flatMap((page) => page.items) ?? []
  const total = list.data?.pages[0]?.total ?? 0
  const tabLabels = {
    pending: text.filterPending,
    validated: text.filterValidated,
    rejected: text.filterRejected,
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 py-6">
      <header className="space-y-3 border border-chrome-line bg-chrome p-6 text-on-chrome md:p-8">
        <p className="inline-flex items-center gap-2 border border-chrome-line px-3 py-1 font-ui text-sm text-focus-on-chrome">
          <Sparkles aria-hidden="true" className="h-4 w-4" />
          {text.badge}
        </p>
        <h1 className="font-text text-3xl font-bold">{text.title}</h1>
        <p className="max-w-2xl font-ui text-base text-on-chrome-muted">{text.subtitle}</p>
        <div className="flex flex-col gap-3 pt-2 font-ui sm:flex-row">
          <a
            href="https://opentheso.huma-num.fr/opentheso/?idt=th310"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 border border-chrome-line px-4 py-2 text-on-chrome hover:bg-chrome-raised focus-visible:outline-2 focus-visible:outline-focus-on-chrome"
          >
            <BookOpen aria-hidden="true" className="h-4 w-4" />
            {text.openInTheZoo}
            <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
          </a>
          <a
            href={`${BASE_URL}/thesaurus/proposals/export-ttl`}
            download
            className="inline-flex items-center justify-center gap-2 border border-accent bg-accent px-4 py-2 text-white hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-focus-on-chrome"
          >
            <Download aria-hidden="true" className="h-4 w-4" />
            {text.exportTtlBtn}
          </a>
        </div>
      </header>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <section className="space-y-4 border border-rule-strong bg-paper-raised p-6 lg:col-span-5">
          <div className="border-b border-rule pb-3">
            <h2 className="flex items-center gap-2 font-text text-xl font-bold text-ink">
              <PlusCircle aria-hidden="true" className="h-5 w-5 text-accent-strong" />
              {text.formTitle}
            </h2>
            <p className="mt-1 font-ui text-sm text-ink-muted">{text.formSubtitle}</p>
          </div>
          <ProposalForm onShowPending={() => filters.setStatus('pending')} />
        </section>

        <section className="space-y-4 border border-rule-strong bg-paper-raised p-6 lg:col-span-7">
          <div className="space-y-3 border-b border-rule pb-3">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <h2 className="font-text text-xl font-bold text-ink">{text.proposalsTitle}</h2>
              <div className="w-full sm:w-64">
                <TextField
                  label={text.searchLabel}
                  type="search"
                  maxLength={200}
                  placeholder={text.searchPlaceholder}
                  value={filters.search}
                  onChange={(event) => filters.setSearch(event.target.value)}
                />
              </div>
            </div>
            <fieldset className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0 font-ui">
              <legend className="sr-only">{text.tabsLabel}</legend>
              {CONTRIBUTION_STATUSES.map((status) => {
                const isActive = filters.status === status
                return (
                  <button
                    key={status}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => filters.setStatus(status)}
                    className={`inline-flex items-center gap-1.5 border px-3 py-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                      isActive
                        ? 'border-ink bg-ink text-paper'
                        : 'border-rule-strong bg-paper text-ink hover:bg-paper-sunken'
                    }`}
                  >
                    {isActive && <Check aria-hidden="true" className="h-4 w-4" />}
                    {tabLabels[status]}
                  </button>
                )
              })}
            </fieldset>
            {list.isSuccess && (
              <output className="block font-ui text-sm text-ink-muted">
                {fill(text.total, { count: String(total) })}
              </output>
            )}
          </div>

          {list.isPending && (
            <p className="flex items-center justify-center gap-2 py-12 font-ui text-ink-muted">
              <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
              {t.common.loading}
            </p>
          )}
          {list.isError && <Alert tone="error">{getApiErrorMessage(list.error, t)}</Alert>}
          {list.isSuccess && proposals.length === 0 && (
            <p className="border border-dashed border-rule-strong px-6 py-12 text-center font-ui text-ink-muted">
              {text.noProposals}
            </p>
          )}
          {proposals.length > 0 && (
            <div className="space-y-3">
              {proposals.map((proposal) => (
                <ProposalCard key={proposal.id} proposal={proposal} />
              ))}
            </div>
          )}
          {list.hasNextPage && (
            <div className="text-center">
              <Button variant="secondary" onClick={() => void list.fetchNextPage()} isLoading={list.isFetchingNextPage}>
                {text.loadMore}
              </Button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
