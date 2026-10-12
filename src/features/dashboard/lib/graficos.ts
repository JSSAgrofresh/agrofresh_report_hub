import type { ActividadDashboard, PuntoNombre } from '../types'

/** Orden fijo de los colores de series (validado para daltonismo): nunca se cicla ni se repinta por ranking. */
export const COLORES_SERIE = ['#1C7FA6', '#D9822B', '#7B5EA7', '#3A8A52']
export const COLOR_OTROS = '#9AA3A0'

export interface Parte {
  nombre: string
  n: number
  color: string
}

/** Las `max` primeras con su color fijo y el resto junto en «Otras» (gris): nunca se inventa un color más. */
export function agruparTop(items: PuntoNombre[], max = COLORES_SERIE.length): Parte[] {
  const orden = [...items].filter((i) => i.n > 0).sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre))
  const top = orden.slice(0, max).map((i, k) => ({ ...i, color: COLORES_SERIE[k] }))
  const resto = orden.slice(max).reduce((s, i) => s + i.n, 0)
  return resto > 0 ? [...top, { nombre: 'Otras', n: resto, color: COLOR_OTROS }] : top
}

/** Un máximo «redondo» para el eje (4, 5, 10, 20, 50…), nunca menor a 4 para que la grilla no quede apretada. */
export function maximoEje(max: number): number {
  if (max <= 4) return 4
  if (max <= 40) return Math.ceil(max / 4) * 4
  const pot = 10 ** Math.floor(Math.log10(max))
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * pot >= max) return m * pot
  }
  return 10 * pot
}

/** Índice del punto más cercano a una posición x del gráfico. */
export function indiceMasCercano(x: number, izq: number, ancho: number, total: number): number {
  if (total <= 1 || ancho <= 0) return 0
  const t = (x - izq) / ancho
  return Math.min(total - 1, Math.max(0, Math.round(t * (total - 1))))
}

export function saludo(hora: number): string {
  if (hora < 6) return 'Buenas noches'
  if (hora < 13) return 'Buenos días'
  if (hora < 20) return 'Buenas tardes'
  return 'Buenas noches'
}

export type EstadoVerificacion = 'ok' | 'mal' | 'sin'

export function estadoVerificacion(resultado: string): EstadoVerificacion {
  if (resultado === 'Aceptable') return 'ok'
  if (resultado === 'No aceptable') return 'mal'
  return 'sin'
}

/** Una celda por cada uno de los últimos `dias` días (hoy al final), con su estado si ese día se verificó. */
export function celdasVerificacion(
  registros: { fecha: string; resultado: string }[],
  hoy: Date,
  dias = 30,
): { fecha: string; estado: EstadoVerificacion | 'falta' }[] {
  const porFecha = new Map(registros.map((r) => [r.fecha, estadoVerificacion(r.resultado)]))
  return Array.from({ length: dias }, (_, i) => {
    const d = new Date(hoy)
    d.setDate(d.getDate() - (dias - 1 - i))
    const fecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { fecha, estado: porFecha.get(fecha) ?? 'falta' }
  })
}

const fmtDia = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${d}-${m}`
}

export interface Slide {
  clave: string
  tono: 'verde' | 'azul' | 'violeta' | 'naranja'
  tag: string
  numero: string
  titulo: string
  lineas: string[]
}

export function armarSlides(a: ActividadDashboard | null): Slide[] {
  if (!a) return []
  const sol = a.solicitudes_recientes
  const ver = a.verificaciones_recientes
  const hoy = ver.find((v) => v.fecha === new Date().toLocaleDateString('en-CA'))
  return [
    {
      clave: 'solicitudes', tono: 'verde', tag: 'Solicitudes',
      numero: String(a.metricas.esta_semana), titulo: 'ingresadas en los últimos 7 días',
      lineas: sol.slice(0, 3).map((s) => `${s.especie} · ${s.cliente} — ${s.planta}`),
    },
    {
      clave: 'converter', tono: 'violeta', tag: 'Converter',
      numero: String(a.metricas.pendientes_converter), titulo: a.metricas.pendientes_converter === 1 ? 'fila esperando revisión' : 'filas esperando revisión',
      lineas: a.converter_recientes.slice(0, 3).map((c) => `${c.origen} · ${c.n_motivos} avisos`),
    },
    {
      clave: 'verificacion', tono: 'azul', tag: 'AgroFresh Lab',
      numero: a.metricas.verificacion_hoy ? '✓' : '—', titulo: a.metricas.verificacion_hoy ? 'verificación de hoy registrada' : 'verificación de hoy sin registrar',
      lineas: (hoy ? [hoy, ...ver.filter((v) => v !== hoy)] : ver).slice(0, 3).map((v) => `${fmtDia(v.fecha ?? '')} · ${v.resultado || 'Sin datos'}`),
    },
    {
      clave: 'trace', tono: 'naranja', tag: 'Post Venta',
      numero: String(a.trace_recientes.length), titulo: 'lecturas pH/ORP recientes',
      lineas: a.trace_recientes.slice(0, 3).map((t) => `${t.cliente}${t.equipo !== '—' ? ` · ${t.equipo}` : ''}`),
    },
  ]
}
