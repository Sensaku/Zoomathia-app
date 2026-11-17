import React, { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchThesaurusProposals,
  createThesaurusProposal,
  updateThesaurusProposalStatus,
  deleteThesaurusProposal,
  fetchThesaurusAutocomplete,
  BASE_URL,
} from '../api/client'
import { ThesaurusProposal, CreateThesaurusProposalInput, OpenThesoAutocompleteItem } from '../types'
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
  Sparkles,
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
    },
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => updateThesaurusProposalStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['thesaurusProposals'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteThesaurusProposal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['thesaurusProposals'] })
      setDeleteConfirmId(null)
    },
  })

  // Gestion des tags de synonymes
  const handleAddAltLabel = (value: string) => {
    const parts = value
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
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
      const parts = altLabelInput
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
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
      contributor_name: contributorName.trim() || 'Chercheur anonyme',
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
        return (
          <span className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
            FR
          </span>
        )
      case 'en':
        return (
          <span className="rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
            EN
          </span>
        )
      case 'grc':
        return (
          <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
            GRC (Grec)
          </span>
        )
      case 'la':
        return (
          <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
            LA (Latin)
          </span>
        )
      default:
        return (
          <span className="rounded border border-[#e6dfd3] bg-[#f4ede2] px-2 py-0.5 text-[11px] font-semibold text-[#736a5f] uppercase">
            {lang}
          </span>
        )
    }
  }

  const getStatusBadge = (status: string) => {
    if (status === 'Validé') {
      return (
        <span className="inline-flex items-center space-x-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
          <span>{t.thesaurus.statusValidated}</span>
        </span>
      )
    }
    if (status === 'Rejeté') {
      return (
        <span className="inline-flex items-center space-x-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700">
          <XCircle className="h-3 w-3 text-rose-600" />
          <span>{t.thesaurus.statusRejected}</span>
        </span>
      )
    }
    return (
      <span className="inline-flex items-center space-x-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
        <Clock className="h-3 w-3 text-amber-600" />
        <span>{t.thesaurus.statusPending}</span>
      </span>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 py-6">
      {/* 1. Hero Banner avec métriques et accès thésaurus */}
      <div className="relative overflow-hidden rounded-none border border-[#524438] bg-gradient-to-r from-[#2c2724] via-[#3a322c] to-[#473a30] p-6 text-white shadow-md md:p-8">
        <div className="relative z-10 flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div className="max-w-2xl space-y-2">
            <div className="inline-flex items-center space-x-2 rounded-full border border-[#c49257]/40 bg-[#9A6530]/30 px-3 py-1 text-xs font-medium text-[#f3d9b8]">
              <Sparkles className="h-3.5 w-3.5 text-[#e5aa66]" />
              <span>Enrichissement Sémantique SKOS</span>
            </div>
            <h1 className="font-serif text-2xl font-bold tracking-tight text-[#fdfcf9] md:text-3xl lg:text-4xl">
              {t.thesaurus.title}
            </h1>
            <p className="text-sm leading-relaxed text-[#d8cfc4] md:text-base">{t.thesaurus.subtitle}</p>
          </div>

          <div className="flex shrink-0 flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            {/* Lien officiel OpenTheso */}
            <a
              href="https://opentheso.huma-num.fr/opentheso/?idt=th310"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center space-x-2 rounded-none border border-white/20 bg-white/10 px-4 py-2.5 text-xs font-medium text-white shadow-sm backdrop-blur-sm transition-all hover:bg-white/20"
            >
              <BookOpen className="h-4 w-4 text-[#e5aa66]" />
              <span>{t.thesaurus.openInTheZoo}</span>
              <ExternalLink className="h-3 w-3 opacity-70" />
            </a>

            {/* Export SKOS Turtle */}
            <a
              href={`${BASE_URL}/thesaurus/proposals/export-ttl`}
              download
              className="inline-flex cursor-pointer items-center justify-center space-x-2 rounded-none bg-[#9A6530] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-[#835222]"
            >
              <Download className="h-4 w-4" />
              <span>{t.thesaurus.exportTtlBtn}</span>
            </a>
          </div>
        </div>

        {/* Métriques globales */}
        <div className="relative z-10 mt-6 grid grid-cols-2 gap-3 border-t border-white/10 pt-6 sm:grid-cols-4">
          <div className="rounded-none border border-white/10 bg-white/5 p-3 backdrop-blur-xs">
            <span className="block text-[11px] text-[#beb4a8]">{t.thesaurus.statTotal}</span>
            <span className="font-serif text-xl font-bold text-white">{stats.total}</span>
          </div>
          <div className="rounded-none border border-amber-500/20 bg-amber-500/10 p-3 backdrop-blur-xs">
            <span className="block text-[11px] text-amber-200">{t.thesaurus.statPending}</span>
            <span className="font-serif text-xl font-bold text-amber-300">{stats.pending}</span>
          </div>
          <div className="rounded-none border border-emerald-500/20 bg-emerald-500/10 p-3 backdrop-blur-xs">
            <span className="block text-[11px] text-emerald-200">{t.thesaurus.statValidated}</span>
            <span className="font-serif text-xl font-bold text-emerald-300">{stats.validated}</span>
          </div>
          <div className="rounded-none border border-rose-500/20 bg-rose-500/10 p-3 backdrop-blur-xs">
            <span className="block text-[11px] text-rose-200">{t.thesaurus.filterRejected}</span>
            <span className="font-serif text-xl font-bold text-rose-300">{stats.rejected}</span>
          </div>
        </div>
      </div>

      {/* 2. Colonnes principales : Formulaire (5 cols) & Registre (7 cols) */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* Colonne 1 : Formulaire de proposition de concept */}
        <div className="space-y-6 rounded-none border border-[#e6dfd3] bg-white p-6 shadow-xs lg:col-span-5">
          <div className="border-b border-[#f0eae0] pb-4">
            <h2 className="flex items-center space-x-2 font-serif text-lg font-bold text-[#2c2724]">
              <PlusCircle className="h-5 w-5 text-[#9A6530]" />
              <span>{t.thesaurus.formTitle}</span>
            </h2>
            <p className="mt-1 text-xs text-[#736a5f]">{t.thesaurus.formSubtitle}</p>
          </div>

          {formError && (
            <div className="flex items-start space-x-2.5 rounded-none border border-red-200 bg-red-50 p-3.5 text-xs text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="leading-relaxed">{formError}</span>
            </div>
          )}

          {successNotice && (
            <div className="flex items-start space-x-2.5 rounded-none border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-800">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <span className="leading-relaxed">{successNotice}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {/* Section 1 : Terme préférentiel & Langue */}
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <label className="block font-semibold text-[#4a4238]">{t.thesaurus.prefLabel}</label>
                  <input
                    type="text"
                    required
                    placeholder={t.thesaurus.prefLabelPlaceholder}
                    value={prefLabel}
                    onChange={(e) => setPrefLabel(e.target.value)}
                    className="w-full rounded-none border border-[#cfc5b4] bg-[#faf9f6] p-2.5 text-sm text-[#2c2724] transition-all placeholder:text-[#9e9486] focus:border-[#9A6530] focus:bg-white focus:ring-2 focus:ring-[#9A6530] focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block font-semibold text-[#4a4238]">{t.thesaurus.languageLabel}</label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full rounded-xl border border-[#cfc5b4] bg-[#faf9f6] p-2.5 text-sm font-medium text-[#2c2724] transition-all focus:border-[#9A6530] focus:bg-white focus:ring-2 focus:ring-[#9A6530] focus:outline-none"
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
                <label className="font-semibold text-[#4a4238]">{t.thesaurus.altLabels}</label>
                <span className="text-[10px] text-[#8c8275]">
                  {altLabels.length} {altLabels.length > 1 ? 'synonymes' : 'synonyme'}
                </span>
              </div>

              <div className="rounded-none border border-[#cfc5b4] bg-[#faf9f6] p-2 transition-all focus-within:border-[#9A6530] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#9A6530]">
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  {altLabels.map((tag, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center space-x-1 rounded-none border border-[#e0d3be] bg-[#f2ecdf] px-2.5 py-1 text-xs font-medium text-[#5c4a38]"
                    >
                      <Tag className="h-2.5 w-2.5 text-[#9A6530]" />
                      <span>{tag}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveAltLabel(idx)}
                        className="cursor-pointer rounded-none p-0.5 text-[#8c7b6c] transition-colors hover:bg-[#dfd4c3] hover:text-[#423326]"
                        title={t.thesaurus.removeBroader}
                      >
                        <X className="h-3 w-3" />
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
                    className="w-full bg-transparent p-1 text-xs text-[#2c2724] placeholder:text-[#9e9486] focus:outline-none"
                  />
                  {altLabelInput.trim() && (
                    <button
                      type="button"
                      onClick={() => handleAddAltLabel(altLabelInput)}
                      className="cursor-pointer rounded-none bg-[#9A6530] px-2 py-1 text-[11px] font-medium text-white hover:bg-[#825424]"
                    >
                      Ajouter
                    </button>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-[#8c8275]">{t.thesaurus.tagAddHelp}</p>
            </div>

            {/* Section 3 : Concept parent (skos:broader) OpenTheso */}
            <div className="space-y-1.5">
              <label className="block font-semibold text-[#4a4238]">{t.thesaurus.broaderLabel}</label>

              {selectedBroader ? (
                <div className="flex items-center justify-between rounded-none border border-[#dfd3be] bg-[#fbf8f2] p-3">
                  <div className="flex min-w-0 items-center space-x-2.5">
                    <div className="rounded-none bg-[#9A6530]/10 p-1.5 text-[#9A6530]">
                      <Layers className="h-4 w-4" />
                    </div>
                    <div className="truncate">
                      <strong className="block truncate text-xs font-medium text-[#2c2724]">
                        {selectedBroader.label}
                      </strong>
                      <span className="font-mono text-[10px] text-[#8c8275]">
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
                    className="cursor-pointer rounded-none px-2 py-1 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-50"
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
                    className="w-full rounded-none border border-[#cfc5b4] bg-[#faf9f6] p-2.5 pl-8 text-sm text-[#2c2724] transition-all placeholder:text-[#9e9486] focus:border-[#9A6530] focus:bg-white focus:ring-2 focus:ring-[#9A6530] focus:outline-none"
                  />
                  <Search className="absolute top-3 left-2.5 h-4 w-4 text-[#8c8275]" />
                  {isSearchingBroader && (
                    <Loader2 className="absolute top-3 right-3 h-4 w-4 animate-spin text-[#9A6530]" />
                  )}

                  {broaderSuggestions.length > 0 && (
                    <div className="absolute z-20 mt-1 max-h-48 w-full divide-y divide-[#f4ede2] overflow-y-auto rounded-none border border-[#ded5c6] bg-white shadow-lg">
                      {broaderSuggestions.map((item) => (
                        <button
                          key={item.uri}
                          type="button"
                          onClick={() => {
                            setSelectedBroader(item)
                            setBroaderSearch('')
                            setBroaderSuggestions([])
                          }}
                          className="flex w-full cursor-pointer items-center justify-between p-2.5 text-left text-xs transition-colors hover:bg-[#faf7f2]"
                        >
                          <span className="font-semibold text-[#2c2724]">{item.label}</span>
                          <span className="ml-2 max-w-[140px] truncate font-mono text-[10px] text-[#8c8275]">
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
              <label className="block font-semibold text-[#4a4238]">{t.thesaurus.definition}</label>
              <textarea
                rows={3}
                placeholder={t.thesaurus.definitionPlaceholder}
                value={definition}
                onChange={(e) => setDefinition(e.target.value)}
                className="w-full rounded-none border border-[#cfc5b4] bg-[#faf9f6] p-2.5 text-sm text-[#2c2724] transition-all placeholder:text-[#9e9486] focus:border-[#9A6530] focus:bg-white focus:ring-2 focus:ring-[#9A6530] focus:outline-none"
              />
            </div>

            {/* Section 5 : Nom du chercheur */}
            <div className="space-y-1.5">
              <label className="block font-semibold text-[#4a4238]">{t.thesaurus.contributorName}</label>
              <div className="relative">
                <input
                  type="text"
                  value={contributorName}
                  onChange={(e) => setContributorName(e.target.value)}
                  className="w-full rounded-none border border-[#cfc5b4] bg-[#faf9f6] p-2.5 pl-8 text-sm text-[#2c2724] transition-all focus:border-[#9A6530] focus:bg-white focus:ring-2 focus:ring-[#9A6530] focus:outline-none"
                />
                <User className="absolute top-3 left-2.5 h-4 w-4 text-[#8c8275]" />
              </div>
            </div>

            {/* Bouton de soumission */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={proposalMutation.isPending || !prefLabel.trim()}
                className="inline-flex w-full cursor-pointer items-center justify-center space-x-2 rounded-none bg-[#9A6530] py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#835222] disabled:opacity-50"
              >
                {proposalMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{t.thesaurus.submitting}</span>
                  </>
                ) : (
                  <>
                    <PlusCircle className="h-4 w-4" />
                    <span>{t.thesaurus.submitBtn}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Colonne 2 : Registre de révision scientifique & Modération */}
        <div className="space-y-5 rounded-none border border-[#e6dfd3] bg-white p-6 shadow-xs lg:col-span-7">
          {/* En-tête de registre & filtres */}
          <div className="space-y-3 border-b border-[#f0eae0] pb-3">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="flex items-center space-x-2 font-serif text-lg font-bold text-[#2c2724]">
                  <span>{t.thesaurus.proposalsTitle}</span>
                  <span className="rounded-full bg-[#f4ede2] px-2 py-0.5 font-mono text-xs font-bold text-[#6e6356]">
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
                  className="w-full rounded-none border border-[#cfc5b4] bg-[#faf9f6] py-1.5 pr-3 pl-8 text-xs text-[#2c2724] transition-all placeholder:text-[#9e9486] focus:bg-white focus:ring-2 focus:ring-[#9A6530] focus:outline-none"
                />
                <Search className="absolute top-2.5 left-2.5 h-3.5 w-3.5 text-[#8c8275]" />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute top-1.5 right-1.5 cursor-pointer p-1 text-[#8c8275] hover:text-[#2c2724]"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Onglets de filtrage par statut */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => setStatusFilter('ALL')}
                className={`cursor-pointer rounded-none px-3 py-1 text-xs font-medium transition-all ${
                  statusFilter === 'ALL'
                    ? 'bg-[#2c2724] text-white shadow-2xs'
                    : 'border border-[#e6dfd3] bg-[#faf8f5] text-[#696156] hover:bg-[#f2ece1]'
                }`}
              >
                {t.thesaurus.filterAll} ({stats.total})
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('En attente de révision')}
                className={`cursor-pointer rounded-none px-3 py-1 text-xs font-medium transition-all ${
                  statusFilter === 'En attente de révision'
                    ? 'bg-amber-700 text-white shadow-2xs'
                    : 'border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                }`}
              >
                {t.thesaurus.filterPending} ({stats.pending})
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('Validé')}
                className={`cursor-pointer rounded-none px-3 py-1 text-xs font-medium transition-all ${
                  statusFilter === 'Validé'
                    ? 'bg-emerald-700 text-white shadow-2xs'
                    : 'border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                }`}
              >
                {t.thesaurus.filterValidated} ({stats.validated})
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('Rejeté')}
                className={`cursor-pointer rounded-none px-3 py-1 text-xs font-medium transition-all ${
                  statusFilter === 'Rejeté'
                    ? 'bg-rose-700 text-white shadow-2xs'
                    : 'border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100'
                }`}
              >
                {t.thesaurus.filterRejected} ({stats.rejected})
              </button>
            </div>
          </div>

          {/* Corps de la liste */}
          {isProposalsLoading ? (
            <div className="flex flex-col items-center justify-center space-y-3 py-16">
              <Loader2 className="h-7 w-7 animate-spin text-[#9A6530]" />
              <span className="text-xs text-[#736a5f]">{t.common.loading}</span>
            </div>
          ) : filteredProposals.length === 0 ? (
            <div className="space-y-3 rounded-none border border-dashed border-[#dfd6c6] bg-[#faf9f6] px-6 py-16 text-center">
              <Layers className="mx-auto h-8 w-8 text-[#b8ad9e]" />
              <p className="mx-auto max-w-sm text-xs leading-relaxed text-[#7d7366]">{t.thesaurus.noProposals}</p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {filteredProposals.map((prop) => {
                const isConfirmingDelete = deleteConfirmId === prop.id

                return (
                  <div
                    key={prop.id}
                    className="space-y-3 rounded-none border border-[#e8dfd3] bg-[#fffefe] p-4 shadow-2xs transition-all hover:border-[#cfbeaa]"
                  >
                    {/* Entête fiche concept */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center space-x-2 gap-y-1">
                          <strong className="font-serif text-base font-bold text-[#2c2724]">{prop.pref_label}</strong>
                          {getLanguageBadge(prop.language)}
                        </div>
                        <div className="flex items-center space-x-2 text-[11px] text-[#8c8275]">
                          <span>ID #{prop.id}</span>
                          <span>•</span>
                          <span>{new Date(prop.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <div className="shrink-0">{getStatusBadge(prop.status)}</div>
                    </div>

                    {/* Synonymes / altLabel */}
                    {prop.alt_labels && prop.alt_labels.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-xs">
                        <span className="mr-1 text-[11px] font-medium text-[#8c8275]">Synonymes :</span>
                        {prop.alt_labels.map((alt, idx) => (
                          <span
                            key={idx}
                            className="rounded-none border border-[#e6decf] bg-[#faf7f2] px-2 py-0.5 text-[11px] text-[#594c3e]"
                          >
                            {alt}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Rattachement hiérarchique (skos:broader) */}
                    {(prop.broader_concept_label || prop.broader_concept_uri) && (
                      <div className="flex items-center space-x-2 rounded-none border border-[#eee6da] bg-[#fbf9f5] px-3 py-1.5 text-xs">
                        <Layers className="h-3.5 w-3.5 shrink-0 text-[#9A6530]" />
                        <span className="font-semibold text-[#8c8275]">{t.thesaurus.hierarchy} :</span>
                        <strong className="font-serif font-bold text-[#2c2724]">
                          {prop.broader_concept_label ||
                            (prop.broader_concept_uri?.includes('107399') ? 'Canis (Chien)' : 'Concept TheZoo')}
                        </strong>
                        {prop.broader_concept_uri && (
                          <a
                            href={prop.broader_concept_uri}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-1.5 inline-flex items-center space-x-1 font-medium text-[#9A6530] hover:underline"
                            title={t.thesaurus.openInTheZoo}
                          >
                            <span className="rounded-none bg-[#f0eae0] px-1.5 py-0.5 font-mono text-[10px] text-[#784d1e] uppercase">
                              Notice
                            </span>
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                        )}
                      </div>
                    )}

                    {/* Définition scientifique / Justification */}
                    {prop.definition && (
                      <div className="rounded-none border border-l-3 border-[#9A6530] border-[#f0eae0] bg-[#faf9f6] p-3 text-xs leading-relaxed text-[#52493f] italic">
                        « {prop.definition} »
                      </div>
                    )}

                    {/* Pied de carte : Auteur et Actions d'arbitrage */}
                    <div className="flex flex-col justify-between gap-2.5 border-t border-[#f4ede2] pt-2 text-xs sm:flex-row sm:items-center">
                      <div className="flex items-center space-x-1.5 text-[#736a5f]">
                        <User className="h-3.5 w-3.5 text-[#9A6530]" />
                        <span>
                          Par : <strong className="text-[#3c342c]">{prop.contributor_name}</strong>
                        </span>
                      </div>

                      {/* Barre d'action / Arbitrage */}
                      <div className="flex shrink-0 items-center space-x-2 self-end sm:self-auto">
                        {/* Valider la proposition */}
                        {prop.status !== 'Validé' && (
                          <button
                            type="button"
                            disabled={statusMutation.isPending}
                            onClick={() => statusMutation.mutate({ id: prop.id, status: 'Validé' })}
                            className="inline-flex cursor-pointer items-center space-x-1 rounded-none border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                          >
                            <Check className="h-3 w-3 text-emerald-600" />
                            <span>{t.thesaurus.actionValidate}</span>
                          </button>
                        )}

                        {/* Rejeter la proposition */}
                        {prop.status !== 'Rejeté' && (
                          <button
                            type="button"
                            disabled={statusMutation.isPending}
                            onClick={() => statusMutation.mutate({ id: prop.id, status: 'Rejeté' })}
                            className="inline-flex cursor-pointer items-center space-x-1 rounded-none border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-100"
                          >
                            <X className="h-3 w-3 text-rose-600" />
                            <span>{t.thesaurus.actionReject}</span>
                          </button>
                        )}

                        {/* Remettre en attente si déjà arbitré */}
                        {prop.status !== 'En attente de révision' && (
                          <button
                            type="button"
                            disabled={statusMutation.isPending}
                            onClick={() => statusMutation.mutate({ id: prop.id, status: 'En attente de révision' })}
                            className="inline-flex cursor-pointer items-center space-x-1 rounded-none border border-[#ded5c6] bg-[#f7f3eb] px-2.5 py-1 text-xs font-medium text-[#736a5f] transition-colors hover:bg-[#eee7dc]"
                          >
                            <Clock className="h-3 w-3 text-[#9A6530]" />
                            <span>Remettre en attente</span>
                          </button>
                        )}

                        {/* Suppression avec confirmation */}
                        {isConfirmingDelete ? (
                          <div className="inline-flex items-center space-x-1 rounded-none border border-red-200 bg-red-50 p-1">
                            <button
                              type="button"
                              onClick={() => deleteMutation.mutate(prop.id)}
                              className="cursor-pointer rounded-none bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-red-700"
                            >
                              Confirmer
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmId(null)}
                              className="cursor-pointer px-1.5 py-0.5 text-[11px] text-gray-600 hover:text-gray-900"
                            >
                              Annuler
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(prop.id)}
                            className="cursor-pointer rounded-none p-1.5 text-[#9e9486] transition-colors hover:bg-red-50 hover:text-red-600"
                            title={t.thesaurus.actionDelete}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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
