import { StagedAnnotation } from '../../types'
import { ReadingParagraph, ReadingSpan } from './readingTypes'

/**
 * Résout et partitionne les annotations de référence et de staging pour un paragraphe donné.
 * Gère de manière unifiée et déterministe les annotations multi-paragraphes
 * (début, milieu, fin) et le filtrage contextuel d'inspection.
 */
export function resolveParagraphSpans(
  p: ReadingParagraph,
  referenceMap: Record<string, any> = {},
  stagedList: StagedAnnotation[] = [],
  filterConceptUri?: string | null
): { specificSpans: ReadingSpan[]; globalThemes: ReadingSpan[] } {
  const specificSpans: ReadingSpan[] = []
  const globalThemes: ReadingSpan[] = []

  // 1. Annotations de référence Corese
  for (const item of Object.values(referenceMap || {})) {
    if (filterConceptUri && item.concept !== filterConceptUri) {
      continue
    }

    const offsets: Array<{ start: number; end: number }> = item.offset || []
    const validOffsets = offsets.filter(
      (off) => Math.max(0, Math.min(off.start, p.text.length)) < Math.min(off.end, p.text.length)
    )

    if (validOffsets.length === 0) {
      // Aucune plage textuelle valide pour ce paragraphe -> thème global sans ancrage textuel
      globalThemes.push({
        start: 0,
        end: p.text.length,
        label: item.label,
        concept: item.concept,
        category: item.category,
        collection: item.collection,
        isStaged: false
      })
      continue
    }

    for (const off of validOffsets) {
      const sStart = Math.max(0, Math.min(off.start, p.text.length))
      const sEnd = Math.max(sStart, Math.min(off.end, p.text.length))
      if (sEnd > sStart) {
        specificSpans.push({
          start: sStart,
          end: sEnd,
          label: item.label,
          concept: item.concept,
          category: item.category,
          collection: item.collection,
          isStaged: false
        })
      }
    }
  }

  // 2. Annotations de staging (locales / révision)
  for (const s of stagedList) {
    if (filterConceptUri && s.concept_uri !== filterConceptUri) {
      continue
    }

    // Extraction robuste de l'ensemble des paragraphes couverts
    const targetParas: string[] =
      s.target_paragraphs && s.target_paragraphs.length > 0
        ? s.target_paragraphs
        : ([s.paragraph_uri, s.end_paragraph_uri].filter(Boolean) as string[])

    const touchesPara =
      targetParas.includes(p.uri) ||
      s.paragraph_uri === p.uri ||
      (!!s.end_paragraph_uri && s.end_paragraph_uri === p.uri)

    if (!touchesPara) {
      continue
    }

    const isMulti =
      targetParas.length > 1 ||
      s.scope_type === 'multi_paragraph' ||
      (!!s.end_paragraph_uri && s.end_paragraph_uri !== s.paragraph_uri)

    if (isMulti && targetParas.length > 1) {
      const startUri = targetParas[0]
      const endUri = targetParas[targetParas.length - 1]
      const isStart = p.uri === startUri
      const isEnd = p.uri === endUri
      const isMiddle = !isStart && !isEnd && targetParas.includes(p.uri)

      let sStart = 0
      let sEnd = p.text.length

      if (isStart) {
        sStart = Math.max(0, Math.min(s.start_offset, p.text.length))
        sEnd = p.text.length
      } else if (isEnd) {
        sStart = 0
        sEnd = s.end_offset > 0 ? Math.min(s.end_offset, p.text.length) : p.text.length
      } else if (isMiddle) {
        sStart = 0
        sEnd = p.text.length
      } else {
        continue
      }

      if (sEnd > sStart) {
        specificSpans.push({
          start: sStart,
          end: sEnd,
          label: s.concept_label,
          concept: s.concept_uri,
          category: (s as any).category,
          collection: (s as any).collection,
          isStaged: true,
          status: s.status,
          id: s.id,
          isMulti: true
        })
      }
    } else {
      // Intra-paragraphe
      if (s.paragraph_uri !== p.uri) {
        continue
      }

      const sStart = Math.max(0, Math.min(s.start_offset, p.text.length))
      const sEnd = Math.max(sStart, Math.min(s.end_offset > 0 ? s.end_offset : p.text.length, p.text.length))

      if (sEnd > sStart) {
        specificSpans.push({
          start: sStart,
          end: sEnd,
          label: s.concept_label,
          concept: s.concept_uri,
          category: (s as any).category,
          collection: (s as any).collection,
          isStaged: true,
          status: s.status,
          id: s.id,
          isMulti: false
        })
      } else {
        globalThemes.push({
          start: 0,
          end: p.text.length,
          label: s.concept_label,
          concept: s.concept_uri,
          category: (s as any).category,
          collection: (s as any).collection,
          isStaged: true,
          status: s.status,
          id: s.id
        })
      }
    }
  }

  // Déduplication des thèmes globaux
  const uniqueThemes = Array.from(
    new Map(globalThemes.map((item) => [item.concept, item])).values()
  )

  return { specificSpans, globalThemes: uniqueThemes }
}
