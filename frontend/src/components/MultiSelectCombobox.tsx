import React, { useState, useMemo, useRef, useEffect } from 'react'
import { Search, Check, X, ChevronDown, Ban } from 'lucide-react'

export interface ComboboxOption {
  value: string
  label: string
  subtitle?: string
}

interface MultiSelectComboboxProps {
  label: string
  placeholder: string
  options: ComboboxOption[]
  selectedValues: string[]
  onChange: (values: string[]) => void
  excludedValues?: string[]
  onExcludedChange?: (values: string[]) => void
  allowExclusion?: boolean
  maxBadgeDisplay?: number
  icon?: React.ReactNode
}

export const MultiSelectCombobox: React.FC<MultiSelectComboboxProps> = ({
  label,
  placeholder,
  options,
  selectedValues,
  onChange,
  excludedValues = [],
  onExcludedChange,
  allowExclusion = false,
  maxBadgeDisplay = 4,
  icon,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  // Fermer le dropdown en cliquant à l'extérieur
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Filtrage des options selon le texte recherché
  const filteredOptions = useMemo(() => {
    if (!searchTerm.trim()) return options
    const lower = searchTerm.toLowerCase()
    return options.filter(
      (opt) => opt.label.toLowerCase().includes(lower) || (opt.subtitle && opt.subtitle.toLowerCase().includes(lower)),
    )
  }, [options, searchTerm])

  const toggleSelect = (value: string) => {
    // Si l'élément est dans les exclusions, on le retire d'abord
    if (excludedValues.includes(value) && onExcludedChange) {
      onExcludedChange(excludedValues.filter((v) => v !== value))
    }

    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((v) => v !== value))
    } else {
      onChange([...selectedValues, value])
    }
  }

  const toggleExclude = (e: React.MouseEvent, value: string) => {
    e.stopPropagation()
    if (!onExcludedChange) return

    // Si l'élément est dans les sélections positives, on le retire d'abord
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((v) => v !== value))
    }

    if (excludedValues.includes(value)) {
      onExcludedChange(excludedValues.filter((v) => v !== value))
    } else {
      onExcludedChange([...excludedValues, value])
    }
  }

  const removeSelected = (e: React.MouseEvent, value: string) => {
    e.stopPropagation()
    onChange(selectedValues.filter((v) => v !== value))
  }

  const removeExcluded = (e: React.MouseEvent, value: string) => {
    e.stopPropagation()
    if (onExcludedChange) {
      onExcludedChange(excludedValues.filter((v) => v !== value))
    }
  }

  const handleSelectAll = () => {
    const visibleValues = filteredOptions.map((o) => o.value)
    const newSelected = Array.from(new Set([...selectedValues, ...visibleValues]))
    onChange(newSelected)
    if (onExcludedChange) {
      onExcludedChange(excludedValues.filter((v) => !visibleValues.includes(v)))
    }
  }

  const handleClearAll = () => {
    onChange([])
    if (onExcludedChange) onExcludedChange([])
  }

  const selectedOptions = useMemo(
    () => options.filter((o) => selectedValues.includes(o.value)),
    [options, selectedValues],
  )

  const excludedOptions = useMemo(
    () => options.filter((o) => excludedValues.includes(o.value)),
    [options, excludedValues],
  )

  return (
    <div className={`relative space-y-1.5 ${isOpen ? 'z-40' : 'z-10'}`} ref={containerRef}>
      <div className="flex items-center justify-between">
        <label className="flex items-center space-x-1.5 text-sm font-semibold tracking-wider text-[#63503d] uppercase">
          {icon && <span className="shrink-0">{icon}</span>}
          <span>{label}</span>
        </label>
        {(selectedValues.length > 0 || excludedValues.length > 0) && (
          <button
            type="button"
            onClick={handleClearAll}
            className="inline-flex cursor-pointer items-center space-x-1 text-xs text-[#9A6530] hover:underline"
          >
            <span>Effacer</span>
            <span className="inline-flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-[#eaddcb] px-1.5 text-center text-xs leading-none font-bold text-[#543b22]">
              {selectedValues.length + excludedValues.length}
            </span>
          </button>
        )}
      </div>

      {/* Barre de sélection active */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`flex min-h-[46px] w-full cursor-pointer flex-wrap items-center gap-2 rounded-none border bg-[#faf9f6] p-2 text-sm transition-all ${
          isOpen
            ? 'border-[#9A6530] bg-white shadow-xs ring-2 ring-[#9A6530]/20'
            : 'border-[#cfc5b4] hover:border-[#9A6530]'
        }`}
      >
        {selectedValues.length === 0 && excludedValues.length === 0 && (
          <span className="px-2 text-sm text-[#8c8275]">{placeholder}</span>
        )}

        {/* Badges inclus (verts/marrons) */}
        {selectedOptions.slice(0, maxBadgeDisplay).map((opt) => (
          <span
            key={opt.value}
            className="inline-flex items-center space-x-1.5 rounded-none bg-[#eaddcb] px-2.5 py-1 text-xs leading-none font-medium text-[#543b22]"
          >
            <span className="max-w-[180px] truncate">{opt.label}</span>
            <button
              type="button"
              onClick={(e) => removeSelected(e, opt.value)}
              className="rounded-none p-0.5 hover:text-red-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}

        {/* Badges exclus (rouges) */}
        {excludedOptions.slice(0, maxBadgeDisplay).map((opt) => (
          <span
            key={opt.value}
            className="inline-flex items-center space-x-1.5 rounded-none border border-rose-200 bg-rose-100 px-2.5 py-1 text-xs leading-none font-medium text-rose-800 line-through"
          >
            <span className="max-w-[180px] truncate">{opt.label}</span>
            <button
              type="button"
              onClick={(e) => removeExcluded(e, opt.value)}
              className="rounded-none p-0.5 hover:text-rose-900"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}

        {selectedValues.length + excludedValues.length > maxBadgeDisplay && (
          <span className="inline-flex items-center justify-center rounded-full bg-[#f0eae0] px-2.5 py-1 text-xs leading-none font-semibold text-[#8c8275]">
            +{selectedValues.length + excludedValues.length - maxBadgeDisplay} autre(s)
          </span>
        )}

        <div className="ml-auto pr-1 text-[#8c8275]">
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {/* Menu déroulant de recherche et sélection */}
      {isOpen && (
        <div className="animate-in fade-in zoom-in-95 absolute top-full right-0 left-0 z-50 mt-1.5 space-y-2.5 rounded-none border border-[#cfc5b4] bg-white p-2.5 shadow-2xl duration-100">
          {/* Barre de recherche interne */}
          <div className="relative">
            <Search className="absolute top-3 left-3 h-4 w-4 text-[#8c8275]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filtrer dans la liste..."
              className="w-full rounded-none border border-[#e6dfd3] bg-[#fcfbf9] py-2 pr-3 pl-9 text-sm text-[#2c2724] focus:ring-2 focus:ring-[#9A6530] focus:outline-none"
              autoFocus
            />
          </div>

          {/* Actions rapides */}
          <div className="flex items-center justify-between border-b border-[#f0eae0] px-1 pb-2 text-xs text-[#8c8275]">
            <span className="font-medium">{filteredOptions.length} élément(s)</span>
            <div className="space-x-3">
              <button type="button" onClick={handleSelectAll} className="font-semibold text-[#9A6530] hover:underline">
                Tout cocher
              </button>
              <button type="button" onClick={handleClearAll} className="text-[#8c8275] hover:text-[#543b22]">
                Désélectionner
              </button>
            </div>
          </div>

          {/* Liste scrollable */}
          <div className="max-h-64 space-y-1 divide-y divide-[#f5f1eb] overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="p-4 text-center text-sm text-[#8c8275]">Aucun résultat trouvé pour « {searchTerm} ».</div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = selectedValues.includes(opt.value)
                const isExcluded = excludedValues.includes(opt.value)

                return (
                  <div
                    key={opt.value}
                    onClick={() => toggleSelect(opt.value)}
                    className={`flex cursor-pointer items-center justify-between rounded-none p-2.5 text-sm transition-colors ${
                      isSelected
                        ? 'bg-[#f4ede2] font-semibold text-[#543b22]'
                        : isExcluded
                          ? 'bg-rose-50 text-rose-800 line-through'
                          : 'text-[#2c2724] hover:bg-[#faf9f6]'
                    }`}
                  >
                    <div className="flex min-w-0 items-center space-x-2.5 pr-2">
                      <div
                        className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-none border transition-colors ${
                          isSelected
                            ? 'border-[#9A6530] bg-[#9A6530] text-white'
                            : isExcluded
                              ? 'border-rose-600 bg-rose-600 text-white'
                              : 'border-[#cfc5b4] bg-white'
                        }`}
                      >
                        {isSelected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                        {isExcluded && <X className="h-3.5 w-3.5 stroke-[3]" />}
                      </div>
                      <div className="truncate">
                        <span className="block truncate text-sm font-medium">{opt.label}</span>
                        {opt.subtitle && (
                          <span className="mt-0.5 block truncate text-xs text-[#736a5f]">{opt.subtitle}</span>
                        )}
                      </div>
                    </div>

                    {allowExclusion && onExcludedChange && (
                      <button
                        type="button"
                        onClick={(e) => toggleExclude(e, opt.value)}
                        title={isExcluded ? 'Annuler exclusion' : 'Exclure cette œuvre'}
                        className={`flex shrink-0 items-center space-x-1 rounded-none px-2 py-1 text-xs transition-colors ${
                          isExcluded
                            ? 'bg-rose-200 font-bold text-rose-900'
                            : 'text-[#8c8275] hover:bg-rose-50 hover:text-rose-700'
                        }`}
                      >
                        <Ban className="h-3.5 w-3.5" />
                        <span>{isExcluded ? 'Exclu' : 'Exclure'}</span>
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
