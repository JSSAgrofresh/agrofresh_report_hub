/** Lo mínimo de un dataset de línea que se toca al resaltar una franja (evita arrastrar los tipos pesados de Chart.js). */
export interface DatasetFranja {
  label?: string
  borderColor?: string
  borderWidth?: number
  borderDash?: number[]
}

/**
 * Resalta las líneas de límite (mín y máx) del analito sobre el que está el mouse y apaga las de los demás.
 * Los datasets de franja se llaman «<ANALITO> mín» / «<ANALITO> máx» y van después de los `desde` primeros (los puntos).
 * Con `analito` en `null` todo vuelve a su estilo normal.
 */
export function resaltarFranja(datasets: DatasetFranja[], desde: number, analito: string | null, colorDe: (analito: string) => string): void {
  datasets.forEach((d, i) => {
    if (i < desde) return
    const ing = String(d.label ?? '').split(' ')[0]
    const color = colorDe(ing)
    if (!analito) {
      d.borderColor = `${color}99`
      d.borderWidth = 1.4
      d.borderDash = [6, 4]
    } else if (ing === analito) {
      d.borderColor = color
      d.borderWidth = 3.6
      d.borderDash = []
    } else {
      d.borderColor = `${color}2e`
      d.borderWidth = 1
      d.borderDash = [6, 4]
    }
  })
}
