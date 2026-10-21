/** «2,5 d» — días hábiles con un decimal; «—» si no hay dato. */
export function dias(n: number | null | undefined): string {
  if (n == null) return '—'
  return `${n.toLocaleString('es-CL', { maximumFractionDigits: 1 })} d`
}

/** «12 oct» para el eje de semanas (la fecha viene como AAAA-MM-DD, lunes de esa semana). */
export function semanaCorta(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(a, m - 1, d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }).replace('.', '')
}

/** La frase de la tendencia: «La demora sube 0,4 días hábiles por semana». */
export function frasePendiente(pendiente: number | null): string {
  if (pendiente == null) return 'Aún no hay semanas suficientes para ver una tendencia.'
  if (Math.abs(pendiente) < 0.05) return 'La demora se mantiene estable semana a semana.'
  const n = Math.abs(pendiente).toLocaleString('es-CL', { maximumFractionDigits: 1 })
  return `La demora ${pendiente > 0 ? 'sube' : 'baja'} ${n} ${n === '1' ? 'día hábil' : 'días hábiles'} por semana.`
}
