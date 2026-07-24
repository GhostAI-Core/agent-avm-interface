'use client'
// Option 2 — the funnel-graph-js library (2D horizontal funnel), recoloured to our green schema.
// The lib is DOM-driven (draws into a container by selector), so we run it in an effect against a
// unique container id and redraw on data/size change.
import { useEffect, useId, useRef } from 'react'
import 'funnel-graph-js/dist/css/main.min.css'
import 'funnel-graph-js/dist/css/theme.min.css'
import FunnelGraph from 'funnel-graph-js/dist/js/funnel-graph.min.js'

export type FunnelGraphData = {
  labels: string[]
  subLabels: string[]
  colors: string[][]        // one gradient (2 stops) per subLabel
  values: number[][]        // values[stageIndex] = [value per subLabel]
}

export default function FunnelGraphFlow({ data, height = 340 }: { data: FunnelGraphData; height?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const domId = 'fg-' + useId().replace(/[^a-zA-Z0-9]/g, '')

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const render = () => {
      el.innerHTML = ''
      const graph = new FunnelGraph({
        container: '#' + domId,
        direction: 'horizontal',
        gradientDirection: 'horizontal',
        displayPercent: true,
        data,
      })
      graph.draw()
    }
    render()
    const ro = new ResizeObserver(() => render())
    ro.observe(el)
    return () => { ro.disconnect(); el.innerHTML = '' }
  }, [domId, data])

  return <div id={domId} ref={ref} className="fg-ours" style={{ width: '100%', height }} />
}
