// funnel-graph-js ships no types; we use the prebuilt UMD bundle + its CSS.
declare module 'funnel-graph-js/dist/js/funnel-graph.min.js' {
  interface FunnelGraphOptions {
    container: string
    data: {
      labels?: string[]
      subLabels?: string[]
      colors?: (string | string[])[]
      values: number[] | number[][]
    }
    direction?: 'horizontal' | 'vertical'
    gradientDirection?: 'horizontal' | 'vertical'
    displayPercent?: boolean
    width?: number
    height?: number
    subLabelValue?: 'percent' | 'raw'
  }
  export default class FunnelGraph {
    constructor(options: FunnelGraphOptions)
    draw(): void
    makeVertical(): void
    makeHorizontal(): void
    updateWidth(w: number): void
    updateHeight(h: number): void
    updateData(data: FunnelGraphOptions['data']): void
  }
}
declare module 'funnel-graph-js/dist/css/main.min.css'
declare module 'funnel-graph-js/dist/css/theme.min.css'
