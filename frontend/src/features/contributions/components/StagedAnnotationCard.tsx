import { ExternalLink, Pin } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { ConceptCategoryIcon } from '../../../components/ConceptCategoryBadge'
import { useI18n } from '../../../i18n/I18nContext'
import type { StagedAnnotation } from '../../../types'
import { fill } from '../lib/fill'
import { AnnotationEditDialog } from './AnnotationEditDialog'
import { ContributionActions } from './ContributionActions'
import { ContributorLine } from './ContributorLine'
import { StatusBadge } from './StatusBadge'

/** Props of {@link StagedAnnotationCard}. */
export interface StagedAnnotationCardProps {
  annotation: StagedAnnotation
  /** True when the user follows this concept (the toggle is pressed). */
  isPinned: boolean
  /** False for a rejected annotation: it is never highlighted in the text (RM-ACC-04), so no toggle. */
  canPin?: boolean
  /** True while the concept is hovered somewhere on the page. */
  isHighlighted?: boolean
  onTogglePin: () => void
  /** Highlights the concept in the text while the toggle is hovered or focused. */
  onHoverChange?: (hovered: boolean) => void
  /** Page-specific extras, such as the links of a multi-paragraph annotation. */
  children?: ReactNode
}

/**
 * A staged annotation in the reader panel and the studio list. It shows the review status
 * (a pending one reads "Non relu", RM-ACC-03), the excerpt, the justification, who contributed
 * and who reviewed, with the public reason of a rejection (RM-ACC-04). The buttons come from
 * `allowed_actions` only (RM-CTB-05, RM-MOD-01). Following the concept is a toggle button.
 */
export function StagedAnnotationCard({
  annotation,
  isPinned,
  canPin = true,
  isHighlighted = false,
  onTogglePin,
  onHoverChange,
  children,
}: StagedAnnotationCardProps) {
  const { t } = useI18n()
  const [isEditing, setIsEditing] = useState(false)
  const concept = annotation.concept_label
  const scopeLabels = {
    word: t.annotate.scopeWord,
    word_sequence: t.annotate.scopeWordSequence,
    sentence: t.annotate.scopeSentence,
    paragraph: t.annotate.scopeParagraph,
    multi_paragraph: t.annotate.scopeMultiParagraph,
  }
  const position =
    annotation.scope_type === 'multi_paragraph'
      ? fill(t.contributions.stagedCard.paragraphCount, { count: String(annotation.target_paragraphs.length) })
      : fill(t.contributions.stagedCard.position, {
          start: String(annotation.start_offset),
          end: String(annotation.end_offset),
        })
  const ring = isPinned ? 'border-accent ring-2 ring-accent' : isHighlighted ? 'border-accent ring-1 ring-accent' : ''

  return (
    <article
      className={`space-y-2 border bg-paper-raised p-3 font-ui text-sm text-ink ${ring || 'border-rule-strong'}`}
    >
      <div className="flex items-start justify-between gap-2">
        {canPin ? (
          <button
            type="button"
            aria-pressed={isPinned}
            title={isPinned ? t.annotate.unpinAnnotationTooltip : t.annotate.pinAnnotationTooltip}
            className="flex min-w-0 items-start gap-1.5 text-left font-semibold break-words hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            onClick={onTogglePin}
            onMouseEnter={() => onHoverChange?.(true)}
            onMouseLeave={() => onHoverChange?.(false)}
            onFocus={() => onHoverChange?.(true)}
            onBlur={() => onHoverChange?.(false)}
          >
            <ConceptCategoryIcon label={concept} uri={annotation.concept_uri} className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{concept}</span>
            {isPinned && <Pin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" />}
          </button>
        ) : (
          <p className="flex min-w-0 items-start gap-1.5 font-semibold break-words">
            <ConceptCategoryIcon label={concept} uri={annotation.concept_uri} className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{concept}</span>
          </p>
        )}
        <StatusBadge status={annotation.status} />
      </div>

      <p className="text-xs text-ink-muted">
        {scopeLabels[annotation.scope_type]} · {position}
      </p>
      <p className="ancient-text line-clamp-3 text-ink italic">« {annotation.target_text} »</p>
      {children}

      {annotation.justification && (
        <div className="border border-rule bg-paper p-2">
          <p className="text-xs font-semibold text-ink-muted">{t.annotate.justificationTitle}</p>
          <p className="italic">{annotation.justification}</p>
        </div>
      )}

      <ContributorLine contribution={annotation} />
      <a
        href={annotation.concept_uri}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-xs text-accent-strong underline"
      >
        {t.work.viewOnTheZoo}
        <ExternalLink aria-hidden="true" className="h-3 w-3" />
      </a>
      <ContributionActions
        kind="annotation"
        contribution={annotation}
        subject={concept}
        onEdit={() => setIsEditing(true)}
      />
      {isEditing && <AnnotationEditDialog annotation={annotation} onClose={() => setIsEditing(false)} />}
    </article>
  )
}
