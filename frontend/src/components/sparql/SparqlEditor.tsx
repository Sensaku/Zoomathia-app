import React, { useRef, useState, useMemo } from 'react'
import { Copy, Check, Trash2, Sparkles, Command, Sun, Moon } from 'lucide-react'
import { tokenizeSparql, SparqlToken } from '../../utils/sparqlTokenizer'
import { useI18n } from '../../i18n'

interface SparqlEditorProps {
  value: string
  onChange: (val: string) => void
  onRun: () => void
  isPending?: boolean
  placeholder?: string
  className?: string
}

const COMMON_PREFIXES = [
  { prefix: 'skos', uri: 'http://www.w3.org/2004/02/skos/core#' },
  { prefix: 'oa', uri: 'http://www.w3.org/ns/oa#' },
  { prefix: 'zoom', uri: 'http://ns.inria.fr/zoomathia/' },
  { prefix: 'rdf', uri: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#' },
  { prefix: 'rdfs', uri: 'http://www.w3.org/2000/01/rdf-schema#' },
]

export const SparqlEditor: React.FC<SparqlEditorProps> = ({
  value,
  onChange,
  onRun,
  isPending = false,
  placeholder,
  className = '',
}) => {
  const { t } = useI18n()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const preRef = useRef<HTMLPreElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)
  const [isDarkTheme, setIsDarkTheme] = useState(false)

  // Synchronisation du défilement entre le textarea, la couche de coloration et la gouttière
  const handleScroll = () => {
    const textarea = textareaRef.current
    if (!textarea) return

    if (preRef.current) {
      preRef.current.scrollTop = textarea.scrollTop
      preRef.current.scrollLeft = textarea.scrollLeft
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = textarea.scrollTop
    }
  }

  // Tokenisation syntaxique temps réel
  const tokens = useMemo(() => {
    return tokenizeSparql(value)
  }, [value])

  // Calcul du nombre de lignes
  const linesCount = useMemo(() => {
    return Math.max(1, value.split('\n').length)
  }, [value])

  const lineNumbers = useMemo(() => {
    return Array.from({ length: linesCount }, (_, i) => i + 1)
  }, [linesCount])

  // Rendu coloré d'un token selon le thème (Clair ou Sombre)
  const renderToken = (token: SparqlToken, index: number) => {
    if (isDarkTheme) {
      switch (token.type) {
        case 'keyword':
          return (
            <span key={index} className="font-bold text-[#fbbf24]">
              {token.value}
            </span>
          )
        case 'variable':
          return (
            <span key={index} className="font-semibold text-[#60a5fa]">
              {token.value}
            </span>
          )
        case 'prefixed':
          return (
            <span key={index} className="font-medium text-[#34d399]">
              {token.value}
            </span>
          )
        case 'iri':
          return (
            <span key={index} className="text-[#c084fc] underline decoration-[#c084fc]/40 underline-offset-2">
              {token.value}
            </span>
          )
        case 'string':
          return (
            <span key={index} className="text-[#fde047]">
              {token.value}
            </span>
          )
        case 'comment':
          return (
            <span key={index} className="text-[#8e8579] italic">
              {token.value}
            </span>
          )
        case 'number':
          return (
            <span key={index} className="text-[#fb923c]">
              {token.value}
            </span>
          )
        case 'operator':
          return (
            <span key={index} className="text-[#cbd5e1]">
              {token.value}
            </span>
          )
        default:
          return (
            <span key={index} className="text-[#f1ede8]">
              {token.value}
            </span>
          )
      }
    } else {
      switch (token.type) {
        case 'keyword':
          return (
            <span key={index} className="font-bold text-[#9A6530]">
              {token.value}
            </span>
          )
        case 'variable':
          return (
            <span key={index} className="font-semibold text-[#1d4ed8]">
              {token.value}
            </span>
          )
        case 'prefixed':
          return (
            <span key={index} className="font-medium text-[#047857]">
              {token.value}
            </span>
          )
        case 'iri':
          return (
            <span key={index} className="text-[#7c3aed] underline decoration-[#7c3aed]/40 underline-offset-2">
              {token.value}
            </span>
          )
        case 'string':
          return (
            <span key={index} className="text-[#b45309]">
              {token.value}
            </span>
          )
        case 'comment':
          return (
            <span key={index} className="text-[#8c8275] italic">
              {token.value}
            </span>
          )
        case 'number':
          return (
            <span key={index} className="text-[#c026d3]">
              {token.value}
            </span>
          )
        case 'operator':
          return (
            <span key={index} className="text-[#4b5563]">
              {token.value}
            </span>
          )
        default:
          return (
            <span key={index} className="text-[#2c2724]">
              {token.value}
            </span>
          )
      }
    }
  }

  // Gestion des raccourcis clavier
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl + Enter ou Cmd + Enter pour exécuter
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      if (!isPending && value.trim()) {
        onRun()
      }
      return
    }

    // Gestion de l'indentation avec Tab
    if (e.key === 'Tab') {
      e.preventDefault()
      const textarea = textareaRef.current
      if (!textarea) return

      const start = textarea.selectionStart
      const end = textarea.selectionEnd

      if (e.shiftKey) {
        // Désindentation (Shift + Tab)
        const lineStart = value.lastIndexOf('\n', start - 1) + 1
        if (value.substring(lineStart, lineStart + 2) === '  ') {
          const nextVal = value.substring(0, lineStart) + value.substring(lineStart + 2)
          onChange(nextVal)
          setTimeout(() => {
            textarea.selectionStart = Math.max(lineStart, start - 2)
            textarea.selectionEnd = Math.max(lineStart, end - 2)
          }, 0)
        }
      } else {
        // Indentation 2 espaces
        const nextVal = value.substring(0, start) + '  ' + value.substring(end)
        onChange(nextVal)
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 2
        }, 0)
      }
    }
  }

  // Insertion rapide de préfixe RDF
  const insertPrefix = (prefix: string, uri: string) => {
    const prefixLine = `PREFIX ${prefix}: <${uri}>`
    if (value.includes(`<${uri}>`) || value.includes(`PREFIX ${prefix}:`)) {
      return
    }
    const newContent = `${prefixLine}\n${value}`
    onChange(newContent)
  }

  const handleCopy = () => {
    if (!value) return
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleClear = () => {
    if (window.confirm(t.sparql.editorResetConfirm)) {
      onChange('')
    }
  }

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-none border shadow-inner transition-colors ${
        isDarkTheme ? 'border-[#3b3631] bg-[#181614]' : 'border-[#ded5c6] bg-[#faf9f6]'
      } ${className}`}
    >
      {/* Barre d'outils supérieure */}
      <div
        className={`flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 text-xs transition-colors ${
          isDarkTheme ? 'border-[#3b3631] bg-[#221f1c] text-[#ded5c6]' : 'border-[#e6dfd3] bg-[#f4ede2] text-[#736a5f]'
        }`}
      >
        {/* Préfixes RDF rapides */}
        <div className="flex flex-wrap items-center space-x-1.5">
          <span
            className={`mr-1 flex items-center gap-1 text-[11px] font-semibold tracking-wider uppercase ${
              isDarkTheme ? 'text-[#a89d90]' : 'text-[#8c8275]'
            }`}
          >
            <Sparkles className="h-3 w-3 text-[#9A6530]" />
            {t.sparql.prefixesTitle}:
          </span>
          {COMMON_PREFIXES.map(({ prefix, uri }) => {
            const isAlreadyAdded = value.includes(prefix + ':')
            return (
              <button
                key={prefix}
                type="button"
                onClick={() => insertPrefix(prefix, uri)}
                disabled={isAlreadyAdded}
                title={`PREFIX ${prefix}: <${uri}>`}
                className={`inline-flex items-center space-x-1 rounded-none px-2 py-0.5 font-mono text-[11px] transition-colors ${
                  isAlreadyAdded
                    ? isDarkTheme
                      ? 'cursor-default bg-[#2c2724] text-[#6b6257]'
                      : 'cursor-default bg-[#e9e2d6] text-[#a19688]'
                    : isDarkTheme
                      ? 'cursor-pointer border border-[#4a423b] bg-[#2d2824] text-[#ded5c6] hover:bg-[#9A6530] hover:text-white'
                      : 'cursor-pointer border border-[#ded5c6] bg-white text-[#736a5f] shadow-xs hover:bg-[#9A6530] hover:text-white'
                }`}
              >
                <span>+{prefix}:</span>
              </button>
            )
          })}
        </div>

        {/* Actions secondaires & Sélecteur de thème */}
        <div className="flex items-center space-x-1.5">
          {/* Bascule Thème Clair / Sombre */}
          <button
            type="button"
            onClick={() => setIsDarkTheme((prev) => !prev)}
            className={`inline-flex cursor-pointer items-center space-x-1 rounded-none border px-2 py-1 text-xs transition-colors ${
              isDarkTheme
                ? 'border-[#4a423b] bg-[#2d2824] text-[#fbbf24] hover:bg-[#3d3631]'
                : 'border-[#ded5c6] bg-white text-[#736a5f] hover:text-[#9A6530]'
            }`}
            title={isDarkTheme ? t.sparql.themeLightTooltip : t.sparql.themeDarkTooltip}
          >
            {isDarkTheme ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
            <span className="hidden text-[10px] sm:inline">
              {isDarkTheme ? t.sparql.themeLightLabel : t.sparql.themeDarkLabel}
            </span>
          </button>

          <button
            type="button"
            onClick={handleCopy}
            disabled={!value.trim()}
            className={`inline-flex cursor-pointer items-center space-x-1 rounded-none border px-2.5 py-1 text-xs transition-colors disabled:opacity-40 ${
              isDarkTheme
                ? 'border-[#4a423b] bg-[#2d2824] text-[#ded5c6] hover:border-[#9A6530] hover:text-white'
                : 'border-[#ded5c6] bg-white text-[#736a5f] hover:border-[#9A6530] hover:text-[#9A6530]'
            }`}
            title={t.sparql.editorCopy}
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-emerald-500" />
                <span className="font-medium text-emerald-500">{t.sparql.editorCopied}</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                <span>{t.sparql.editorCopy}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleClear}
            disabled={!value.trim()}
            className={`inline-flex cursor-pointer items-center space-x-1 rounded-none border px-2.5 py-1 text-xs transition-colors disabled:opacity-40 ${
              isDarkTheme
                ? 'border-[#4a423b] bg-[#2d2824] text-[#ded5c6] hover:border-red-500/50 hover:text-red-400'
                : 'border-[#ded5c6] bg-white text-[#736a5f] hover:border-red-300 hover:text-red-700'
            }`}
            title={t.sparql.editorClear}
          >
            <Trash2 className="h-3 w-3" />
            <span>{t.sparql.editorClear}</span>
          </button>
        </div>
      </div>

      {/* Zone d'édition avec coloration syntaxique par superposition */}
      <div className="relative flex max-h-[520px] min-h-[300px] flex-1">
        {/* Gouttière des numéros de ligne */}
        <div
          ref={gutterRef}
          aria-hidden="true"
          className={`w-11 shrink-0 overflow-hidden border-r py-3.5 pr-2.5 text-right font-mono text-xs leading-6 transition-colors select-none ${
            isDarkTheme
              ? 'border-[#3b3631] bg-[#201d1a] text-[#6b6257]'
              : 'border-[#ded5c6] bg-[#f0eae0] text-[#a69d90]'
          }`}
        >
          {lineNumbers.map((num) => (
            <div key={num} className="h-6">
              {num}
            </div>
          ))}
        </div>

        {/* Conteneur superposé (Pre en arrière-plan + Textarea transparent au premier plan) */}
        <div className="relative min-w-0 flex-1 overflow-hidden">
          {/* Couche d'affichage colorée en arrière-plan */}
          <pre
            ref={preRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 m-0 overflow-hidden p-3.5 font-mono text-xs leading-6 whitespace-pre select-none md:text-sm"
          >
            {tokens.length === 0 ? (
              <span className="text-[#9e9486] italic">{placeholder || t.sparql.queryPlaceholder}</span>
            ) : (
              tokens.map((token, i) => renderToken(token, i))
            )}
            {/* Si le texte se termine par un saut de ligne, on ajoute un espace insécable pour caler la hauteur */}
            {value.endsWith('\n') && <span>&nbsp;</span>}
          </pre>

          {/* Couche de saisie au premier plan (texte transparent, curseur visible) */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onScroll={handleScroll}
            rows={14}
            spellCheck={false}
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect="off"
            placeholder={tokens.length === 0 ? placeholder || t.sparql.queryPlaceholder : ''}
            className={`absolute inset-0 m-0 h-full w-full resize-none scrollbar-thin overflow-auto bg-transparent p-3.5 font-mono text-xs leading-6 whitespace-pre text-transparent outline-none focus:outline-none md:text-sm ${
              isDarkTheme
                ? 'placeholder-[#6b6257] caret-amber-400 selection:bg-amber-400/25 selection:text-transparent'
                : 'placeholder-[#9e9486] caret-[#9A6530] selection:bg-[#9A6530]/25 selection:text-transparent'
            }`}
          />
        </div>
      </div>

      {/* Barre d'état inférieure */}
      <div
        className={`flex items-center justify-between border-t px-3 py-1.5 text-[11px] transition-colors ${
          isDarkTheme ? 'border-[#3b3631] bg-[#221f1c] text-[#a89d90]' : 'border-[#e6dfd3] bg-[#f4ede2] text-[#736a5f]'
        }`}
      >
        <div className="flex items-center space-x-3">
          <span>
            {linesCount} {t.sparql.editorLines}
          </span>
          <span>•</span>
          <span>
            {value.length} {t.sparql.editorChars}
          </span>
        </div>

        <div className={`flex items-center space-x-1 ${isDarkTheme ? 'text-[#8e8579]' : 'text-[#8c8275]'}`}>
          <Command className="h-3 w-3" />
          <span>{t.sparql.shortcutHint}</span>
        </div>
      </div>
    </div>
  )
}
