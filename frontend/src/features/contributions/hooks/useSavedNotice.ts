import { useState } from 'react'
import { usePendingFilter } from './usePendingFilter'

/**
 * State of the "annotation saved, waiting for a review" notice (RM-ACC-03). The notice is for
 * the section where the annotation was saved and only while the unreviewed filter is off: it is
 * dropped when the filter turns on or the section changes, so it never comes back later. The
 * reset happens while rendering (derived state), not in an effect.
 */
export function useSavedNotice(sectionUri: string): { visible: boolean; show: () => void; dismiss: () => void } {
  const { includePending } = usePendingFilter()
  const [raisedFor, setRaisedFor] = useState<string | null>(null)
  if (raisedFor !== null && (includePending || raisedFor !== sectionUri)) setRaisedFor(null)
  return {
    visible: raisedFor === sectionUri && !includePending,
    show: () => setRaisedFor(sectionUri),
    dismiss: () => setRaisedFor(null),
  }
}
