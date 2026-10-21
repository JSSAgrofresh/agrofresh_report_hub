import { Chart } from 'chart.js'

/**
 * Gráficos nítidos en TODO el sistema. Chart.js dibuja su lienzo al tamaño real de la pantalla; con el zoom de
 * Windows en 125 % o 150 % (o un navegador con zoom) ese tamaño no es entero y el gráfico se ve borroso. Se dibuja
 * siempre al menos al doble de resolución y el navegador lo reduce, que se ve limpio a cualquier zoom.
 */
export const RESOLUCION_MINIMA = 2

export function resolucionDeGraficos(dpr: number | undefined): number {
  return Math.max(RESOLUCION_MINIMA, Math.ceil(dpr || 1))
}

Chart.defaults.devicePixelRatio = resolucionDeGraficos(typeof window === 'undefined' ? 1 : window.devicePixelRatio)
