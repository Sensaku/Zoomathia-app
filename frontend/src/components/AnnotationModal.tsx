import React, { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchThesaurusAutocomplete, createAnnotation, createThesaurusProposal } from '../api/client'
import { OpenThesoAutocompleteItem, CreateAnnotationInput, AnnotationScopeType, TargetParagraphDetail } from '../types'
import {
  Sparkles,
  X,
  Search,
  Check,
  AlertCircle,
  Loader2,
  Plus,
  Layers,
  FileText,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { useI18n } from '../i18n'

export interface AnnotationModalProps {
  isOpen: boolean
  onClose: () => void
  paragraphUri: string
  targetText: string
  startOffset: number
  endOffset: number
  endParagraphUri?: string
  targetParagraphs?: string[]
  targetParagraphDetails?: TargetParagraphDetail[]
  initialScopeType?: AnnotationScopeType
  onSuccess?: () => void
}

/**
 * Modal d'annotation sémantique manuelle au standard W3C Web Annotation.
 * Connectée à TheZoo (OpenTheso th310), avec justification, création de concepts à la volée
 * et sélection de granularité (mot, séquence, phrase, paragraphe, multi-paragraphes).
 */
export const AnnotationModal: React.FC<AnnotationModalProps> = ({
  isOpen,
  onClose,
  paragraphUri,
  targetText,
  startOffset,
  endOffset,
  endParagraphUri,
  targetParagraphs,
  targetParagraphDetails,
  initialScopeType,
  onSuccess,
}) => {
  const { t } = useI18n()
  const queryClient = useQueryClient()

  // Saisie et recherche de concept
  const [searchTerm, setSearchTerm] = useState('')
  const [suggestions, setSuggestions] = useState<OpenThesoAutocompleteItem[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedConcept, setSelectedConcept] = useState<OpenThesoAutocompleteItem | null>(null)
  const [annotatorName, setAnnotatorName] = useState('Chercheur Zoomathia')
  const [justification, setJustification] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [scopeType, setScopeType] = useState<AnnotationScopeType>(initialScopeType || 'word_sequence')

  // Définition de concepts à la volée
  const [isDefiningOnTheFly, setIsDefiningOnTheFly] = useState(false)
  const [newPrefLabel, setNewPrefLabel] = useState('')
  const [newLanguage, setNewLanguage] = useState<'la' | 'grc' | 'fr' | 'en'>('la')
  const [newAltLabels, setNewAltLabels] = useState('')
  const [newBroaderUri, setNewBroaderUri] = useState('')
  const [newBroaderLabel, setNewBroaderLabel] = useState('')
  const [newDefinition, setNewDefinition] = useState('')
  const [isSubmittingConcept, setIsSubmittingConcept] = useState(false)
  const [broaderSearch, setBroaderSearch] = useState('')
  const [broaderSuggestions, setBroaderSuggestions] = useState<OpenThesoAutocompleteItem[]>([])
  const [isSearchingBroader, setIsSearchingBroader] = useState(false)

  // Détection de la granularité recommandée par défaut
  useEffect(() => {
    if (initialScopeType) {
      setScopeType(initialScopeType)
    } else if (targetParagraphs && targetParagraphs.length > 1) {
      setScopeType('multi_paragraph')
    } else if (startOffset === 0 && endOffset === targetText.length && targetText.length > 100) {
      setScopeType('paragraph')
    } else if (targetText.trim().endsWith('.') || targetText.trim().endsWith(';')) {
      setScopeType('sentence')
    } else if (!targetText.trim().includes(' ')) {
      setScopeType('word')
    } else {
      setScopeType('word_sequence')
    }
  }, [initialScopeType, targetParagraphs, targetText, startOffset, endOffset])

  // Préremplissage du terme de concept à la volée
  useEffect(() => {
    if (isDefiningOnTheFly && !newPrefLabel) {
      setNewPrefLabel(searchTerm || targetText.slice(0, 40))
    }
  }, [isDefiningOnTheFly, searchTerm, targetText, newPrefLabel])

  // Autocomplétion délayée (debounce 300ms) sur OpenTheso
  useEffect(() => {
    if (!searchTerm || searchTerm.trim().length < 2) {
      setSuggestions([])
      return
    }

    const timer = setTimeout(async () => {
      setIsSearching(true)
      try {
        const results = await fetchThesaurusAutocomplete(searchTerm.trim())
        setSuggestions(results)
      } catch (err) {
        console.error('Erreur autocomplétion OpenTheso:', err)
      } finally {
        setIsSearching(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [searchTerm])

  // Autocomplétion pour le concept parent générique à la volée
  useEffect(() => {
    if (!broaderSearch || broaderSearch.trim().length < 2) {
      setBroaderSuggestions([])
      return
    }

    const timer = setTimeout(async () => {
      setIsSearchingBroader(true)
      try {
        const results = await fetchThesaurusAutocomplete(broaderSearch.trim())
        setBroaderSuggestions(results)
      } catch (err) {
        console.error('Erreur autocomplétion broader:', err)
      } finally {
        setIsSearchingBroader(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [broaderSearch])

  // Création d'un nouveau concept à la volée
  const handleCreateConceptOnTheFly = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPrefLabel.trim()) {
      setError(t.thesaurus.prefLabelRequired)
      return
    }

    setIsSubmittingConcept(true)
    setError(null)

    try {
      const altLabelsList = newAltLabels
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

      const proposal = await createThesaurusProposal({
        pref_label: newPrefLabel.trim(),
        language: newLanguage,
        alt_labels: altLabelsList,
        broader_concept_uri: newBroaderUri || undefined,
        broader_concept_label: newBroaderLabel || undefined,
        definition: newDefinition.trim() || undefined,
        contributor_name: annotatorName.trim() || 'Chercheur anonyme',
      })

      // Sélection immédiate du concept nouvellement proposé
      const createdItem: OpenThesoAutocompleteItem = {
        label: proposal.pref_label,
        uri: `http://zoomathia.i3s.unice.fr/concept/proposal/${proposal.id}`,
        identifier: String(proposal.id),
      }
      setSelectedConcept(createdItem)
      setIsDefiningOnTheFly(false)
      queryClient.invalidateQueries({ queryKey: ['thesaurusProposals'] })
    } catch (err: any) {
      setError(err?.message || 'Impossible de créer le concept à la volée.')
    } finally {
      setIsSubmittingConcept(false)
    }
  }

  // Mutation d'enregistrement de l'annotation
  const createMutation = useMutation({
    mutationFn: (input: CreateAnnotationInput) => createAnnotation(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stagedAnnotations'] })
      queryClient.invalidateQueries({ queryKey: ['sectionAnnotations'] })
      if (onSuccess) onSuccess()
      onClose()
      // Réinitialisation du formulaire
      setSearchTerm('')
      setSelectedConcept(null)
      setJustification('')
      setError(null)
      setIsDefiningOnTheFly(false)
    },
    onError: (err: any) => {
      setError(err?.message || "Impossible d'enregistrer l'annotation.")
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedConcept) {
      setError(t.modal.selectConceptError)
      return
    }

    createMutation.mutate({
      paragraph_uri: paragraphUri,
      target_text: targetText,
      start_offset: startOffset,
      end_offset: endOffset,
      concept_uri: selectedConcept.uri,
      concept_label: selectedConcept.label,
      annotator_name: annotatorName.trim() || 'Chercheur anonyme',
      justification: justification.trim() || undefined,
      scope_type: scopeType,
      end_paragraph_uri: endParagraphUri,
      target_paragraphs: targetParagraphs,
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm">
      <div className="animate-in fade-in zoom-in-95 my-8 flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-none border border-[#e6dfd3] bg-white shadow-2xl duration-150">
        {/* En-tête */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#f0eae0] bg-[#faf9f6] p-4 sm:p-5">
          <div className="flex items-center space-x-2">
            <Sparkles className="h-5 w-5 text-[#9A6530]" />
            <h3 className="font-serif text-lg font-bold text-[#2c2724]">{t.modal.title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-none p-1.5 text-[#8c8275] transition-colors hover:bg-[#f4ede2] hover:text-[#2c2724]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Corps défilable */}
        <div className="flex-1 scrollbar-thin space-y-4 overflow-y-auto p-5 text-xs sm:p-6">
          {error && (
            <div className="flex items-center space-x-2 rounded-none border border-red-200 bg-red-50 p-3 text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Extrait textuel ciblé */}
          <div className="space-y-2 rounded-none border border-[#ebdcc7] bg-[#fdfaf5] p-3.5">
            <div className="flex items-center justify-between text-[10px] font-semibold tracking-wider text-[#8c8275] uppercase">
              <span>
                {t.modal.selectedExtract} ({startOffset} - {endOffset}) :
              </span>
              <span className="rounded-none bg-[#f2e9dc] px-1.5 py-0.5 font-mono text-[#6b4e2b]">
                {targetParagraphDetails && targetParagraphDetails.length > 1
                  ? `${targetParagraphDetails.length} paragraphes`
                  : targetParagraphs && targetParagraphs.length > 1
                    ? `${targetParagraphs.length} paragraphes`
                    : '1 paragraphe'}
              </span>
            </div>

            {/* Distinction claire des paragraphes si multi-paragraphes, avec défilement fluide */}
            {targetParagraphDetails && targetParagraphDetails.length > 1 ? (
              <div className="max-h-52 scrollbar-thin space-y-2 overflow-y-auto pr-1">
                {targetParagraphDetails.map((tp, idx) => (
                  <div
                    key={tp.uri || idx}
                    className="space-y-1 rounded-none border border-[#e6dfd1] bg-white/95 p-2.5 shadow-2xs"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="rounded-none border border-[#ded5c6] bg-[#f4ede2] px-2 py-0.5 font-mono font-bold text-[#855424]">
                        § {tp.id}
                      </span>
                      <span className="font-mono text-[10px] text-[#8c8275]">{tp.text.length} car.</span>
                    </div>
                    <blockquote className="ancient-text text-sm leading-relaxed text-[#3b2e21] italic">
                      « {tp.text} »
                    </blockquote>
                  </div>
                ))}
              </div>
            ) : (
              /* Sélection mono-paragraphe : défilable si longue, sans troncature artificielle */
              <div className="max-h-44 scrollbar-thin overflow-y-auto pr-1">
                <blockquote className="ancient-text text-base leading-relaxed font-semibold text-[#3b2e21] italic">
                  « {targetText} »
                </blockquote>
              </div>
            )}
          </div>

          {/* Recherche & Sélection de concept TheZoo */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block font-semibold text-[#595248]">{t.modal.conceptLabel}</label>
              <button
                type="button"
                onClick={() => setIsDefiningOnTheFly(!isDefiningOnTheFly)}
                className="inline-flex items-center space-x-1 text-xs font-semibold text-[#9A6530] hover:text-[#784d1e]"
              >
                {isDefiningOnTheFly ? (
                  <>
                    <ChevronUp className="h-3.5 w-3.5" />
                    <span>{t.modal.defineOnTheFlyHide}</span>
                  </>
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" />
                    <span>{t.modal.defineOnTheFly}</span>
                  </>
                )}
              </button>
            </div>

            {/* Volet de création de concept à la volée */}
            {isDefiningOnTheFly && (
              <div className="animate-in fade-in space-y-3 rounded-none border border-amber-200 bg-amber-50/70 p-4 duration-150">
                <div className="flex items-center space-x-1.5 text-xs font-bold text-amber-900">
                  <Layers className="h-4 w-4 text-[#9A6530]" />
                  <span>{t.modal.newConceptTitle}</span>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-[10px] font-semibold text-amber-900 uppercase">{t.modal.newPrefLabel}</label>
                    <input
                      type="text"
                      value={newPrefLabel}
                      onChange={(e) => setNewPrefLabel(e.target.value)}
                      placeholder="Ex: Canis lupus, Aquila..."
                      className="w-full rounded-none border border-amber-300 bg-white p-2 text-xs focus:ring-2 focus:ring-[#9A6530] focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-amber-900 uppercase">{t.modal.newLanguage}</label>
                    <select
                      value={newLanguage}
                      onChange={(e) => setNewLanguage(e.target.value as any)}
                      className="w-full rounded-lg border border-amber-300 bg-white p-2 text-xs focus:ring-2 focus:ring-[#9A6530] focus:outline-none"
                    >
                      <option value="la">Latin (la)</option>
                      <option value="grc">Grec ancien (grc)</option>
                      <option value="fr">Français (fr)</option>
                      <option value="en">Anglais (en)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-amber-900 uppercase">{t.modal.newAltLabels}</label>
                  <input
                    type="text"
                    value={newAltLabels}
                    onChange={(e) => setNewAltLabels(e.target.value)}
                    placeholder="Ex: loup, lykos, canis..."
                    className="w-full rounded-none border border-amber-300 bg-white p-2 text-xs focus:ring-2 focus:ring-[#9A6530] focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-amber-900 uppercase">{t.modal.newBroader}</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={broaderSearch}
                      onChange={(e) => setBroaderSearch(e.target.value)}
                      placeholder="Rechercher un parent dans TheZoo (ex: canidae, carnivore)..."
                      className="w-full rounded-none border border-amber-300 bg-white p-2 pl-8 text-xs focus:ring-2 focus:ring-[#9A6530] focus:outline-none"
                    />
                    <Search className="absolute top-2.5 left-2.5 h-3.5 w-3.5 text-amber-600" />
                    {isSearchingBroader && (
                      <Loader2 className="absolute top-2.5 right-2.5 h-3.5 w-3.5 animate-spin text-[#9A6530]" />
                    )}
                  </div>
                  {broaderSuggestions.length > 0 && (
                    <div className="max-h-28 divide-y divide-amber-100 overflow-y-auto rounded-none border border-amber-200 bg-white shadow-sm">
                      {broaderSuggestions.map((item) => (
                        <button
                          key={item.uri}
                          type="button"
                          onClick={() => {
                            setNewBroaderUri(item.uri)
                            setNewBroaderLabel(item.label)
                            setBroaderSearch(item.label)
                            setBroaderSuggestions([])
                          }}
                          className="flex w-full items-center justify-between p-2 text-left text-[11px] hover:bg-amber-50"
                        >
                          <span className="font-semibold text-[#2c2724]">{item.label}</span>
                          <span className="max-w-[150px] truncate font-mono text-[9px] text-[#8c8275]">{item.uri}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {newBroaderUri && (
                    <div className="mt-1 flex items-center space-x-1 text-[11px] text-amber-900">
                      <Check className="h-3 w-3 text-emerald-600" />
                      <span>
                        Parent : <strong>{newBroaderLabel || newBroaderUri}</strong>
                      </span>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-amber-900 uppercase">{t.modal.newDefinition}</label>
                  <textarea
                    rows={2}
                    value={newDefinition}
                    onChange={(e) => setNewDefinition(e.target.value)}
                    placeholder="Précisez la signification zoo-archéologique ou philologique..."
                    className="w-full resize-none rounded-none border border-amber-300 bg-white p-2 text-xs focus:ring-2 focus:ring-[#9A6530] focus:outline-none"
                  />
                </div>

                <div className="flex justify-end space-x-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsDefiningOnTheFly(false)}
                    className="rounded-none px-3 py-1.5 text-xs text-amber-900 hover:bg-amber-100"
                  >
                    {t.modal.cancelBtn}
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateConceptOnTheFly}
                    disabled={!newPrefLabel.trim() || isSubmittingConcept}
                    className="inline-flex items-center space-x-1.5 rounded-none bg-[#9A6530] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#855424] disabled:opacity-50"
                  >
                    {isSubmittingConcept ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>{t.modal.creatingConcept}</span>
                      </>
                    ) : (
                      <>
                        <Plus className="h-3 w-3" />
                        <span>{t.modal.createConceptBtn}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Champ de recherche standard OpenTheso */}
            <div className="relative">
              <input
                type="text"
                placeholder={t.modal.conceptPlaceholder}
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  setSelectedConcept(null)
                }}
                className="w-full rounded-none border border-[#cfc5b4] bg-[#faf9f6] p-2.5 pl-9 text-sm text-[#2c2724] focus:ring-2 focus:ring-[#9A6530] focus:outline-none"
              />
              <Search className="absolute top-3 left-3 h-4 w-4 text-[#8c8275]" />
              {isSearching && <Loader2 className="absolute top-3 right-3 h-4 w-4 animate-spin text-[#9A6530]" />}
            </div>

            {/* Suggestions OpenTheso */}
            {suggestions.length > 0 && !selectedConcept && (
              <div className="max-h-40 divide-y divide-[#f4ede2] overflow-y-auto rounded-none border border-[#ded5c6] bg-white shadow-md">
                {suggestions.map((item) => (
                  <button
                    key={item.uri}
                    type="button"
                    onClick={() => {
                      setSelectedConcept(item)
                      setSearchTerm(item.label)
                      setSuggestions([])
                    }}
                    className="flex w-full items-center justify-between p-2.5 text-left text-xs transition-colors hover:bg-[#fcfbf9]"
                  >
                    <span className="font-semibold text-[#2c2724]">{item.label}</span>
                    <span className="max-w-[180px] truncate font-mono text-[10px] text-[#8c8275]">{item.uri}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Concept sélectionné */}
            {selectedConcept && (
              <div className="flex items-center justify-between rounded-none border border-emerald-200 bg-[#f0f7f2] p-2.5 text-emerald-800">
                <div className="flex items-center space-x-2">
                  <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span className="text-xs font-semibold">{selectedConcept.label}</span>
                </div>
                <span className="max-w-[200px] truncate font-mono text-[10px] text-emerald-700">
                  {selectedConcept.uri.includes('proposal') ? 'Nouveau concept' : 'TheZoo th310'}
                </span>
              </div>
            )}
          </div>

          {/* Zone de justification de l'annotateur */}
          <div className="space-y-1.5">
            <label className="block flex items-center space-x-1.5 font-semibold text-[#595248]">
              <FileText className="h-3.5 w-3.5 text-[#9A6530]" />
              <span>{t.modal.justificationLabel}</span>
            </label>
            <textarea
              rows={3}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder={t.modal.justificationPlaceholder}
              className="w-full resize-none rounded-none border border-[#cfc5b4] bg-[#faf9f6] p-2.5 text-xs text-[#2c2724] focus:ring-2 focus:ring-[#9A6530] focus:outline-none"
            />
          </div>

          {/* Nom du contributeur */}
          <div className="space-y-1">
            <label className="block font-semibold text-[#595248]">{t.modal.annotatorLabel}</label>
            <input
              type="text"
              value={annotatorName}
              onChange={(e) => setAnnotatorName(e.target.value)}
              className="w-full rounded-none border border-[#cfc5b4] bg-[#faf9f6] p-2.5 text-xs text-[#2c2724] focus:ring-2 focus:ring-[#9A6530] focus:outline-none"
            />
          </div>
        </div>

        {/* Boutons d'action */}
        <div className="flex shrink-0 items-center justify-end space-x-2 border-t border-[#f0eae0] bg-[#faf9f6] p-4 sm:p-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-none px-4 py-2 text-xs font-medium text-[#696156] transition-colors hover:bg-[#f4ede2]"
          >
            {t.modal.cancelBtn}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!selectedConcept || createMutation.isPending}
            className="inline-flex items-center space-x-1.5 rounded-none bg-[#9A6530] px-5 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-[#855424] disabled:opacity-50"
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>{t.modal.saving}</span>
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                <span>{t.modal.submitBtn}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
