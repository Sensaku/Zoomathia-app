/** Limits of the alternative labels of a term proposal (same as the backend). */
export const MAX_ALT_LABELS = 20
export const MAX_ALT_LABEL_LENGTH = 200

/** The labels of a comma-separated text: trimmed, no empty one, no duplicate (case ignored). */
export function parseAltLabels(text: string): string[] {
  const labels: string[] = []
  for (const part of text.split(',')) {
    const label = part.trim()
    if (label && !labels.some((known) => known.toLowerCase() === label.toLowerCase())) labels.push(label)
  }
  return labels
}

/** Tells whether the labels respect the backend limits. */
export function areAltLabelsValid(labels: string[]): boolean {
  return labels.length <= MAX_ALT_LABELS && labels.every((label) => label.length <= MAX_ALT_LABEL_LENGTH)
}
