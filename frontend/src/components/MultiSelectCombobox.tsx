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
  icon
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
      (opt) =>
        opt.label.toLowerCase().includes(lower) ||
        (opt.subtitle && opt.subtitle.toLowerCase().includes(lower))
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
    [options, selectedValues]
  )

  const excludedOptions = useMemo(
    () => options.filter((o) => excludedValues.includes(o.value)),
    [options, excludedValues]
  )

  return (
    <div className={`space-y-1.5 relative ${isOpen ? 'z-40' : 'z-10'}`} ref={containerRef}>
      <div className="flex items-center justify-between">
        <label className="flex items-center space-x-1.5 text-sm font-semibold uppercase tracking-wider text-[#63503d]">
          {icon && <span className="shrink-0">{icon}</span>}
          <span>{label}</span>
        </label>
        {(selectedValues.length > 0 || excludedValues.length > 0) && (
          <button
            type="button"
            onClick={handleClearAll}
            className="inline-flex items-center space-x-1 text-xs text-[#9A6530] hover:underline cursor-pointer"
          >
            <span>Effacer</span>
            <span className="inline-flex items-center justify-center text-center leading-none min-w-[18px] h-4.5 px-1.5 rounded-full bg-[#eaddcb] text-[#543b22] text-xs font-bold">
              {selectedValues.length + excludedValues.length}
            </span>
          </button>
        )}
      </div>

      {/* Barre de sélection active */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full min-h-[46px] p-2 rounded-none border bg-[#faf9f6] text-sm cursor-pointer flex flex-wrap items-center gap-2 transition-all ${
          isOpen
            ? 'border-[#9A6530] ring-2 ring-[#9A6530]/20 bg-white shadow-xs'
            : 'border-[#cfc5b4] hover:border-[#9A6530]'
        }`}
      >
        {selectedValues.length === 0 && excludedValues.length === 0 && (
          <span className="text-[#8c8275] px-2 text-sm">{placeholder}</span>
        )}

        {/* Badges inclus (verts/marrons) */}
        {selectedOptions.slice(0, maxBadgeDisplay).map((opt) => (
          <span
            key={opt.value}
            className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-none bg-[#eaddcb] text-[#543b22] text-xs font-medium leading-none"
          >
            <span className="truncate max-w-[180px]">{opt.label}</span>
            <button
              type="button"
              onClick={(e) => removeSelected(e, opt.value)}
              className="hover:text-red-600 rounded-none p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </span>
        ))}

        {/* Badges exclus (rouges) */}
        {excludedOptions.slice(0, maxBadgeDisplay).map((opt) => (
          <span
            key={opt.value}
            className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-none bg-rose-100 text-rose-800 border border-rose-200 text-xs font-medium line-through leading-none"
          >
            <span className="truncate max-w-[180px]">{opt.label}</span>
            <button
              type="button"
              onClick={(e) => removeExcluded(e, opt.value)}
              className="hover:text-rose-900 rounded-none p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </span>
        ))}

        {selectedValues.length + excludedValues.length > maxBadgeDisplay && (
          <span className="inline-flex items-center justify-center text-xs text-[#8c8275] font-semibold px-2.5 py-1 rounded-full bg-[#f0eae0] leading-none">
            +{selectedValues.length + excludedValues.length - maxBadgeDisplay} autre(s)
          </span>
        )}

        <div className="ml-auto pr-1 text-[#8c8275]">
          <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {/* Menu déroulant de recherche et sélection */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-none border border-[#cfc5b4] shadow-2xl p-2.5 space-y-2.5 animate-in fade-in zoom-in-95 duration-100 z-50">
            {/* Barre de recherche interne */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-[#8c8275]" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filtrer dans la liste..."
                className="w-full pl-9 pr-3 py-2 rounded-none border border-[#e6dfd3] bg-[#fcfbf9] text-sm text-[#2c2724] focus:outline-none focus:ring-2 focus:ring-[#9A6530]"
                autoFocus
              />
            </div>

            {/* Actions rapides */}
            <div className="flex items-center justify-between text-xs px-1 text-[#8c8275] border-b border-[#f0eae0] pb-2">
              <span className="font-medium">{filteredOptions.length} élément(s)</span>
              <div className="space-x-3">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-[#9A6530] hover:underline font-semibold"
                >
                  Tout cocher
                </button>
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-[#8c8275] hover:text-[#543b22]"
                >
                  Désélectionner
                </button>
              </div>
            </div>

            {/* Liste scrollable */}
            <div className="max-h-64 overflow-y-auto space-y-1 divide-y divide-[#f5f1eb]">
              {filteredOptions.length === 0 ? (
                <div className="p-4 text-center text-sm text-[#8c8275]">
                  Aucun résultat trouvé pour « {searchTerm} ».
                </div>
              ) : (
                filteredOptions.map((opt) => {
                  const isSelected = selectedValues.includes(opt.value)
                  const isExcluded = excludedValues.includes(opt.value)

                  return (
                    <div
                      key={opt.value}
                      onClick={() => toggleSelect(opt.value)}
                      className={`flex items-center justify-between p-2.5 rounded-none cursor-pointer transition-colors text-sm ${
                        isSelected
                          ? 'bg-[#f4ede2] text-[#543b22] font-semibold'
                          : isExcluded
                          ? 'bg-rose-50 text-rose-800 line-through'
                          : 'hover:bg-[#faf9f6] text-[#2c2724]'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                        <div
                          className={`w-4.5 h-4.5 rounded-none flex items-center justify-center border transition-colors shrink-0 ${
                            isSelected
                              ? 'bg-[#9A6530] border-[#9A6530] text-white'
                              : isExcluded
                              ? 'bg-rose-600 border-rose-600 text-white'
                              : 'border-[#cfc5b4] bg-white'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          {isExcluded && <X className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                        <div className="truncate">
                          <span className="block truncate text-sm font-medium">{opt.label}</span>
                          {opt.subtitle && (
                            <span className="block text-xs text-[#736a5f] truncate mt-0.5">
                              {opt.subtitle}
                            </span>
                          )}
                        </div>
                      </div>

                      {allowExclusion && onExcludedChange && (
                        <button
                          type="button"
                          onClick={(e) => toggleExclude(e, opt.value)}
                          title={isExcluded ? 'Annuler exclusion' : 'Exclure cette œuvre'}
                          className={`px-2 py-1 rounded-none text-xs transition-colors flex items-center space-x-1 shrink-0 ${
                            isExcluded
                              ? 'bg-rose-200 text-rose-900 font-bold'
                              : 'text-[#8c8275] hover:text-rose-700 hover:bg-rose-50'
                          }`}
                        >
                          <Ban className="w-3.5 h-3.5" />
                          <span>
                            {isExcluded ? 'Exclu' : 'Exclure'}
                          </span>
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
