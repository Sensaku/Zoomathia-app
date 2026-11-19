import { Pin } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  CATEGORY_DELIMITER_LEFT,
  CATEGORY_DELIMITER_RIGHT,
  CATEGORY_HOVER_STYLES,
  CATEGORY_OVERLAP_STYLES,
  CATEGORY_PINNED_STYLES,
  categoryStyle,
  collectionLabels,
} from '../../../components/ConceptCategoryBadge'
import { useI18n } from '../../../i18n'
import { Dialog } from '../../../shared/ui'
import { StatusIcon } from '../../contributions'
import { useConceptCategories } from '../hooks/useConceptCategories'
import { DIMMED } from './AnnotatedMark'
import { LoadError } from './LoadError'

/** Props of {@link AnnotationLegendDialog}. */
export interface AnnotationLegendDialogProps {
  open: boolean
  onClose: () => void
}

const MARK = 'rounded-none px-0.5'

function Heading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3 id={id} className="mb-2 text-sm font-semibold text-ink">
      {children}
    </h3>
  )
}

/** One legend line: a sample as rendered in the text, its name and what it means. */
function Row({ sample, label, children }: { sample: ReactNode; label: string; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 py-1.5">
      <span className="w-28 shrink-0">{sample}</span>
      <span className="text-sm text-ink-muted">
        <strong className="font-semibold text-ink">{label}</strong> {children}
      </span>
    </li>
  )
}

/** The categories in priority order, with the names of their collections (RM-CON-02). */
function CategoryList() {
  const { t, language } = useI18n()
  const text = t.annotationLegend
  const categories = useConceptCategories()

  if (categories.isPending) return <output>{text.loading}</output>
  if (categories.isError) {
    return (
      <LoadError
        error={categories.error}
        onRetry={() => void categories.refetch()}
        isRetrying={categories.isFetching}
      />
    )
  }
  return (
    <ul className="divide-y divide-rule border-y border-rule">
      {categories.data.map(({ category, collections }) => {
        const style = categoryStyle(category)
        const Icon = style.icon
        const names = category === 'general' ? text.generalCollections : collectionLabels(collections, language)
        return (
          <li key={category} className="flex items-start gap-3 py-2">
            <span
              className={`inline-flex w-32 shrink-0 items-center gap-1.5 border px-2 py-0.5 text-xs font-medium ${style.bgClass} ${style.borderClass} ${style.textClass}`}
            >
              <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              {t.conceptCategories[style.category]}
            </span>
            <span className="text-sm text-ink-muted">{names}</span>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * The legend of the annotated text. The categories come from the backend table (RM-CON-02), so
 * the legend never drifts from it; the samples reuse the classes of the real marks.
 */
export function AnnotationLegendDialog({ open, onClose }: AnnotationLegendDialogProps) {
  const { t } = useI18n()
  const text = t.annotationLegend

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t.annotate.legendTitle}
      description={text.intro}
      closeLabel={t.common.close}
    >
      <div className="space-y-5">
        <section aria-labelledby="legend-categories">
          <Heading id="legend-categories">{text.categoriesTitle}</Heading>
          <p className="mb-2 text-sm text-ink-muted">{text.categoriesHelp}</p>
          <CategoryList />
        </section>

        <section aria-labelledby="legend-overlaps">
          <Heading id="legend-overlaps">{text.overlapsTitle}</Heading>
          <ul>
            <Row
              label={text.overlapLabel}
              sample={
                <mark className={`${MARK} ${CATEGORY_OVERLAP_STYLES.animal}`}>
                  {text.sampleText}
                  <span className="ml-0.5 inline-flex items-center border border-accent/30 bg-accent/15 px-1 align-super font-mono text-[11px] font-bold text-accent-strong">
                    2
                  </span>
                </mark>
              }
            >
              {text.overlapText}
            </Row>
            <Row
              label={text.edgesLabel}
              sample={
                <mark
                  className={`${MARK} bg-transparent text-ink ${CATEGORY_DELIMITER_LEFT.anatomy} ${CATEGORY_DELIMITER_RIGHT.behavior}`}
                >
                  {text.sampleText}
                </mark>
              }
            >
              {text.edgesText}
            </Row>
          </ul>
        </section>

        <section aria-labelledby="legend-states">
          <Heading id="legend-states">{text.statesTitle}</Heading>
          <ul>
            <Row
              label={text.hoverLabel}
              sample={<mark className={`${MARK} ${CATEGORY_HOVER_STYLES.animal}`}>{text.sampleText}</mark>}
            >
              {text.hoverText}
            </Row>
            <Row
              label={text.pinnedLabel}
              sample={
                <span className="inline-flex items-center gap-1">
                  <mark className={`${MARK} ${CATEGORY_PINNED_STYLES.animal}`}>{text.sampleText}</mark>
                  <Pin aria-hidden="true" className="h-4 w-4 text-ink-muted" />
                </span>
              }
            >
              {text.pinnedText}
            </Row>
            <Row label={text.dimmedLabel} sample={<mark className={`${MARK} ${DIMMED}`}>{text.sampleText}</mark>}>
              {text.dimmedText}
            </Row>
            <Row label={t.contributions.status.pending} sample={<StatusIcon status="pending" />}>
              {text.pendingText}
            </Row>
            <Row label={t.contributions.status.validated} sample={<StatusIcon status="validated" />}>
              {text.validatedText}
            </Row>
          </ul>
        </section>
      </div>
    </Dialog>
  )
}
