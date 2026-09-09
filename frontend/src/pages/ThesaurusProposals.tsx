import React, { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchThesaurusProposals,
  createThesaurusProposal,
  updateThesaurusProposalStatus,
  deleteThesaurusProposal,
  fetchThesaurusAutocomplete,
  BASE_URL
} from '../api/client'
import {
  ThesaurusProposal,
  CreateThesaurusProposalInput,
  OpenThesoAutocompleteItem
} from '../types'
import {
  PlusCircle,
  Download,
  Search,
  Check,
  AlertCircle,
  Loader2,
  ExternalLink,
  Layers,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  Tag,
  User,
  X,
  BookOpen,
  Sparkles
} from 'lucide-react'
import { useI18n } from '../i18n'

export const ThesaurusProposals: React.FC = () => {
  const { t } = useI18n()
  const queryClient = useQueryClient()

  // Formulaire d'enrichissement
  const [prefLabel, setPrefLabel] = useState('')
  const [language, setLanguage] = useState('fr')
  const [altLabels, setAltLabels] = useState<string[]>([])
  const [altLabelInput, setAltLabelInput] = useState('')
  const [definition, setDefinition] = useState('')
  const [contributorName, setContributorName] = useState('Chercheur Zoomathia')

  // Autocomplétion pour le concept parent (broader)
  const [broaderSearch, setBroaderSearch] = useState('')
  const [broaderSuggestions, setBroaderSuggestions] = useState<OpenThesoAutocompleteItem[]>([])
  const [selectedBroader, setSelectedBroader] = useState<OpenThesoAutocompleteItem | null>(null)
  const [isSearchingBroader, setIsSearchingBroader] = useState(false)

  // Filtres et recherche du registre
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'En attente de révision' | 'Validé' | 'Rejeté'>('ALL')
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)

  const [formError, setFormError] = useState<string | null>(null)
  const [successNotice, setSuccessNotice] = useState<string | null>(null)

  // 1. Liste des propositions enregistrées
  const { data: proposals = [], isLoading: isProposalsLoading } = useQuery({
    queryKey: ['thesaurusProposals'],
    queryFn: () => fetchThesaurusProposals(),
  })

  // 2. Autocomplétion OpenTheso pour le terme générique
  useEffect(() => {
    if (!broaderSearch || broaderSearch.trim().length < 2 || selectedBroader) {
      setBroaderSuggestions([])
      return
    }

    const timer = setTimeout(async () => {
      setIsSearchingBroader(true)
      try {
        const results = await fetchThesaurusAutocomplete(broaderSearch.trim())
        setBroaderSuggestions(results)
      } catch (err) {
        console.error('Erreur autocomplétion:', err)
      } finally {
        setIsSearchingBroader(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [broaderSearch, selectedBroader])

  // 3. Mutations
  const proposalMutation = useMutation({
    mutationFn: (input: CreateThesaurusProposalInput) => createThesaurusProposal(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['thesaurusProposals'] })
      setSuccessNotice(t.thesaurus.successMessage)
      setPrefLabel('')
      setAltLabels([])
      setAltLabelInput('')
      setDefinition('')
      setSelectedBroader(null)
      setBroaderSearch('')
      setFormError(null)
      setTimeout(() => setSuccessNotice(null), 6000)
    },
    onError: (err: any) => {
      setFormError(err?.message || "Erreur lors de l'enregistrement de la proposition.")
    }
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      updateThesaurusProposalStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['thesaurusProposals'] })
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteThesaurusProposal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['thesaurusProposals'] })
      setDeleteConfirmId(null)
    }
  })

  // Gestion des tags de synonymes
  const handleAddAltLabel = (value: string) => {
    const parts = value.split(',').map((p) => p.trim()).filter(Boolean)
    if (parts.length === 0) return
    setAltLabels((prev) => {
      const next = [...prev]
      for (const p of parts) {
        if (!next.some((item) => item.toLowerCase() === p.toLowerCase())) {
          next.push(p)
        }
      }
      return next
    })
    setAltLabelInput('')
  }

  const handleAltKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      handleAddAltLabel(altLabelInput)
    } else if (e.key === 'Backspace' && !altLabelInput && altLabels.length > 0) {
      setAltLabels((prev) => prev.slice(0, -1))
    }
  }

  const handleRemoveAltLabel = (indexToRemove: number) => {
    setAltLabels((prev) => prev.filter((_, idx) => idx !== indexToRemove))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!prefLabel.trim()) {
      setFormError(t.thesaurus.prefLabelRequired)
      return
    }

    const finalAltLabels = [...altLabels]
    if (altLabelInput.trim()) {
      const parts = altLabelInput.split(',').map((p) => p.trim()).filter(Boolean)
      for (const p of parts) {
        if (!finalAltLabels.some((item) => item.toLowerCase() === p.toLowerCase())) {
          finalAltLabels.push(p)
        }
      }
    }

    proposalMutation.mutate({
      pref_label: prefLabel.trim(),
      language,
      alt_labels: finalAltLabels,
      broader_concept_uri: selectedBroader?.uri,
      broader_concept_label: selectedBroader?.label,
      definition: definition.trim() || undefined,
      contributor_name: contributorName.trim() || 'Chercheur anonyme'
    })
  }

  // Helper de normalisation de statut pour le filtrage
  const matchesStatus = (propStatus?: string, target?: string) => {
    if (!target || target === 'ALL') return true
    const p = (propStatus || '').toLowerCase()
    const t = target.toLowerCase()
    if (t.includes('attente')) return p.includes('attente')
    if (t.includes('valid')) return p.includes('valid')
    if (t.includes('rejet')) return p.includes('rejet')
    return p === t
  }

  // Filtrage des propositions
  const filteredProposals = useMemo(() => {
    return proposals.filter((p) => {
      if (statusFilter !== 'ALL' && !matchesStatus(p.status, statusFilter)) {
        return false
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const inPref = p.pref_label?.toLowerCase().includes(q)
        const inAlts = p.alt_labels?.some((alt) => alt.toLowerCase().includes(q))
        const inAuthor = p.contributor_name?.toLowerCase().includes(q)
        const inDef = p.definition?.toLowerCase().includes(q)
        const inBroader = p.broader_concept_label?.toLowerCase().includes(q)
        return inPref || inAlts || inAuthor || inDef || inBroader
      }
      return true
    })
  }, [proposals, statusFilter, searchQuery])

  // Statistiques
  const stats = useMemo(() => {
    const total = proposals.length
    const pending = proposals.filter((p) => matchesStatus(p.status, 'attente')).length
    const validated = proposals.filter((p) => matchesStatus(p.status, 'valid')).length
    const rejected = proposals.filter((p) => matchesStatus(p.status, 'rejet')).length
    return { total, pending, validated, rejected }
  }, [proposals])

  const getLanguageBadge = (lang: string) => {
    switch (lang.toLowerCase()) {
      case 'fr':
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">FR</span>
      case 'en':
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">EN</span>
      case 'grc':
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">GRC (Grec)</span>
      case 'la':
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">LA (Latin)</span>
      default:
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#f4ede2] text-[#736a5f] border border-[#e6dfd3] uppercase">{lang}</span>
    }
  }

  const getStatusBadge = (status: string) => {
    if (status === 'Validé') {
      return (
        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-medium">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          <span>{t.thesaurus.statusValidated}</span>
        </span>
      )
    }
    if (status === 'Rejeté') {
      return (
        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-full text-xs font-medium">
          <XCircle className="w-3 h-3 text-rose-600" />
          <span>{t.thesaurus.statusRejected}</span>
        </span>
      )
    }
    return (
      <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-full text-xs font-medium">
        <Clock className="w-3 h-3 text-amber-600" />
        <span>{t.thesaurus.statusPending}</span>
      </span>
    )
  }

  return (
    <div className="py-6 space-y-6 max-w-7xl mx-auto">
      
      {/* 1. Hero Banner avec métriques et accès thésaurus */}
      <div className="relative overflow-hidden bg-gradient-to-r from-[#2c2724] via-[#3a322c] to-[#473a30] text-white rounded-none p-6 md:p-8 shadow-md border border-[#524438]">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[#9A6530]/30 border border-[#c49257]/40 text-[#f3d9b8] text-xs font-medium">
              <Sparkles className="w-3.5 h-3.5 text-[#e5aa66]" />
              <span>Enrichissement Sémantique SKOS</span>
            </div>
            <h1 className="font-serif text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight text-[#fdfcf9]">
              {t.thesaurus.title}
            </h1>
            <p className="text-sm md:text-base text-[#d8cfc4] leading-relaxed">
              {t.thesaurus.subtitle}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            {/* Lien officiel OpenTheso */}
            <a
              href="https://opentheso.huma-num.fr/opentheso/?idt=th310"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center space-x-2 px-4 py-2.5 rounded-none bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-medium backdrop-blur-sm transition-all shadow-sm"
            >
              <BookOpen className="w-4 h-4 text-[#e5aa66]" />
              <span>{t.thesaurus.openInTheZoo}</span>
              <ExternalLink className="w-3 h-3 opacity-70" />
            </a>

            {/* Export SKOS Turtle */}
            <a
              href={`${BASE_URL}/thesaurus/proposals/export-ttl`}
              download
              className="inline-flex items-center justify-center space-x-2 px-4 py-2.5 rounded-none bg-[#9A6530] hover:bg-[#835222] text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>{t.thesaurus.exportTtlBtn}</span>
            </a>
          </div>

        </div>

        {/* Métriques globales */}
        <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-white/10">
          <div className="bg-white/5 backdrop-blur-xs rounded-none p-3 border border-white/10">
            <span className="block text-[11px] text-[#beb4a8]">{t.thesaurus.statTotal}</span>
            <span className="text-xl font-bold font-serif text-white">{stats.total}</span>
          </div>
          <div className="bg-amber-500/10 backdrop-blur-xs rounded-none p-3 border border-amber-500/20">
            <span className="block text-[11px] text-amber-200">{t.thesaurus.statPending}</span>
            <span className="text-xl font-bold font-serif text-amber-300">{stats.pending}</span>
          </div>
          <div className="bg-emerald-500/10 backdrop-blur-xs rounded-none p-3 border border-emerald-500/20">
            <span className="block text-[11px] text-emerald-200">{t.thesaurus.statValidated}</span>
            <span className="text-xl font-bold font-serif text-emerald-300">{stats.validated}</span>
          </div>
          <div className="bg-rose-500/10 backdrop-blur-xs rounded-none p-3 border border-rose-500/20">
            <span className="block text-[11px] text-rose-200">{t.thesaurus.filterRejected}</span>
            <span className="text-xl font-bold font-serif text-rose-300">{stats.rejected}</span>
          </div>
        </div>

      </div>

      {/* 2. Colonnes principales : Formulaire (5 cols) & Registre (7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Colonne 1 : Formulaire de proposition de concept */}
        <div className="lg:col-span-5 bg-white p-6 rounded-none border border-[#e6dfd3] shadow-xs space-y-6">
          
          <div className="border-b border-[#f0eae0] pb-4">
            <h2 className="font-serif font-bold text-lg text-[#2c2724] flex items-center space-x-2">
              <PlusCircle className="w-5 h-5 text-[#9A6530]" />
              <span>{t.thesaurus.formTitle}</span>
            </h2>
            <p className="text-xs text-[#736a5f] mt-1">
              {t.thesaurus.formSubtitle}
            </p>
          </div>

          {formError && (
            <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-none text-xs flex items-start space-x-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{formError}</span>
            </div>
          )}

          {successNotice && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-none text-xs flex items-start space-x-2.5">
              <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{successNotice}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            
            {/* Section 1 : Terme préférentiel & Langue */}
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <label className="block font-semibold text-[#4a4238]">
                    {t.thesaurus.prefLabel}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={t.thesaurus.prefLabelPlaceholder}
                    value={prefLabel}
                    onChange={(e) => setPrefLabel(e.target.value)}
                    className="w-full p-2.5 rounded-none border border-[#cfc5b4] bg-[#faf9f6] text-sm text-[#2c2724] placeholder:text-[#9e9486] focus:bg-white focus:ring-2 focus:ring-[#9A6530] focus:border-[#9A6530] focus:outline-none transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block font-semibold text-[#4a4238]">
                    {t.thesaurus.languageLabel}
                  </label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-[#cfc5b4] bg-[#faf9f6] text-sm text-[#2c2724] focus:bg-white focus:ring-2 focus:ring-[#9A6530] focus:border-[#9A6530] focus:outline-none font-medium transition-all"
                  >
                    <option value="fr">Français (fr)</option>
                    <option value="en">English (en)</option>
                    <option value="grc">Grec anc. (grc)</option>
                    <option value="la">Latin (la)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Section 2 : Variantes / Synonymes (Gestion par tags interactifs) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-[#4a4238]">
                  {t.thesaurus.altLabels}
                </label>
                <span className="text-[10px] text-[#8c8275]">
                  {altLabels.length} {altLabels.length > 1 ? 'synonymes' : 'synonyme'}
                </span>
              </div>

              <div className="p-2 border border-[#cfc5b4] bg-[#faf9f6] rounded-none focus-within:bg-white focus-within:ring-2 focus-within:ring-[#9A6530] focus-within:border-[#9A6530] transition-all">
                <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                  {altLabels.map((tag, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-none text-xs bg-[#f2ecdf] text-[#5c4a38] border border-[#e0d3be] font-medium"
                    >
                      <Tag className="w-2.5 h-2.5 text-[#9A6530]" />
                      <span>{tag}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveAltLabel(idx)}
                        className="p-0.5 hover:bg-[#dfd4c3] rounded-none text-[#8c7b6c] hover:text-[#423326] transition-colors cursor-pointer"
                        title={t.thesaurus.removeBroader}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>

                <div className="flex items-center space-x-1.5">
                  <input
                    type="text"
                    placeholder={t.thesaurus.altLabelsPlaceholder}
                    value={altLabelInput}
                    onChange={(e) => setAltLabelInput(e.target.value)}
                    onKeyDown={handleAltKeyDown}
                    className="w-full p-1 bg-transparent text-xs text-[#2c2724] placeholder:text-[#9e9486] focus:outline-none"
                  />
                  {altLabelInput.trim() && (
                    <button
                      type="button"
                      onClick={() => handleAddAltLabel(altLabelInput)}
                      className="px-2 py-1 bg-[#9A6530] text-white rounded-none text-[11px] font-medium hover:bg-[#825424] cursor-pointer"
                    >
                      Ajouter
                    </button>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-[#8c8275]">
                {t.thesaurus.tagAddHelp}
              </p>
            </div>

            {/* Section 3 : Concept parent (skos:broader) OpenTheso */}
            <div className="space-y-1.5">
              <label className="block font-semibold text-[#4a4238]">
                {t.thesaurus.broaderLabel}
              </label>

              {selectedBroader ? (
                <div className="p-3 bg-[#fbf8f2] border border-[#dfd3be] rounded-none flex items-center justify-between">
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <div className="p-1.5 rounded-none bg-[#9A6530]/10 text-[#9A6530]">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div className="truncate">
                      <strong className="block text-xs text-[#2c2724] font-medium truncate">
                        {selectedBroader.label}
                      </strong>
                      <span className="text-[10px] text-[#8c8275] font-mono">
                        TheZoo · {selectedBroader.identifier}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedBroader(null)
                      setBroaderSearch('')
                    }}
                    className="px-2 py-1 rounded-none text-[11px] text-red-600 hover:bg-red-50 font-medium transition-colors cursor-pointer"
                  >
                    {t.thesaurus.removeBroader}
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    placeholder={t.thesaurus.broaderPlaceholder}
                    value={broaderSearch}
                    onChange={(e) => setBroaderSearch(e.target.value)}
                    className="w-full p-2.5 pl-8 rounded-none border border-[#cfc5b4] bg-[#faf9f6] text-sm text-[#2c2724] placeholder:text-[#9e9486] focus:bg-white focus:ring-2 focus:ring-[#9A6530] focus:border-[#9A6530] focus:outline-none transition-all"
                  />
                  <Search className="w-4 h-4 text-[#8c8275] absolute left-2.5 top-3" />
                  {isSearchingBroader && (
                    <Loader2 className="w-4 h-4 text-[#9A6530] absolute right-3 top-3 animate-spin" />
                  )}

                  {broaderSuggestions.length > 0 && (
                    <div className="absolute z-20 w-full mt-1 max-h-48 overflow-y-auto border border-[#ded5c6] rounded-none bg-white shadow-lg divide-y divide-[#f4ede2]">
                      {broaderSuggestions.map((item) => (
                        <button
                          key={item.uri}
                          type="button"
                          onClick={() => {
                            setSelectedBroader(item)
                            setBroaderSearch('')
                            setBroaderSuggestions([])
                          }}
                          className="w-full text-left p-2.5 hover:bg-[#faf7f2] flex items-center justify-between text-xs transition-colors cursor-pointer"
                        >
                          <span className="font-semibold text-[#2c2724]">{item.label}</span>
                          <span className="text-[10px] text-[#8c8275] font-mono truncate max-w-[140px] ml-2">
                            {item.identifier}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Section 4 : Définition ou contexte zoologique */}
            <div className="space-y-1.5">
              <label className="block font-semibold text-[#4a4238]">
                {t.thesaurus.definition}
              </label>
              <textarea
                rows={3}
                placeholder={t.thesaurus.definitionPlaceholder}
                value={definition}
                onChange={(e) => setDefinition(e.target.value)}
                className="w-full p-2.5 rounded-none border border-[#cfc5b4] bg-[#faf9f6] text-sm text-[#2c2724] placeholder:text-[#9e9486] focus:bg-white focus:ring-2 focus:ring-[#9A6530] focus:border-[#9A6530] focus:outline-none transition-all"
              />
            </div>

            {/* Section 5 : Nom du chercheur */}
            <div className="space-y-1.5">
              <label className="block font-semibold text-[#4a4238]">
                {t.thesaurus.contributorName}
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={contributorName}
                  onChange={(e) => setContributorName(e.target.value)}
                  className="w-full p-2.5 pl-8 rounded-none border border-[#cfc5b4] bg-[#faf9f6] text-sm text-[#2c2724] focus:bg-white focus:ring-2 focus:ring-[#9A6530] focus:border-[#9A6530] focus:outline-none transition-all"
                />
                <User className="w-4 h-4 text-[#8c8275] absolute left-2.5 top-3" />
              </div>
            </div>

            {/* Bouton de soumission */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={proposalMutation.isPending || !prefLabel.trim()}
                className="w-full py-3 bg-[#9A6530] hover:bg-[#835222] text-white rounded-none font-semibold text-sm shadow-sm transition-all disabled:opacity-50 inline-flex items-center justify-center space-x-2 cursor-pointer"
              >
                {proposalMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{t.thesaurus.submitting}</span>
                  </>
                ) : (
                  <>
                    <PlusCircle className="w-4 h-4" />
                    <span>{t.thesaurus.submitBtn}</span>
                  </>
                )}
              </button>
            </div>

          </form>

        </div>

        {/* Colonne 2 : Registre de révision scientifique & Modération */}
        <div className="lg:col-span-7 bg-white p-6 rounded-none border border-[#e6dfd3] shadow-xs space-y-5">
          
          {/* En-tête de registre & filtres */}
          <div className="space-y-3 pb-3 border-b border-[#f0eae0]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-serif font-bold text-lg text-[#2c2724] flex items-center space-x-2">
                  <span>{t.thesaurus.proposalsTitle}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[#f4ede2] text-[#6e6356] font-mono font-bold">
                    {filteredProposals.length}
                  </span>
                </h2>
                <span className="text-xs text-[#736a5f]">
                  {proposals.length} {t.thesaurus.proposalsAwaiting}
                </span>
              </div>

              {/* Barre de recherche dans le registre */}
              <div className="relative w-full sm:w-64">
                <input
                  type="text"
                  placeholder={t.thesaurus.searchPlaceholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-none border border-[#cfc5b4] bg-[#faf9f6] text-xs text-[#2c2724] placeholder:text-[#9e9486] focus:bg-white focus:ring-2 focus:ring-[#9A6530] focus:outline-none transition-all"
                />
                <Search className="w-3.5 h-3.5 text-[#8c8275] absolute left-2.5 top-2.5" />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="p-1 text-[#8c8275] hover:text-[#2c2724] absolute right-1.5 top-1.5 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Onglets de filtrage par statut */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => setStatusFilter('ALL')}
                className={`px-3 py-1 rounded-none text-xs font-medium transition-all cursor-pointer ${
                  statusFilter === 'ALL'
                    ? 'bg-[#2c2724] text-white shadow-2xs'
                    : 'bg-[#faf8f5] text-[#696156] hover:bg-[#f2ece1] border border-[#e6dfd3]'
                }`}
              >
                {t.thesaurus.filterAll} ({stats.total})
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('En attente de révision')}
                className={`px-3 py-1 rounded-none text-xs font-medium transition-all cursor-pointer ${
                  statusFilter === 'En attente de révision'
                    ? 'bg-amber-700 text-white shadow-2xs'
                    : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                }`}
              >
                {t.thesaurus.filterPending} ({stats.pending})
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('Validé')}
                className={`px-3 py-1 rounded-none text-xs font-medium transition-all cursor-pointer ${
                  statusFilter === 'Validé'
                    ? 'bg-emerald-700 text-white shadow-2xs'
                    : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                }`}
              >
                {t.thesaurus.filterValidated} ({stats.validated})
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('Rejeté')}
                className={`px-3 py-1 rounded-none text-xs font-medium transition-all cursor-pointer ${
                  statusFilter === 'Rejeté'
                    ? 'bg-rose-700 text-white shadow-2xs'
                    : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200'
                }`}
              >
                {t.thesaurus.filterRejected} ({stats.rejected})
              </button>
            </div>

          </div>

          {/* Corps de la liste */}
          {isProposalsLoading ? (
            <div className="py-16 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-7 h-7 text-[#9A6530] animate-spin" />
              <span className="text-xs text-[#736a5f]">{t.common.loading}</span>
            </div>
          ) : filteredProposals.length === 0 ? (
            <div className="py-16 px-6 text-center space-y-3 bg-[#faf9f6] rounded-none border border-dashed border-[#dfd6c6]">
              <Layers className="w-8 h-8 text-[#b8ad9e] mx-auto" />
              <p className="text-xs text-[#7d7366] max-w-sm mx-auto leading-relaxed">
                {t.thesaurus.noProposals}
              </p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {filteredProposals.map((prop) => {
                const isConfirmingDelete = deleteConfirmId === prop.id

                return (
                  <div
                    key={prop.id}
                    className="p-4 rounded-none border border-[#e8dfd3] bg-[#fffefe] hover:border-[#cfbeaa] transition-all shadow-2xs space-y-3"
                  >
                    {/* Entête fiche concept */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                          <strong className="text-base font-serif font-bold text-[#2c2724]">
                            {prop.pref_label}
                          </strong>
                          {getLanguageBadge(prop.language)}
                        </div>
                        <div className="flex items-center space-x-2 text-[11px] text-[#8c8275]">
                          <span>ID #{prop.id}</span>
                          <span>•</span>
                          <span>{new Date(prop.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <div className="shrink-0">
                        {getStatusBadge(prop.status)}
                      </div>
                    </div>

                    {/* Synonymes / altLabel */}
                    {prop.alt_labels && prop.alt_labels.length > 0 && (
                      <div className="flex items-center flex-wrap gap-1.5 text-xs pt-0.5">
                        <span className="text-[#8c8275] text-[11px] font-medium mr-1">
                          Synonymes :
                        </span>
                        {prop.alt_labels.map((alt, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded-none bg-[#faf7f2] border border-[#e6decf] text-[#594c3e] text-[11px]"
                          >
                            {alt}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Rattachement hiérarchique (skos:broader) */}
                    {(prop.broader_concept_label || prop.broader_concept_uri) && (
                      <div className="flex items-center space-x-2 text-xs bg-[#fbf9f5] px-3 py-1.5 rounded-none border border-[#eee6da]">
                        <Layers className="w-3.5 h-3.5 text-[#9A6530] shrink-0" />
                        <span className="font-semibold text-[#8c8275]">{t.thesaurus.hierarchy} :</span>
                        <strong className="font-serif font-bold text-[#2c2724]">
                          {prop.broader_concept_label || (prop.broader_concept_uri?.includes('107399') ? 'Canis (Chien)' : 'Concept TheZoo')}
                        </strong>
                        {prop.broader_concept_uri && (
                          <a
                            href={prop.broader_concept_uri}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#9A6530] hover:underline inline-flex items-center space-x-1 font-medium ml-1.5"
                            title={t.thesaurus.openInTheZoo}
                          >
                            <span className="text-[10px] font-mono uppercase bg-[#f0eae0] px-1.5 py-0.5 rounded-none text-[#784d1e]">Notice</span>
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                        )}
                      </div>
                    )}

                    {/* Définition scientifique / Justification */}
                    {prop.definition && (
                      <div className="p-3 bg-[#faf9f6] rounded-none border-l-3 border-[#9A6530] border border-[#f0eae0] text-xs text-[#52493f] italic leading-relaxed">
                        « {prop.definition} »
                      </div>
                    )}

                    {/* Pied de carte : Auteur et Actions d'arbitrage */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-[#f4ede2] text-xs">
                      
                      <div className="flex items-center space-x-1.5 text-[#736a5f]">
                        <User className="w-3.5 h-3.5 text-[#9A6530]" />
                        <span>Par : <strong className="text-[#3c342c]">{prop.contributor_name}</strong></span>
                      </div>

                      {/* Barre d'action / Arbitrage */}
                      <div className="flex items-center space-x-2 shrink-0 self-end sm:self-auto">
                        
                        {/* Valider la proposition */}
                        {prop.status !== 'Validé' && (
                          <button
                            type="button"
                            disabled={statusMutation.isPending}
                            onClick={() => statusMutation.mutate({ id: prop.id, status: 'Validé' })}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-none text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors cursor-pointer"
                          >
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span>{t.thesaurus.actionValidate}</span>
                          </button>
                        )}

                        {/* Rejeter la proposition */}
                        {prop.status !== 'Rejeté' && (
                          <button
                            type="button"
                            disabled={statusMutation.isPending}
                            onClick={() => statusMutation.mutate({ id: prop.id, status: 'Rejeté' })}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-none text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer"
                          >
                            <X className="w-3 h-3 text-rose-600" />
                            <span>{t.thesaurus.actionReject}</span>
                          </button>
                        )}

                        {/* Remettre en attente si déjà arbitré */}
                        {prop.status !== 'En attente de révision' && (
                          <button
                            type="button"
                            disabled={statusMutation.isPending}
                            onClick={() => statusMutation.mutate({ id: prop.id, status: 'En attente de révision' })}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-none text-xs font-medium text-[#736a5f] bg-[#f7f3eb] hover:bg-[#eee7dc] border border-[#ded5c6] transition-colors cursor-pointer"
                          >
                            <Clock className="w-3 h-3 text-[#9A6530]" />
                            <span>Remettre en attente</span>
                          </button>
                        )}

                        {/* Suppression avec confirmation */}
                        {isConfirmingDelete ? (
                          <div className="inline-flex items-center space-x-1 p-1 bg-red-50 border border-red-200 rounded-none">
                            <button
                              type="button"
                              onClick={() => deleteMutation.mutate(prop.id)}
                              className="px-2 py-0.5 bg-red-600 text-white rounded-none text-[11px] font-semibold hover:bg-red-700 cursor-pointer"
                            >
                              Confirmer
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmId(null)}
                              className="px-1.5 py-0.5 text-gray-600 hover:text-gray-900 text-[11px] cursor-pointer"
                            >
                              Annuler
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(prop.id)}
                            className="p-1.5 text-[#9e9486] hover:text-red-600 hover:bg-red-50 rounded-none transition-colors cursor-pointer"
                            title={t.thesaurus.actionDelete}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                      </div>

                    </div>

                  </div>
                )
              })}
            </div>
          )}

        </div>

      </div>

    </div>
  )
}
