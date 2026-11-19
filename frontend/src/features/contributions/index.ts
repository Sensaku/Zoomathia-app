/** Contributions feature: query keys, review, edit and delete hooks, status codes, shared components. */

export { CONTRIBUTION_ROOTS, SAVED_QUERIES_ROOT, contributionKeys } from './queryKeys'
export {
  useReviewAnnotation,
  useEditAnnotation,
  useDeleteAnnotation,
  useReviewProposal,
  useEditProposal,
  useDeleteProposal,
  useReloadContributions,
} from './hooks/useContributionMutations'
export { isContributionConflict } from './lib/conflict'
export { CONTRIBUTION_STATUSES, isContributionStatus } from './lib/status'
export { usePendingFilter } from './hooks/usePendingFilter'
export { useSavedNotice } from './hooks/useSavedNotice'
export { StatusBadge, StatusIcon } from './components/StatusBadge'
export { ContributorLine, formatAuthor, type ContributorFields } from './components/ContributorLine'
export {
  ContributionActions,
  type ActionableContribution,
  type ContributionActionsProps,
} from './components/ContributionActions'
export { RejectDialog, type RejectDialogProps } from './components/RejectDialog'
export { PendingToggle } from './components/PendingToggle'
export { PendingSavedNotice, type PendingSavedNoticeProps } from './components/PendingSavedNotice'
export { ConceptPicker, type ConceptPickerProps, type PickedConcept } from './components/ConceptPicker'
export { useConceptSuggestions } from './hooks/useConceptSuggestions'
export { AnnotationCreateDialog, type AnnotationCreateDialogProps } from './components/AnnotationCreateDialog'
export { AnnotationEditDialog, type AnnotationEditDialogProps } from './components/AnnotationEditDialog'
export { StagedAnnotationCard, type StagedAnnotationCardProps } from './components/StagedAnnotationCard'
export { RejectedAnnotationList, type RejectedAnnotationListProps } from './components/RejectedAnnotationList'
