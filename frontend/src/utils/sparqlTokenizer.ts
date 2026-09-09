/**
 * Tokenizer SPARQL optimisé pour la coloration syntaxique temps réel.
 * Conforme à la grammaire W3C SPARQL 1.1 Query Language.
 */

export interface SparqlToken {
  type: 'keyword' | 'variable' | 'prefixed' | 'iri' | 'string' | 'comment' | 'number' | 'operator' | 'text';
  value: string;
}

const TOKEN_REGEX = /(#.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(<[^>]+>)|(\?[a-zA-Z0-9_]+)|(\b(?:PREFIX|SELECT|CONSTRUCT|DESCRIBE|ASK|WHERE|FILTER|OPTIONAL|UNION|NOT\s+EXISTS|EXISTS|GRAPH|SERVICE|ORDER\s+BY|GROUP\s+BY|HAVING|LIMIT|OFFSET|DISTINCT|REDUCED|AS|BIND|VALUES|REGEX|STR|LANG|LCASE|UCASE|STRLEN|BOUND|COUNT|SUM|AVG|MIN|MAX|SAMPLE|CONCAT|REPLACE|CONTAINS|SUBSTR|NOW|YEAR|MONTH|DAY|a)\b)|([a-zA-Z0-9_]+:[a-zA-Z0-9_-]*)|(\b\d+(?:\.\d+)?\b)|(&&|\|\||!=|<=|>=|[=<>!+\-*/;,.{}()])/gim

export function tokenizeSparql(code: string): SparqlToken[] {
  if (!code) return []

  const tokens: SparqlToken[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  TOKEN_REGEX.lastIndex = 0 // Réinitialisation de l'état global du regex

  while ((match = TOKEN_REGEX.exec(code)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', value: code.slice(lastIndex, match.index) })
    }

    if (match[1]) {
      tokens.push({ type: 'comment', value: match[1] })
    } else if (match[2]) {
      tokens.push({ type: 'string', value: match[2] })
    } else if (match[3]) {
      tokens.push({ type: 'iri', value: match[3] })
    } else if (match[4]) {
      tokens.push({ type: 'variable', value: match[4] })
    } else if (match[5]) {
      tokens.push({ type: 'keyword', value: match[5] })
    } else if (match[6]) {
      tokens.push({ type: 'prefixed', value: match[6] })
    } else if (match[7]) {
      tokens.push({ type: 'number', value: match[7] })
    } else if (match[8]) {
      tokens.push({ type: 'operator', value: match[8] })
    }

    lastIndex = TOKEN_REGEX.lastIndex
  }

  if (lastIndex < code.length) {
    tokens.push({ type: 'text', value: code.slice(lastIndex) })
  }

  return tokens
}
