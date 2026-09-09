import React, { useRef, useState, useMemo } from 'react'
import { Copy, Check, Trash2, Sparkles, Command, Sun, Moon } from 'lucide-react'
import { tokenizeSparql, SparqlToken } from '../../utils/sparqlTokenizer'
import { useI18n } from '../../i18n'

interface SparqlEditorProps {
  value: string;
  onChange: (val: string) => void;
  onRun: () => void;
  isPending?: boolean;
  placeholder?: string;
  className?: string;
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
  className = ''
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
          return <span key={index} className="text-[#fbbf24] font-bold">{token.value}</span>
        case 'variable':
          return <span key={index} className="text-[#60a5fa] font-semibold">{token.value}</span>
        case 'prefixed':
          return <span key={index} className="text-[#34d399] font-medium">{token.value}</span>
        case 'iri':
          return <span key={index} className="text-[#c084fc] underline underline-offset-2 decoration-[#c084fc]/40">{token.value}</span>
        case 'string':
          return <span key={index} className="text-[#fde047]">{token.value}</span>
        case 'comment':
          return <span key={index} className="text-[#8e8579] italic">{token.value}</span>
        case 'number':
          return <span key={index} className="text-[#fb923c]">{token.value}</span>
        case 'operator':
          return <span key={index} className="text-[#cbd5e1]">{token.value}</span>
        default:
          return <span key={index} className="text-[#f1ede8]">{token.value}</span>
      }
    } else {
      switch (token.type) {
        case 'keyword':
          return <span key={index} className="text-[#9A6530] font-bold">{token.value}</span>
        case 'variable':
          return <span key={index} className="text-[#1d4ed8] font-semibold">{token.value}</span>
        case 'prefixed':
          return <span key={index} className="text-[#047857] font-medium">{token.value}</span>
        case 'iri':
          return <span key={index} className="text-[#7c3aed] underline underline-offset-2 decoration-[#7c3aed]/40">{token.value}</span>
        case 'string':
          return <span key={index} className="text-[#b45309]">{token.value}</span>
        case 'comment':
          return <span key={index} className="text-[#8c8275] italic">{token.value}</span>
        case 'number':
          return <span key={index} className="text-[#c026d3]">{token.value}</span>
        case 'operator':
          return <span key={index} className="text-[#4b5563]">{token.value}</span>
        default:
          return <span key={index} className="text-[#2c2724]">{token.value}</span>
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
      className={`flex flex-col rounded-none border transition-colors shadow-inner overflow-hidden ${
        isDarkTheme
          ? 'bg-[#181614] border-[#3b3631]'
          : 'bg-[#faf9f6] border-[#ded5c6]'
      } ${className}`}
    >
      {/* Barre d'outils supérieure */}
      <div
        className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b text-xs transition-colors ${
          isDarkTheme
            ? 'bg-[#221f1c] border-[#3b3631] text-[#ded5c6]'
            : 'bg-[#f4ede2] border-[#e6dfd3] text-[#736a5f]'
        }`}
      >
        {/* Préfixes RDF rapides */}
        <div className="flex items-center space-x-1.5 flex-wrap">
          <span
            className={`font-semibold flex items-center gap-1 text-[11px] uppercase tracking-wider mr-1 ${
              isDarkTheme ? 'text-[#a89d90]' : 'text-[#8c8275]'
            }`}
          >
            <Sparkles className="w-3 h-3 text-[#9A6530]" />
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
                className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-none text-[11px] font-mono transition-colors ${
                  isAlreadyAdded
                    ? isDarkTheme
                      ? 'bg-[#2c2724] text-[#6b6257] cursor-default'
                      : 'bg-[#e9e2d6] text-[#a19688] cursor-default'
                    : isDarkTheme
                    ? 'bg-[#2d2824] text-[#ded5c6] hover:bg-[#9A6530] hover:text-white border border-[#4a423b] cursor-pointer'
                    : 'bg-white text-[#736a5f] hover:bg-[#9A6530] hover:text-white border border-[#ded5c6] shadow-xs cursor-pointer'
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
            className={`inline-flex items-center space-x-1 px-2 py-1 rounded-none border text-xs transition-colors cursor-pointer ${
              isDarkTheme
                ? 'bg-[#2d2824] border-[#4a423b] text-[#fbbf24] hover:bg-[#3d3631]'
                : 'bg-white border-[#ded5c6] text-[#736a5f] hover:text-[#9A6530]'
            }`}
            title={isDarkTheme ? t.sparql.themeLightTooltip : t.sparql.themeDarkTooltip}
          >
            {isDarkTheme ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
            <span className="text-[10px] hidden sm:inline">
              {isDarkTheme ? t.sparql.themeLightLabel : t.sparql.themeDarkLabel}
            </span>
          </button>

          <button
            type="button"
            onClick={handleCopy}
            disabled={!value.trim()}
            className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-none border text-xs transition-colors disabled:opacity-40 cursor-pointer ${
              isDarkTheme
                ? 'bg-[#2d2824] border-[#4a423b] text-[#ded5c6] hover:text-white hover:border-[#9A6530]'
                : 'bg-white border-[#ded5c6] text-[#736a5f] hover:text-[#9A6530] hover:border-[#9A6530]'
            }`}
            title={t.sparql.editorCopy}
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-500" />
                <span className="text-emerald-500 font-medium">{t.sparql.editorCopied}</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>{t.sparql.editorCopy}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleClear}
            disabled={!value.trim()}
            className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-none border text-xs transition-colors disabled:opacity-40 cursor-pointer ${
              isDarkTheme
                ? 'bg-[#2d2824] border-[#4a423b] text-[#ded5c6] hover:text-red-400 hover:border-red-500/50'
                : 'bg-white border-[#ded5c6] text-[#736a5f] hover:text-red-700 hover:border-red-300'
            }`}
            title={t.sparql.editorClear}
          >
            <Trash2 className="w-3 h-3" />
            <span>{t.sparql.editorClear}</span>
          </button>
        </div>
      </div>

      {/* Zone d'édition avec coloration syntaxique par superposition */}
      <div className="relative flex flex-1 min-h-[300px] max-h-[520px]">
        
        {/* Gouttière des numéros de ligne */}
        <div
          ref={gutterRef}
          aria-hidden="true"
          className={`w-11 py-3.5 text-right pr-2.5 select-none font-mono text-xs overflow-hidden leading-6 shrink-0 transition-colors border-r ${
            isDarkTheme
              ? 'bg-[#201d1a] border-[#3b3631] text-[#6b6257]'
              : 'bg-[#f0eae0] border-[#ded5c6] text-[#a69d90]'
          }`}
        >
          {lineNumbers.map((num) => (
            <div key={num} className="h-6">
              {num}
            </div>
          ))}
        </div>

        {/* Conteneur superposé (Pre en arrière-plan + Textarea transparent au premier plan) */}
        <div className="relative flex-1 min-w-0 overflow-hidden">
          
          {/* Couche d'affichage colorée en arrière-plan */}
          <pre
            ref={preRef}
            aria-hidden="true"
            className="absolute inset-0 p-3.5 m-0 font-mono text-xs md:text-sm leading-6 whitespace-pre overflow-hidden pointer-events-none select-none"
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
            placeholder={tokens.length === 0 ? (placeholder || t.sparql.queryPlaceholder) : ''}
            className={`absolute inset-0 w-full h-full p-3.5 m-0 font-mono text-xs md:text-sm leading-6 whitespace-pre bg-transparent text-transparent resize-none outline-none focus:outline-none overflow-auto scrollbar-thin ${
              isDarkTheme
                ? 'caret-amber-400 selection:bg-amber-400/25 selection:text-transparent placeholder-[#6b6257]'
                : 'caret-[#9A6530] selection:bg-[#9A6530]/25 selection:text-transparent placeholder-[#9e9486]'
            }`}
          />
        </div>

      </div>

      {/* Barre d'état inférieure */}
      <div
        className={`flex items-center justify-between px-3 py-1.5 border-t text-[11px] transition-colors ${
          isDarkTheme
            ? 'bg-[#221f1c] border-[#3b3631] text-[#a89d90]'
            : 'bg-[#f4ede2] border-[#e6dfd3] text-[#736a5f]'
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

        <div
          className={`flex items-center space-x-1 ${
            isDarkTheme ? 'text-[#8e8579]' : 'text-[#8c8275]'
          }`}
        >
          <Command className="w-3 h-3" />
          <span>{t.sparql.shortcutHint}</span>
        </div>
      </div>
    </div>
  )
}
