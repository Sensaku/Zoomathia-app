import React, { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createSavedQuery, updateSavedQuery } from '../api/client'
import { CreateSavedQueryInput, UpdateSavedQueryInput } from '../types'
import { Bookmark, X, AlertCircle, Loader2, RefreshCw, Plus } from 'lucide-react'
import { useI18n } from '../i18n'

interface SaveQueryModalProps {
  isOpen: boolean
  onClose: () => void
  queryText: string
  initialTitle?: string
  initialDescription?: string
  queryId?: number | ''
  isBuiltin?: boolean
  onSuccess?: (newId: number) => void
}

export const SaveQueryModal: React.FC<SaveQueryModalProps> = ({
  isOpen,
  onClose,
  queryText,
  initialTitle = '',
  initialDescription = '',
  queryId,
  isBuiltin = false,
  onSuccess,
}) => {
  const { t } = useI18n()
  const queryClient = useQueryClient()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('Recherche personnalisée')
  const [authorName, setAuthorName] = useState('Chercheur Zoomathia')
  const [saveMode, setSaveMode] = useState<'update' | 'create'>('create')
  const [error, setError] = useState<string | null>(null)

  // Pré-remplissage des champs à l'ouverture du modal
  useEffect(() => {
    if (isOpen) {
      setTitle(initialTitle || '')
      setDescription(initialDescription || '')
      setError(null)
      // Si la requête existe déjà et n'est pas une CQ officielle, proposer par défaut la mise à jour
      if (queryId && !isBuiltin) {
        setSaveMode('update')
      } else {
        setSaveMode('create')
      }
    }
  }, [isOpen, initialTitle, initialDescription, queryId, isBuiltin])

  // Mutation de création d'une nouvelle requête
  const createMutation = useMutation({
    mutationFn: (input: CreateSavedQueryInput) => createSavedQuery(input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['savedQueries'] })
      if (onSuccess) onSuccess(data.id)
      onClose()
      setError(null)
    },
    onError: (err: any) => {
      setError(err?.message || "Impossible d'enregistrer la requête.")
    },
  })

  // Mutation de mise à jour d'une requête existante
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateSavedQueryInput }) => updateSavedQuery(id, input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['savedQueries'] })
      if (onSuccess) onSuccess(data.id)
      onClose()
      setError(null)
    },
    onError: (err: any) => {
      setError(err?.message || 'Impossible de mettre à jour la requête.')
    },
  })

  const isPending = createMutation.isPending || updateMutation.isPending

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setError(t.sparql.titleRequired)
      return
    }

    if (saveMode === 'update' && queryId && !isBuiltin) {
      updateMutation.mutate({
        id: Number(queryId),
        input: {
          title: title.trim(),
          description: description.trim() || undefined,
          query_text: queryText.trim(),
          category: category.trim() || 'Recherche personnalisée',
          author_name: authorName.trim() || 'Chercheur Zoomathia',
        },
      })
    } else {
      createMutation.mutate({
        title: title.trim(),
        description: description.trim() || undefined,
        query_text: queryText.trim(),
        category: category.trim() || 'Recherche personnalisée',
        author_name: authorName.trim() || 'Chercheur Zoomathia',
      })
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="animate-in fade-in zoom-in-95 w-full max-w-lg overflow-hidden rounded-none border border-[#e6dfd3] bg-white shadow-2xl duration-150">
        {/* En-tête du modal */}
        <div className="flex items-center justify-between border-b border-[#f0eae0] bg-[#faf9f6] p-4">
          <div className="flex items-center space-x-2">
            <Bookmark className="h-5 w-5 text-[#9A6530]" />
            <h3 className="font-serif text-base font-bold text-[#2c2724]">
              {saveMode === 'update' ? t.sparql.updateModalTitle : t.sparql.saveModalTitle}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-none p-1 text-[#8c8275] transition-colors hover:bg-[#f4ede2] hover:text-[#2c2724]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Formulaire de configuration de la requête */}
        <form onSubmit={handleSubmit} className="space-y-4 p-5 text-xs">
          {error && (
            <div className="flex items-center space-x-2 rounded-none border border-red-200 bg-red-50 p-2.5 text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Choix du mode si requête personnalisée existante */}
          {queryId && !isBuiltin && (
            <div className="flex items-center space-x-2 rounded-none border border-[#ded5c6] bg-[#f4ede2] p-1">
              <button
                type="button"
                onClick={() => setSaveMode('update')}
                className={`flex flex-1 cursor-pointer items-center justify-center space-x-1.5 rounded-none px-3 py-1.5 text-xs font-medium transition-all ${
                  saveMode === 'update' ? 'bg-white text-[#9A6530] shadow-xs' : 'text-[#696156] hover:text-[#2c2724]'
                }`}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>{t.sparql.updateModeBtn}</span>
              </button>

              <button
                type="button"
                onClick={() => setSaveMode('create')}
                className={`flex flex-1 cursor-pointer items-center justify-center space-x-1.5 rounded-none px-3 py-1.5 text-xs font-medium transition-all ${
                  saveMode === 'create' ? 'bg-white text-[#9A6530] shadow-xs' : 'text-[#696156] hover:text-[#2c2724]'
                }`}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{t.sparql.copyModeBtn}</span>
              </button>
            </div>
          )}

          {/* Nom / Titre de la requête */}
          <div className="space-y-1">
            <label className="block font-semibold text-[#595248]">{t.sparql.queryTitleLabel}</label>
            <input
              type="text"
              required
              placeholder={t.sparql.queryTitlePlaceholder}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-none border border-[#cfc5b4] bg-[#faf9f6] p-2.5 text-xs text-[#2c2724] focus:ring-2 focus:ring-[#9A6530] focus:outline-none"
            />
          </div>

          {/* Intentions scientifiques de la requête */}
          <div className="space-y-1">
            <label className="block font-semibold text-[#595248]">{t.sparql.queryGoalLabel}</label>
            <textarea
              rows={3}
              placeholder={t.sparql.queryGoalPlaceholder}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-none border border-[#cfc5b4] bg-[#faf9f6] p-2.5 text-xs leading-relaxed text-[#2c2724] focus:ring-2 focus:ring-[#9A6530] focus:outline-none"
            />
          </div>

          {/* Catégorie et Nom du chercheur */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block font-semibold text-[#595248]">{t.sparql.categoryLabel}</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-[#cfc5b4] bg-[#faf9f6] p-2.5 text-xs text-[#2c2724] focus:ring-2 focus:ring-[#9A6530] focus:outline-none"
              >
                <option value="Recherche personnalisée">{t.sparql.catCustom}</option>
                <option value="Faune terrestre">{t.sparql.catLandFauna}</option>
                <option value="Faune marine">{t.sparql.catMarineFauna}</option>
                <option value="Oiseaux & Rapaces">{t.sparql.catBirds}</option>
                <option value="Cooccurrences">{t.sparql.catCooccurrences}</option>
                <option value="Géographie & Lieux">{t.sparql.catGeography}</option>
                <option value="Alimentation & Usages">{t.sparql.catFoodDiet}</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="block font-semibold text-[#595248]">{t.sparql.authorLabel}</label>
              <input
                type="text"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                className="w-full rounded-none border border-[#cfc5b4] bg-[#faf9f6] p-2.5 text-xs text-[#2c2724] focus:ring-2 focus:ring-[#9A6530] focus:outline-none"
              />
            </div>
          </div>

          {/* Boutons d'action */}
          <div className="flex items-center justify-end space-x-2 border-t border-[#f0eae0] pt-3">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-none px-3 py-1.5 text-xs text-[#696156] transition-colors hover:bg-[#f4ede2]"
            >
              {t.common.cancel}
            </button>

            <button
              type="submit"
              disabled={isPending || !title.trim()}
              className="inline-flex cursor-pointer items-center space-x-1.5 rounded-none bg-[#9A6530] px-5 py-2 text-xs font-semibold text-white shadow-xs transition-all hover:bg-[#855424] disabled:opacity-50"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>{t.common.loading}</span>
                </>
              ) : (
                <>
                  <Bookmark className="h-3.5 w-3.5" />
                  <span>{saveMode === 'update' ? t.sparql.updateBtn : t.common.save}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
