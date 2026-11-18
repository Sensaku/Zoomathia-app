import { useI18n } from '../../i18n'
import type { StagedAnnotation } from '../../types'
import type { ReadingParagraph } from './readingTypes'

/** Props of {@link MultiParagraphLinks}. */
export interface MultiParagraphLinksProps {
  annotation: Pick<StagedAnnotation, 'target_paragraphs'>
  paragraphs: ReadingParagraph[]
  activeParagraphUri: string
  onFocusParagraph: (uri: string) => void
}

/**
 * Buttons that jump to each paragraph covered by a multi-paragraph annotation. Renders nothing
 * for an annotation of a single paragraph.
 */
export function MultiParagraphLinks({
  annotation,
  paragraphs,
  activeParagraphUri,
  onFocusParagraph,
}: MultiParagraphLinksProps) {
  const { t } = useI18n()
  if (annotation.target_paragraphs.length < 2) return null

  return (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      <span className="font-medium text-ink-muted">{t.work.paragraphLinks}</span>
      {annotation.target_paragraphs.map((uri) => {
        const index = paragraphs.findIndex((p) => p.uri === uri)
        const number = index !== -1 ? paragraphs[index].id || index + 1 : '§'
        const isCurrent = uri === activeParagraphUri
        return (
          <button
            key={uri}
            type="button"
            aria-current={isCurrent || undefined}
            title={t.work.goToParagraph.replace('{number}', String(number))}
            onClick={() => onFocusParagraph(uri)}
            className={`border px-1.5 py-0.5 font-mono focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              isCurrent
                ? 'border-accent-strong bg-accent text-white'
                : 'border-rule-strong bg-paper text-ink hover:bg-paper-sunken'
            }`}
          >
            § {number}
          </button>
        )
      })}
    </div>
  )
}
