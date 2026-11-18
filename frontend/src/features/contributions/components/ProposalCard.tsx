import { ExternalLink, Layers } from 'lucide-react'
import { useState } from 'react'
import { useI18n } from '../../../i18n/I18nContext'
import type { ThesaurusProposal } from '../../../types'
import { ContributionActions } from './ContributionActions'
import { ContributorLine } from './ContributorLine'
import { ProposalEditDialog } from './ProposalEditDialog'
import { StatusBadge } from './StatusBadge'

/**
 * One term proposal of the list: its fields, its status (icon and label), who proposed and
 * reviewed it, the public reason of a rejection (RM-ACC-04) and the actions the backend allows.
 * The edit dialog opens from here (RM-CTB-05).
 */
export function ProposalCard({ proposal }: { proposal: ThesaurusProposal }) {
  const { t } = useI18n()
  const text = t.thesaurus
  const [isEditing, setIsEditing] = useState(false)
  const languageName = (text.languageNames as Record<string, string>)[proposal.language]

  return (
    <article className="space-y-3 border border-rule-strong bg-paper p-4 font-ui">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-text text-lg font-bold text-ink">{proposal.pref_label}</h3>
          <p className="text-sm text-ink-muted">
            {languageName ? `${languageName} (${proposal.language})` : proposal.language}
          </p>
        </div>
        <StatusBadge status={proposal.status} />
      </div>

      {proposal.alt_labels.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="font-medium text-ink-muted">{text.synonyms}</span>
          <ul className="flex flex-wrap gap-1.5">
            {proposal.alt_labels.map((label) => (
              <li key={label} className="border border-rule-strong bg-paper-raised px-2 py-0.5 text-ink">
                {label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {proposal.broader_concept_uri && (
        <p className="flex flex-wrap items-center gap-2 border border-rule bg-paper-raised px-3 py-1.5 text-sm text-ink">
          <Layers aria-hidden="true" className="h-4 w-4 shrink-0 text-accent-strong" />
          <span className="font-medium text-ink-muted">{text.hierarchy}</span>
          <strong>{proposal.broader_concept_label ?? proposal.broader_concept_uri}</strong>
          <a
            href={proposal.broader_concept_uri}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-accent-strong underline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {text.openInTheZoo}
            <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
          </a>
        </p>
      )}

      {proposal.definition && (
        <blockquote className="border-l-4 border-accent bg-paper-raised p-3 text-base text-ink italic">
          {proposal.definition}
        </blockquote>
      )}

      <div className="flex flex-col gap-3 border-t border-rule pt-3 sm:flex-row sm:items-start sm:justify-between">
        <ContributorLine contribution={proposal} />
        <ContributionActions
          kind="proposal"
          contribution={proposal}
          subject={proposal.pref_label}
          onEdit={() => setIsEditing(true)}
        />
      </div>
      {isEditing && <ProposalEditDialog proposal={proposal} onClose={() => setIsEditing(false)} />}
    </article>
  )
}
