import React, { useState, useMemo } from 'react'
import { Copy, Check } from 'lucide-react'

interface SparqlHighlighterProps {
  code: string;
  maxHeight?: string;
  showLineNumbers?: boolean;
  copyable?: boolean;
  className?: string;
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
          <span key={key} className="text-[#8e8579] italic font-normal">
            {token.value}
          </span>
        )
      case 'keyword':
        return (
          <span key={key} className="text-[#f59e0b] font-bold">
            {token.value}
          </span>
        )
      case 'variable':
        return (
          <span key={key} className="text-[#60a5fa] font-semibold">
            {token.value}
          </span>
        )
      case 'prefixed':
        return (
          <span key={key} className="text-[#34d399] font-medium">
            {token.value}
          </span>
        )
      case 'iri':
        return (
          <span key={key} className="text-[#f472b6] underline underline-offset-2 decoration-[#f472b6]/40">
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
          <span key={key} className="text-[#fb923c] font-mono">
            {token.value}
          </span>
        )
      case 'operator':
        return (
          <span key={key} className="text-[#cbd5e1] font-semibold">
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
    <div className={`relative rounded-none overflow-hidden border border-[#3b3631] bg-[#1a1816] text-xs font-mono shadow-inner ${className}`}>
      {/* Bouton de copie flottant */}
      {copyable && (
        <button
          onClick={handleCopy}
          type="button"
          className="absolute right-2.5 top-2.5 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-none bg-[#2d2824]/90 hover:bg-[#3d3631] text-[#ded5c6] border border-[#4a423b] transition-colors shadow-xs cursor-pointer text-[11px]"
          title="Copier la requête"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400 font-semibold">Copié</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3 text-[#b8ad9e]" />
              <span>Copier</span>
            </>
          )}
        </button>
      )}

      {/* Code avec lignes numérotées */}
      <div className={`overflow-x-auto ${maxHeight} p-3.5 scrollbar-thin scrollbar-thumb-[#4a423b] scrollbar-track-transparent leading-relaxed`}>
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((lineTokens, lineIdx) => (
              <tr key={lineIdx} className="hover:bg-[#26221f]/50 transition-colors">
                {showLineNumbers && (
                  <td className="w-8 select-none text-right pr-3.5 text-[#5e564d] font-mono text-[11px] align-top">
                    {lineIdx + 1}
                  </td>
                )}
                <td className="whitespace-pre font-mono text-[11px] md:text-xs text-[#f1ede8] align-top pl-1">
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
