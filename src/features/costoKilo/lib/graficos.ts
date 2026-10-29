import type { DetalleCostoKilo, DiaCostoKilo } from './api'

/** Un color por ingrediente activo, el mismo del PDF; los que no tienen uno fijo reciben uno de la paleta, en orden. */
const FIJOS: Record<string, string> = { FDL: '#C0392B', TEBU: '#E8A317', PYR: '#2F7DA3' }
const RESTO = ['#6A4C93', '#2A9D8F', '#8D6E63', '#D1495B']

export function colorDeActivo(codigo: string, ya: string[] = []): string {
  if (FIJOS[codigo]) return FIJOS[codigo]
  const n = ya.filter((c) => !FIJOS[c]).indexOf(codigo)
  return RESTO[(n < 0 ? 0 : n) % RESTO.length]
}

export const COLOR_KG = '#8c8c8c'
export const COLOR_INICIAL = '#c0392b'

/** «2025-12-05» → «5-dic» (el eje del gráfico). */
export function etiquetaDia(fecha: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha)
  if (!m) return fecha
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${Number(m[3])}-${meses[Number(m[2]) - 1] ?? m[2]}`
}

export interface SerieDia {
  etiquetas: string[]
  /** Kg de fruta proceso que marcaba el contador al cierre de cada día. */
  kg: number[]
  /** Producto de carga inicial (solución madre) de cada día. */
  inicial: number[]
  /** Litros de producto comercial al cierre de cada día, por código. */
  activos: Record<string, number[]>
  parciales: boolean[]
}

export function seriesDeDias(dias: DiaCostoKilo[], codigos: string[]): SerieDia {
  return {
    etiquetas: dias.map((d) => etiquetaDia(d.fecha)),
    kg: dias.map((d) => d.kg_cierre ?? d.kg),
    inicial: dias.map((d) => d.sm_inicial ?? d.sm_total),
    activos: Object.fromEntries(codigos.map((c) => [c, dias.map((d) => (d.activos_cierre ?? d.activos)[c] ?? 0)])),
    parciales: dias.map((d) => d.parcial),
  }
}

/** Códigos que de verdad consumieron producto en el período (uno sin litros no se dibuja ni se lista). */
export function activosConConsumo(d: Pick<DetalleCostoKilo, 'codigos' | 'resumen'>): string[] {
  return d.codigos.filter((c) => (d.resumen.totales.activos[c] ?? 0) > 0)
}

export function nombreDeActivo(codigo: string, nombres: Record<string, string>): string {
  return nombres[codigo] ? `${codigo} (${nombres[codigo]})` : codigo
}

export function fmt(v: number | null | undefined, dec = 1): string {
  if (v == null || Number.isNaN(v)) return '—'
  return v.toLocaleString('es-CL', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}
