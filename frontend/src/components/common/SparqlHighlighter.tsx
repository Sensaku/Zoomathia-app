import React, { useState, useMemo } from 'react'
import { Copy, Check } from 'lucide-react'

interface SparqlHighlighterProps {
  code: string
  maxHeight?: string
  showLineNumbers?: boolean
  copyable?: boolean
  className?: string
}

import { tokenizeSparql, SparqlToken } from '../../utils/sparqlTokenizer'

/**
 * Composant de visualisation SPARQL avec coloration syntaxique complète
 */
export const SparqlHighlighter: React.FC<SparqlHighlighterProps> = ({
  code,
  maxHeight = 'max-h-72',
  showLineNumbers = true,
  copyable = true,
  className = '',
}) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    if (!code) return
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Découpage en lignes pour gérer la numérotation des lignes
  const lines = useMemo(() => {
    const rawLines = code.split('\n')
    return rawLines.map((line) => tokenizeSparql(line))
  }, [code])

  const renderToken = (token: SparqlToken, key: number) => {
    switch (token.type) {
      case 'comment':
        return (
          <span key={key} className="font-normal text-[#8e8579] italic">
            {token.value}
          </span>
        )
      case 'keyword':
        return (
          <span key={key} className="font-bold text-[#f59e0b]">
            {token.value}
          </span>
        )
      case 'variable':
        return (
          <span key={key} className="font-semibold text-[#60a5fa]">
            {token.value}
          </span>
        )
      case 'prefixed':
        return (
          <span key={key} className="font-medium text-[#34d399]">
            {token.value}
          </span>
        )
      case 'iri':
        return (
          <span key={key} className="text-[#f472b6] underline decoration-[#f472b6]/40 underline-offset-2">
            {token.value}
          </span>
        )
      case 'string':
        return (
          <span key={key} className="text-[#fde047]">
            {token.value}
          </span>
        )
      case 'number':
        return (
          <span key={key} className="font-mono text-[#fb923c]">
            {token.value}
          </span>
        )
      case 'operator':
        return (
          <span key={key} className="font-semibold text-[#cbd5e1]">
            {token.value}
          </span>
        )
      default:
        return (
          <span key={key} className="text-[#e2e8f0]">
            {token.value}
          </span>
        )
    }
  }

  return (
    <div
      className={`relative overflow-hidden rounded-none border border-[#3b3631] bg-[#1a1816] font-mono text-xs shadow-inner ${className}`}
    >
      {/* Bouton de copie flottant */}
      {copyable && (
        <button
          onClick={handleCopy}
          type="button"
          className="absolute top-2.5 right-2.5 z-10 flex cursor-pointer items-center gap-1.5 rounded-none border border-[#4a423b] bg-[#2d2824]/90 px-2.5 py-1 text-[11px] text-[#ded5c6] shadow-xs transition-colors hover:bg-[#3d3631]"
          title="Copier la requête"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-400" />
              <span className="font-semibold text-emerald-400">Copié</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3 text-[#b8ad9e]" />
              <span>Copier</span>
            </>
          )}
        </button>
      )}

      {/* Code avec lignes numérotées */}
      <div
        className={`overflow-x-auto ${maxHeight} scrollbar-thin scrollbar-thumb-[#4a423b] scrollbar-track-transparent p-3.5 leading-relaxed`}
      >
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((lineTokens, lineIdx) => (
              <tr key={lineIdx} className="transition-colors hover:bg-[#26221f]/50">
                {showLineNumbers && (
                  <td className="w-8 pr-3.5 text-right align-top font-mono text-[11px] text-[#5e564d] select-none">
                    {lineIdx + 1}
                  </td>
                )}
                <td className="pl-1 align-top font-mono text-[11px] whitespace-pre text-[#f1ede8] md:text-xs">
                  {lineTokens.length === 0 || (lineTokens.length === 1 && lineTokens[0].value === '') ? (
                    <span>&nbsp;</span>
                  ) : (
                    lineTokens.map((token, tokenIdx) => renderToken(token, tokenIdx))
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
