import { useI18n } from '../../../i18n/I18nContext'
import type { TranslationDictionary } from '../../../i18n/types'
import { formatDate } from '../../../shared/lib/dates'
import type { ContributionStatus, PublicIdentity } from '../../../types'
import { fill } from '../lib/fill'

/** The fields of an annotation or a term proposal that the line needs. */
export interface ContributorFields {
  author: PublicIdentity | null
  author_label: string | null
  created_at: string
  reviewer: PublicIdentity | null
  reviewed_at: string | null
  status: ContributionStatus
  rejection_reason: string | null
}

/** "Name (affiliation)", the public identity (RM-CPT-05). */
function identity(person: PublicIdentity): string {
  return `${person.display_name} (${person.affiliation})`
}

/**
 * The author as shown everywhere: "name (affiliation)", or the typed name with the "before
 * accounts" marker for a historical contribution (RM-CTB-06, RM-CPT-05).
 */
export function formatAuthor(
  author: PublicIdentity | null,
  authorLabel: string | null,
  line: TranslationDictionary['contributions']['line'],
): string {
  if (author) return identity(author)
  return authorLabel ? fill(line.historicalAuthor, { author: authorLabel }) : line.unknownPerson
}

/**
 * Who contributed and who reviewed (RM-MOD-03). A historical contribution (RM-CTB-06) shows the
 * typed name with a written "before accounts" marker. A rejected one shows its public reason
 * (RM-ACC-04).
 */
export function ContributorLine({ contribution }: { contribution: ContributorFields }) {
  const { t, language } = useI18n()
  const line = t.contributions.line
  const { author, author_label, reviewer, reviewed_at, status, rejection_reason } = contribution

  const authorText = formatAuthor(author, author_label, line)
  const reviewTemplate = status === 'validated' ? line.validatedBy : line.rejectedBy

  return (
    <div className="font-ui text-sm text-ink-muted">
      <p>{fill(line.createdBy, { author: authorText, date: formatDate(contribution.created_at, language) })}</p>
      {status !== 'pending' && reviewed_at !== null && (
        <p>
          {fill(reviewTemplate, {
            reviewer: reviewer ? identity(reviewer) : line.unknownPerson,
            date: formatDate(reviewed_at, language),
          })}
        </p>
      )}
      {status === 'rejected' && rejection_reason && (
        <p className="text-ink">{fill(line.rejectionReason, { reason: rejection_reason })}</p>
      )}
    </div>
  )
}
