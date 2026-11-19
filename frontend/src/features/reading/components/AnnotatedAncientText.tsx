import React, { useMemo } from 'react'
import { resolveParagraphSpans, type ReadingParagraph } from '../../../components/reading'
import { useI18n } from '../../../i18n'
import type { StagedAnnotation } from '../../../types'
import { buildTextChunks } from '../lib/textChunks'
import { AnnotatedMark } from './AnnotatedMark'
import { PassageThemes } from './PassageThemes'

/** Props of {@link AnnotatedAncientText}. */
export interface AnnotatedAncientTextProps {
  p: ReadingParagraph
  /** Reference annotations of the paragraph. Pass a stable value: it feeds the memo. */
  referenceMap?: Record<string, any>
  /** Contributions of the work. Pass a stable value: it feeds the memo. */
  stagedList?: StagedAnnotation[]
  /** Shows only these concepts. Pass a stable value, so that hovering does not recompute the chunks. */
  filterConceptUri?: string | string[] | null
  hoveredConcept?: string | null
  pinnedConcept?: string | null
  onHoverConcept?: (uri: string | null) => void
  onPinConcept?: (uri: string) => void
}

const NO_REFERENCES: Record<string, any> = {}
const NO_STAGED: StagedAnnotation[] = []

/**
 * The text of a paragraph with its annotations highlighted, and the themes of the passage above it.
 *
 * RM-ANN-01: the pages compute annotation offsets from this DOM, so the text flow holds the
 * paragraph text and nothing else: chunks keep their order, and the counters and status icons
 * carry no text or are `select-none`.
 */
export const AnnotatedAncientText: React.FC<AnnotatedAncientTextProps> = React.memo(
  ({
    p,
    referenceMap = NO_REFERENCES,
    stagedList = NO_STAGED,
    filterConceptUri,
    hoveredConcept,
    pinnedConcept,
    onHoverConcept,
    onPinConcept,
  }) => {
    const { t } = useI18n()

    // Heavy step: it runs only when the paragraph, its annotations or the filter change, never on hover.
    const { specificSpans, globalThemes, chunks } = useMemo(() => {
      const { specificSpans, globalThemes } = resolveParagraphSpans(p, referenceMap, stagedList, filterConceptUri)
      return { specificSpans, globalThemes, chunks: buildTextChunks(p.text, specificSpans, t) }
    }, [p, referenceMap, stagedList, filterConceptUri, t])

    const themes = (
      <PassageThemes
        themes={globalThemes}
        hoveredConcept={hoveredConcept}
        pinnedConcept={pinnedConcept}
        onHoverConcept={onHoverConcept}
        onPinConcept={onPinConcept}
      />
    )

    if (specificSpans.length === 0) {
      return (
        <div>
          {themes}
          <span>{p.text}</span>
        </div>
      )
    }

    return (
      <div>
        {themes}
        <span>
          {chunks.map((chunk) =>
            chunk.matching.length === 0 ? (
              <span key={`txt-${chunk.start}-${chunk.end}`}>{chunk.text}</span>
            ) : (
              <AnnotatedMark
                key={`mark-${chunk.start}-${chunk.end}`}
                chunk={chunk}
                hoveredConcept={hoveredConcept}
                pinnedConcept={pinnedConcept}
                onHoverConcept={onHoverConcept}
                onPinConcept={onPinConcept}
              />
            ),
          )}
        </span>
      </div>
    )
  },
)

AnnotatedAncientText.displayName = 'AnnotatedAncientText'
