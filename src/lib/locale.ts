/**
 * Formato local de AgroFresh Chile: fechas DD-MM-AAAA y decimales con coma.
 * Centraliza lo que en Trace.html y Converter.html es la función `aNumero()`
 * duplicada en cada uno — un punto decimal mal interpretado corrompe
 * mediciones de laboratorio, así que esta lógica vive en un solo lugar.
 */

export function formatDateCL(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  const d = String(date.getUTCDate()).padStart(2, '0')
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const y = date.getUTCFullYear()
  return `${d}-${m}-${y}`
}

export function formatDateTimeCL(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  const hh = String(date.getUTCHours()).padStart(2, '0')
  const mm = String(date.getUTCMinutes()).padStart(2, '0')
  return `${formatDateCL(date)} ${hh}:${mm}`
}

/** Convierte texto con coma o punto decimal a number. "6,42" y "6.42" -> 6.42 */
export function parseDecimalCL(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isNaN(value) ? null : value

  let s = value.trim().replace(/\s|\u00a0/g, '')
  if (!s) return null

  if (s.includes(',') && s.includes('.')) {
    // el último separador es el decimal; el otro es de miles
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if ((s.match(/,/g) || []).length === 1) {
    s = s.replace(',', '.')
  } else if ((s.match(/,/g) || []).length > 1) {
    s = s.replace(/,/g, '')
  }

  const n = parseFloat(s)
  return Number.isNaN(n) ? null : n
}

/** Formatea un number como texto con coma decimal: 6.42 -> "6,42" */
export function formatDecimalCL(value: number | null | undefined, decimales = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return value.toFixed(decimales).replace('.', ',')
}
