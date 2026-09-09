import React, { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchThesaurusAutocomplete, createAnnotation, createThesaurusProposal } from '../api/client'
import {
  OpenThesoAutocompleteItem,
  CreateAnnotationInput,
  AnnotationScopeType,
  TargetParagraphDetail
} from '../types'
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
  ChevronUp
} from 'lucide-react'
import { useI18n } from '../i18n'

export interface AnnotationModalProps {
  isOpen: boolean;
  onClose: () => void;
  paragraphUri: string;
  targetText: string;
  startOffset: number;
  endOffset: number;
  endParagraphUri?: string;
  targetParagraphs?: string[];
  targetParagraphDetails?: TargetParagraphDetail[];
  initialScopeType?: AnnotationScopeType;
  onSuccess?: () => void;
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
  onSuccess
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
        contributor_name: annotatorName.trim() || 'Chercheur anonyme'
      })

      // Sélection immédiate du concept nouvellement proposé
      const createdItem: OpenThesoAutocompleteItem = {
        label: proposal.pref_label,
        uri: `http://zoomathia.i3s.unice.fr/concept/proposal/${proposal.id}`,
        identifier: String(proposal.id)
      }
      setSelectedConcept(createdItem)
      setIsDefiningOnTheFly(false)
      queryClient.invalidateQueries({ queryKey: ['thesaurusProposals'] })
    } catch (err: any) {
      setError(err?.message || "Impossible de créer le concept à la volée.")
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
    }
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
      status: 'En attente de validation'
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-none border border-[#e6dfd3] shadow-2xl max-w-xl w-full my-8 overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        
        {/* En-tête */}
        <div className="p-4 sm:p-5 border-b border-[#f0eae0] flex items-center justify-between bg-[#faf9f6] shrink-0">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-[#9A6530]" />
            <h3 className="font-serif font-bold text-lg text-[#2c2724]">
              {t.modal.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#8c8275] hover:text-[#2c2724] p-1.5 rounded-none hover:bg-[#f4ede2] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corps défilable */}
        <div className="overflow-y-auto p-5 sm:p-6 space-y-4 text-xs scrollbar-thin flex-1">
          
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-none flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Extrait textuel ciblé */}
          <div className="p-3.5 bg-[#fdfaf5] rounded-none border border-[#ebdcc7] space-y-2">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider font-semibold text-[#8c8275]">
              <span>
                {t.modal.selectedExtract} ({startOffset} - {endOffset}) :
              </span>
              <span className="font-mono bg-[#f2e9dc] px-1.5 py-0.5 rounded-none text-[#6b4e2b]">
                {targetParagraphDetails && targetParagraphDetails.length > 1
                  ? `${targetParagraphDetails.length} paragraphes`
                  : targetParagraphs && targetParagraphs.length > 1
                    ? `${targetParagraphs.length} paragraphes`
                    : '1 paragraphe'}
              </span>
            </div>

            {/* Distinction claire des paragraphes si multi-paragraphes, avec défilement fluide */}
            {targetParagraphDetails && targetParagraphDetails.length > 1 ? (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1 scrollbar-thin">
                {targetParagraphDetails.map((tp, idx) => (
                  <div
                    key={tp.uri || idx}
                    className="p-2.5 bg-white/95 rounded-none border border-[#e6dfd1] shadow-2xs space-y-1"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-mono font-bold px-2 py-0.5 rounded-none bg-[#f4ede2] text-[#855424] border border-[#ded5c6]">
                        § {tp.id}
                      </span>
                      <span className="text-[10px] text-[#8c8275] font-mono">
                        {tp.text.length} car.
                      </span>
                    </div>
                    <blockquote className="ancient-text text-sm text-[#3b2e21] italic leading-relaxed">
                      « {tp.text} »
                    </blockquote>
                  </div>
                ))}
              </div>
            ) : (
              /* Sélection mono-paragraphe : défilable si longue, sans troncature artificielle */
              <div className="max-h-44 overflow-y-auto pr-1 scrollbar-thin">
                <blockquote className="ancient-text text-base font-semibold text-[#3b2e21] italic leading-relaxed">
                  « {targetText} »
                </blockquote>
              </div>
            )}
          </div>

          {/* Recherche & Sélection de concept TheZoo */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block font-semibold text-[#595248]">
                {t.modal.conceptLabel}
              </label>
              <button
                type="button"
                onClick={() => setIsDefiningOnTheFly(!isDefiningOnTheFly)}
                className="text-[#9A6530] hover:text-[#784d1e] font-semibold text-xs inline-flex items-center space-x-1"
              >
                {isDefiningOnTheFly ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" />
                    <span>{t.modal.defineOnTheFlyHide}</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t.modal.defineOnTheFly}</span>
                  </>
                )}
              </button>
            </div>

            {/* Volet de création de concept à la volée */}
            {isDefiningOnTheFly && (
              <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-none space-y-3 animate-in fade-in duration-150">
                <div className="flex items-center space-x-1.5 text-amber-900 font-bold text-xs">
                  <Layers className="w-4 h-4 text-[#9A6530]" />
                  <span>{t.modal.newConceptTitle}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[10px] font-semibold uppercase text-amber-900">
                      {t.modal.newPrefLabel}
                    </label>
                    <input
                      type="text"
                      value={newPrefLabel}
                      onChange={(e) => setNewPrefLabel(e.target.value)}
                      placeholder="Ex: Canis lupus, Aquila..."
                      className="w-full p-2 rounded-none border border-amber-300 bg-white text-xs focus:ring-2 focus:ring-[#9A6530] focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold uppercase text-amber-900">
                      {t.modal.newLanguage}
                    </label>
                    <select
                      value={newLanguage}
                      onChange={(e) => setNewLanguage(e.target.value as any)}
                      className="w-full p-2 rounded-lg border border-amber-300 bg-white text-xs focus:ring-2 focus:ring-[#9A6530] focus:outline-none"
                    >
                      <option value="la">Latin (la)</option>
                      <option value="grc">Grec ancien (grc)</option>
                      <option value="fr">Français (fr)</option>
                      <option value="en">Anglais (en)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase text-amber-900">
                    {t.modal.newAltLabels}
                  </label>
                  <input
                    type="text"
                    value={newAltLabels}
                    onChange={(e) => setNewAltLabels(e.target.value)}
                    placeholder="Ex: loup, lykos, canis..."
                    className="w-full p-2 rounded-none border border-amber-300 bg-white text-xs focus:ring-2 focus:ring-[#9A6530] focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase text-amber-900">
                    {t.modal.newBroader}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={broaderSearch}
                      onChange={(e) => setBroaderSearch(e.target.value)}
                      placeholder="Rechercher un parent dans TheZoo (ex: canidae, carnivore)..."
                      className="w-full p-2 pl-8 rounded-none border border-amber-300 bg-white text-xs focus:ring-2 focus:ring-[#9A6530] focus:outline-none"
                    />
                    <Search className="w-3.5 h-3.5 text-amber-600 absolute left-2.5 top-2.5" />
                    {isSearchingBroader && (
                      <Loader2 className="w-3.5 h-3.5 text-[#9A6530] absolute right-2.5 top-2.5 animate-spin" />
                    )}
                  </div>
                  {broaderSuggestions.length > 0 && (
                    <div className="max-h-28 overflow-y-auto border border-amber-200 rounded-none bg-white divide-y divide-amber-100 shadow-sm">
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
                          className="w-full text-left p-2 hover:bg-amber-50 flex items-center justify-between text-[11px]"
                        >
                          <span className="font-semibold text-[#2c2724]">{item.label}</span>
                          <span className="text-[9px] text-[#8c8275] font-mono truncate max-w-[150px]">
                            {item.uri}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {newBroaderUri && (
                    <div className="text-[11px] text-amber-900 flex items-center space-x-1 mt-1">
                      <Check className="w-3 h-3 text-emerald-600" />
                      <span>Parent : <strong>{newBroaderLabel || newBroaderUri}</strong></span>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase text-amber-900">
                    {t.modal.newDefinition}
                  </label>
                  <textarea
                    rows={2}
                    value={newDefinition}
                    onChange={(e) => setNewDefinition(e.target.value)}
                    placeholder="Précisez la signification zoo-archéologique ou philologique..."
                    className="w-full p-2 rounded-none border border-amber-300 bg-white text-xs focus:ring-2 focus:ring-[#9A6530] focus:outline-none resize-none"
                  />
                </div>

                <div className="flex justify-end space-x-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsDefiningOnTheFly(false)}
                    className="px-3 py-1.5 text-xs text-amber-900 hover:bg-amber-100 rounded-none"
                  >
                    {t.modal.cancelBtn}
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateConceptOnTheFly}
                    disabled={!newPrefLabel.trim() || isSubmittingConcept}
                    className="px-3 py-1.5 bg-[#9A6530] hover:bg-[#855424] text-white rounded-none text-xs font-semibold disabled:opacity-50 inline-flex items-center space-x-1.5"
                  >
                    {isSubmittingConcept ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>{t.modal.creatingConcept}</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3 h-3" />
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
                className="w-full p-2.5 pl-9 rounded-none border border-[#cfc5b4] bg-[#faf9f6] text-sm text-[#2c2724] focus:ring-2 focus:ring-[#9A6530] focus:outline-none"
              />
              <Search className="w-4 h-4 text-[#8c8275] absolute left-3 top-3" />
              {isSearching && (
                <Loader2 className="w-4 h-4 text-[#9A6530] absolute right-3 top-3 animate-spin" />
              )}
            </div>

            {/* Suggestions OpenTheso */}
            {suggestions.length > 0 && !selectedConcept && (
              <div className="max-h-40 overflow-y-auto border border-[#ded5c6] rounded-none bg-white shadow-md divide-y divide-[#f4ede2]">
                {suggestions.map((item) => (
                  <button
                    key={item.uri}
                    type="button"
                    onClick={() => {
                      setSelectedConcept(item)
                      setSearchTerm(item.label)
                      setSuggestions([])
                    }}
                    className="w-full text-left p-2.5 hover:bg-[#fcfbf9] flex items-center justify-between text-xs transition-colors"
                  >
                    <span className="font-semibold text-[#2c2724]">{item.label}</span>
                    <span className="text-[10px] text-[#8c8275] font-mono truncate max-w-[180px]">
                      {item.uri}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Concept sélectionné */}
            {selectedConcept && (
              <div className="p-2.5 bg-[#f0f7f2] border border-emerald-200 rounded-none flex items-center justify-between text-emerald-800">
                <div className="flex items-center space-x-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-semibold text-xs">{selectedConcept.label}</span>
                </div>
                <span className="text-[10px] text-emerald-700 font-mono truncate max-w-[200px]">
                  {selectedConcept.uri.includes('proposal') ? 'Nouveau concept' : 'TheZoo th310'}
                </span>
              </div>
            )}
          </div>

          {/* Zone de justification de l'annotateur */}
          <div className="space-y-1.5">
            <label className="block font-semibold text-[#595248] flex items-center space-x-1.5">
              <FileText className="w-3.5 h-3.5 text-[#9A6530]" />
              <span>{t.modal.justificationLabel}</span>
            </label>
            <textarea
              rows={3}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder={t.modal.justificationPlaceholder}
              className="w-full p-2.5 rounded-none border border-[#cfc5b4] bg-[#faf9f6] text-xs text-[#2c2724] focus:ring-2 focus:ring-[#9A6530] focus:outline-none resize-none"
            />
          </div>

          {/* Nom du contributeur */}
          <div className="space-y-1">
            <label className="block font-semibold text-[#595248]">
              {t.modal.annotatorLabel}
            </label>
            <input
              type="text"
              value={annotatorName}
              onChange={(e) => setAnnotatorName(e.target.value)}
              className="w-full p-2.5 rounded-none border border-[#cfc5b4] bg-[#faf9f6] text-xs text-[#2c2724] focus:ring-2 focus:ring-[#9A6530] focus:outline-none"
            />
          </div>

        </div>

        {/* Boutons d'action */}
        <div className="p-4 sm:p-5 border-t border-[#f0eae0] flex items-center justify-end space-x-2 bg-[#faf9f6] shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-[#696156] hover:bg-[#f4ede2] rounded-none transition-colors"
          >
            {t.modal.cancelBtn}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!selectedConcept || createMutation.isPending}
            className="px-5 py-2 text-xs font-semibold text-white bg-[#9A6530] hover:bg-[#855424] rounded-none shadow-sm transition-all disabled:opacity-50 inline-flex items-center space-x-1.5"
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{t.modal.saving}</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>{t.modal.submitBtn}</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  )
}
