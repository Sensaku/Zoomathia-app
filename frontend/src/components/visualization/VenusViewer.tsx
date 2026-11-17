import React, { useEffect, useRef, useState, useMemo } from 'react'
import '@wimmics/venus'
import { Maximize2, Minimize2, ZoomIn, ZoomOut, RotateCcw, Search, Info, SlidersHorizontal } from 'lucide-react'
import { useI18n } from '../../i18n'

interface VenusViewerProps {
  spoData: any
  title?: string
  nodeLimit?: number
  onNodeLimitChange?: (limit: number) => void
  onSelectEntity?: (entityName: string) => void
  selectedEntityName?: string | null
}

/**
 * Composant de visualisation pour la bibliothèque Wimmics/Venus.
 * Pilote le web-component <venus-graph> et ses contrôles via le Shadow DOM et le renderer interne D3.
 */
const VenusViewerComponent: React.FC<VenusViewerProps> = ({
  spoData,
  title,
  nodeLimit = 25,
  onNodeLimitChange,
  onSelectEntity,
  selectedEntityName,
}) => {
  const { t } = useI18n()
  const graphRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [isRendering, setIsRendering] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [filterQuery, setFilterQuery] = useState('')

  // Utilisation d'une ref pour stabiliser onSelectEntity et éviter tout re-render destructif du canvas
  const onSelectEntityRef = useRef(onSelectEntity)
  useEffect(() => {
    onSelectEntityRef.current = onSelectEntity
  }, [onSelectEntity])

  // Analyse des sources uniques disponibles dans les données
  const sourceStats = useMemo(() => {
    if (!spoData?.head?.vars || !spoData?.results?.bindings) {
      return { totalSources: 0, field: 's', sourceCounts: {} as Record<string, number> }
    }
    const vars: string[] = spoData.head.vars
    const pick = (candidates: string[]) => candidates.find((v) => vars.includes(v))
    const sourceField = pick(['s', 'paragraph']) || vars[0]

    const sourceCounts: Record<string, number> = {}
    for (const b of spoData.results.bindings) {
      const val = b[sourceField]?.value
      if (val) {
        sourceCounts[val] = (sourceCounts[val] || 0) + 1
      }
    }
    return {
      totalSources: Object.keys(sourceCounts).length,
      field: sourceField,
      sourceCounts,
    }
  }, [spoData])

  // Rendu initial et mise à jour des données du graphe VENUS
  // ATTENTION : cet effet ne doit dépendre QUE des données réelles (spoData, nodeLimit, filterQuery),
  // et JAMAIS de onSelectEntity ni de selectedEntityName pour préserver la position des nœuds.
  useEffect(() => {
    const element = graphRef.current
    if (!element || !spoData || !spoData.head) {
      return
    }

    let isMounted = true

    const renderGraph = async () => {
      setIsRendering(true)
      setError(null)

      try {
        const vars: string[] = spoData.head?.vars || []
        const pick = (candidates: string[]) => candidates.find((v) => vars.includes(v))
        const sourceField = pick(['s', 'paragraph']) || vars[0]
        const targetField = pick(['o', 'date', 'type', 'name_animal']) || vars[1]

        let topSources: Set<string> | null = null
        if (nodeLimit > 0) {
          const sortedEntries = Object.entries(sourceStats.sourceCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, nodeLimit)
          topSources = new Set(sortedEntries.map(([name]) => name))
        }

        const filteredBindings = (spoData.results?.bindings || []).filter((b: any) => {
          const val = b[sourceField]?.value
          if (topSources && !topSources.has(val)) return false
          if (filterQuery.trim()) {
            const query = filterQuery.toLowerCase()
            const sVal = (b[sourceField]?.value || '').toLowerCase()
            const tVal = (b[targetField]?.value || '').toLowerCase()
            return sVal.includes(query) || tVal.includes(query)
          }
          return true
        })

        const filteredResult = {
          head: spoData.head,
          results: {
            bindings: filteredBindings,
          },
        }

        element.sparqlResult = filteredResult
        element.encoding = {
          nodes: {
            source: { field: sourceField, color: { value: '#2563eb' } },
            target: { field: targetField, color: { value: '#9A6530' } },
          },
          links: { color: { value: '#cbd5e1' } },
          interactions: { drag: true, zoom: true, tooltip: true },
        }

        // Interception du callback natif du renderer VENUS sans re-déclencher le cycle
        element._onClick = (eventInfo: any) => {
          const datum = eventInfo?.datum
          const nodeName = datum?.id || datum?.label || datum?.name || datum?.key || ''
          if (nodeName && onSelectEntityRef.current) {
            onSelectEntityRef.current(String(nodeName).trim())
          }
        }

        await element.launch()

        if (!isMounted) return

        // Personnalisation et écouteurs dans le Shadow DOM
        setTimeout(() => {
          if (!isMounted) return
          const shadow = element.shadowRoot
          if (shadow) {
            // 1. Masquage des composants de légende résiduels internes de VENUS (qui créent la boîte "degree +")
            let styleEl = shadow.querySelector('#venus-custom-overrides') as HTMLStyleElement
            if (!styleEl) {
              styleEl = document.createElement('style')
              styleEl.id = 'venus-custom-overrides'
              shadow.appendChild(styleEl)
            }
            styleEl.textContent = `
              legend-size, legend-color, .legend-container, .venus-legend {
                display: none !important;
                visibility: hidden !important;
                height: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
              }
              svg {
                cursor: grab;
                user-select: none;
                width: 100%;
                height: 100%;
              }
              svg:active {
                cursor: grabbing;
              }
              circle {
                cursor: pointer !important;
                transition: r 0.2s ease, stroke 0.2s ease, stroke-width 0.2s ease;
              }
              circle:hover {
                stroke: #9A6530 !important;
                stroke-width: 3.5px !important;
              }
              text.node-label {
                cursor: pointer !important;
                user-select: none;
                font-family: inherit;
                font-size: 11px;
                fill: #2c2724;
              }
            `

            // 2. Écouteur au clic sur les nœuds du SVG comme fallback supplémentaire
            const svg = shadow.querySelector('svg')
            if (svg) {
              const handleShadowClick = (e: MouseEvent) => {
                const path = e.composedPath ? e.composedPath() : []
                for (const item of path) {
                  const targetEl = item as SVGElement
                  if (targetEl && targetEl.tagName) {
                    const tag = targetEl.tagName.toLowerCase()
                    if (tag === 'circle' || tag === 'text') {
                      const d3Data = (targetEl as any).__data__
                      const name = d3Data?.id || d3Data?.label || d3Data?.name || targetEl.textContent?.trim() || ''
                      if (name && onSelectEntityRef.current) {
                        onSelectEntityRef.current(String(name).trim())
                        break
                      }
                    }
                  }
                }
              }

              svg.removeEventListener('click', (element as any)._customClickHandler)
              ;(element as any)._customClickHandler = handleShadowClick
              svg.addEventListener('click', handleShadowClick)
            }
          }
        }, 200)
      } catch (err: any) {
        console.error('Erreur de rendu VENUS:', err)
        setError('Impossible de générer le graphe visuel pour cette requête.')
      } finally {
        if (isMounted) {
          setIsRendering(false)
        }
      }
    }

    renderGraph()

    return () => {
      isMounted = false
    }
  }, [spoData, nodeLimit, filterQuery, sourceStats])

  // Effet dédié UNIQUEMENT à la mise en surbrillance visuelle du nœud sélectionné dans le graphe
  // Ne relance JAMAIS le moteur physique D3 ni element.launch()
  useEffect(() => {
    const element = graphRef.current
    if (!element) return
    const shadow = element.shadowRoot
    if (!shadow) return

    const circles = shadow.querySelectorAll('circle')
    circles.forEach((circle: any) => {
      const d3Data = circle.__data__
      const name = d3Data?.id || d3Data?.label || d3Data?.name || ''
      if (selectedEntityName && name && name.toLowerCase() === selectedEntityName.toLowerCase()) {
        circle.setAttribute('stroke', '#eab308')
        circle.setAttribute('stroke-width', '4px')
        circle.style.filter = 'drop-shadow(0 0 8px rgba(234, 179, 8, 0.8))'
      } else {
        circle.style.filter = ''
        circle.setAttribute('stroke-width', '1.5px')
      }
    })
  }, [selectedEntityName])

  // Gestion du plein écran avec sortie via la touche Échap
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFullscreen])

  // Redimensionnement du graphe lors des changements de plein écran
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'))
      const el = graphRef.current
      if (el?.renderer?.resize && containerRef.current) {
        const w = containerRef.current.clientWidth
        const h = isFullscreen ? window.innerHeight - 100 : 600
        try {
          el.renderer.resize(w, h)
        } catch {
          // ignore
        }
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [isFullscreen])

  // Contrôles de Zoom dans le SVG (D3 scaleBy + fallback WheelEvent)
  const handleZoom = (direction: 'in' | 'out' | 'reset') => {
    const el = graphRef.current
    if (!el) return

    const renderer = el.renderer
    const shadow = el.shadowRoot
    const svg = shadow ? shadow.querySelector('svg') : el.querySelector('svg')

    // 1. Recentrage / Reset
    if (direction === 'reset') {
      if (renderer && typeof renderer._applyInitialZoomFit === 'function') {
        renderer._applyInitialZoomFit()
        return
      }
      if (renderer?.zoomBehavior && renderer?.svg) {
        try {
          renderer.zoomBehavior.transform(renderer.svg, { k: 1, x: 0, y: 0 })
          return
        } catch {
          // continue fallback
        }
      }
      if (svg) {
        const g = svg.querySelector('g.chart-group') || svg.querySelector('g')
        if (g) {
          g.setAttribute('transform', 'translate(0, 0) scale(1)')
          return
        }
      }
      return
    }

    // 2. Facteur de Zoom avant (+) ou arrière (-)
    const factor = direction === 'in' ? 1.35 : 0.74

    if (renderer?.zoomBehavior && renderer?.svg) {
      try {
        renderer.zoomBehavior.scaleBy(renderer.svg, factor)
        return
      } catch (err) {
        console.warn('zoomBehavior.scaleBy a échoué, essai du fallback:', err)
      }
    }

    // 3. Fallback direct par simulation de WheelEvent sur le SVG
    if (svg) {
      const bbox = svg.getBoundingClientRect()
      const deltaY = direction === 'in' ? -180 : 180
      const wheelEvt = new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: bbox.left + bbox.width / 2,
        clientY: bbox.top + bbox.height / 2,
        deltaY: deltaY,
      })
      svg.dispatchEvent(wheelEvt)
    }
  }

  // Bascule plein écran
  const toggleFullscreen = () => {
    setIsFullscreen((prev) => !prev)
  }

  return (
    <div
      ref={containerRef}
      className={`rounded-none border border-[#ded5c6] bg-white shadow-xs transition-all ${
        isFullscreen ? 'fixed inset-0 z-[9999] flex flex-col rounded-none border-0 bg-[#faf9f6] p-6' : 'p-4'
      }`}
    >
      {/* En-tête de visualisation & barre d'outils */}
      <div className="mb-3 flex flex-col justify-between gap-3 border-b border-[#f0eae0] pb-3 md:flex-row md:items-center">
        <div>
          {title && (
            <h3 className="flex items-center gap-2 font-serif text-lg font-semibold text-[#332e28]">
              <span>{title}</span>
              {selectedEntityName && (
                <span className="rounded-none border border-[#9A6530]/30 bg-[#9A6530]/10 px-2.5 py-0.5 font-sans text-xs font-medium font-normal text-[#9A6530]">
                  Focus : <strong>{selectedEntityName}</strong>
                </span>
              )}
            </h3>
          )}
          <div className="mt-1 flex items-center gap-3 text-xs text-[#8c8275]">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-none bg-[#2563eb] shadow-xs"></span>
              <span className="font-medium">Entités sources</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-none bg-[#9A6530] shadow-xs"></span>
              <span className="font-medium">Cibles / Propriétés</span>
            </span>
            <span className="hidden text-[#b8ad9e] sm:inline">|</span>
            <span className="hidden rounded-none border border-[#ebe4d6] bg-[#f8f5f0] px-2 py-0.5 text-[11px] sm:inline">
              Moteur Wimmics VENUS
            </span>
          </div>
        </div>

        {/* Contrôles du graphe */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Recherche d'entité */}
          <div className="relative">
            <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[#8c8275]" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Filtrer entité..."
              className="w-32 rounded-none border border-[#ded5c6] bg-[#faf9f6] py-1.5 pr-2.5 pl-8 text-xs shadow-2xs transition-all focus:ring-2 focus:ring-[#9A6530] focus:outline-none md:w-40"
            />
          </div>

          {/* Curseur / Sélecteur de densité */}
          {onNodeLimitChange && (
            <div className="flex items-center gap-1.5 rounded-none border border-[#ded5c6] bg-[#f8f5f0] px-2.5 py-1 text-xs text-[#595248]">
              <SlidersHorizontal className="h-3.5 w-3.5 text-[#9A6530]" />
              <span className="hidden font-medium sm:inline">Densité :</span>
              <select
                value={nodeLimit}
                onChange={(e) => onNodeLimitChange(Number(e.target.value))}
                className="cursor-pointer border-none bg-transparent text-xs font-semibold text-[#9A6530] focus:outline-none"
                title="Nombre d'entités les plus fréquentes affichées"
              >
                <option value={15}>Top 15</option>
                <option value={25}>Top 25</option>
                <option value={50}>Top 50</option>
                <option value={100}>Top 100</option>
                <option value={0}>Toutes ({sourceStats.totalSources})</option>
              </select>
            </div>
          )}

          {/* Boutons Zoom */}
          <div className="flex items-center rounded-none border border-[#ded5c6] bg-[#f8f5f0] p-0.5 shadow-2xs">
            <button
              onClick={() => handleZoom('in')}
              className="cursor-pointer rounded-none p-1.5 text-[#696156] transition-colors hover:bg-white hover:text-[#2c2724] active:scale-95"
              title="Zoom avant (+)"
              type="button"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              onClick={() => handleZoom('out')}
              className="cursor-pointer rounded-none p-1.5 text-[#696156] transition-colors hover:bg-white hover:text-[#2c2724] active:scale-95"
              title="Zoom arrière (-)"
              type="button"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <button
              onClick={() => handleZoom('reset')}
              className="cursor-pointer rounded-none p-1.5 text-[#696156] transition-colors hover:bg-white hover:text-[#2c2724] active:scale-95"
              title="Recentrer la vue"
              type="button"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>

          {/* Plein écran */}
          <button
            onClick={toggleFullscreen}
            className="cursor-pointer rounded-none border border-[#ded5c6] bg-[#f8f5f0] p-1.5 text-[#696156] shadow-2xs transition-colors hover:bg-white hover:text-[#2c2724] active:scale-95"
            title={isFullscreen ? t.cqs.exitFullscreen : t.cqs.fullscreen}
            type="button"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4 text-[#9A6530]" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Avertissement méthodologique sur l'échantillonnage */}
      {nodeLimit > 0 && sourceStats.totalSources > nodeLimit && (
        <div className="mb-2.5 flex items-center justify-between rounded-none border border-[#f0eae0] bg-[#fdfbf7] px-3 py-1.5 text-[11px] text-[#786e61]">
          <div className="flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 shrink-0 text-[#9A6530]" />
            <span>
              Affichage des <strong>{nodeLimit}</strong> entités les plus fréquentes sur{' '}
              <strong>{sourceStats.totalSources}</strong>.
            </span>
          </div>
          {onNodeLimitChange && (
            <button
              onClick={() => onNodeLimitChange(0)}
              className="ml-2 cursor-pointer font-medium text-[#9A6530] underline hover:text-[#855424]"
            >
              Afficher toutes les entités
            </button>
          )}
        </div>
      )}

      {/* Zone de rendu graphique */}
      {error ? (
        <div className="rounded-none bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : (
        <div
          className={`relative w-full overflow-hidden rounded-none border border-[#ded5c6] bg-[#faf9f6] ${
            isFullscreen ? 'min-h-[500px] flex-1' : 'h-[600px]'
          }`}
        >
          {isRendering && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70">
              <span className="text-sm font-medium text-[#736a5f]">Calcul du graphe VENUS...</span>
            </div>
          )}
          <venus-graph
            ref={graphRef}
            id="venus-graph-instance"
            className="block h-full w-full"
            width="100%"
            height={isFullscreen ? '100%' : '600'}
          />
        </div>
      )}
    </div>
  )
}

export const VenusViewer = React.memo(VenusViewerComponent)
