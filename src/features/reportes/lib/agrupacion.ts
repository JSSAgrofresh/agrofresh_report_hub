import { claveFiltro } from './filtros'
import type { Observacion } from './tipos'

/** Lunes (ISO, AAAA-MM-DD) de la semana de una fecha AAAA-MM-DD. */
export function lunesDe(fecha: string): string {
  const d = new Date(`${fecha.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return fecha
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

// Con más fechas distintas que esto, un punto por día es puro ruido: el
// gráfico de promedios pasa a un punto por semana.
export const MAX_PUNTOS_DIARIOS = 60

/** Solicitudes distintas por valor de `campo`, de mayor a menor. Agrupa las
 * variantes que solo difieren en tildes/mayúsculas (como los filtros). */
export function solicitudesPor(
  obs: Observacion[],
  campo: 'crop' | 'cliente' | 'planta' | 'tipoServicio',
) {
  const grupos = new Map<string, { valor: string; solicitudes: Set<number> }>()
  obs.forEach((o) => {
    const v = o[campo]
    if (v == null || String(v).trim() === '') return
    const clave = claveFiltro(v)
    const g = grupos.get(clave) ?? { valor: String(v).trim(), solicitudes: new Set<number>() }
    g.solicitudes.add(o.solicitudId)
    grupos.set(clave, g)
  })
  return [...grupos.values()]
    .map((g) => ({ valor: g.valor, n: g.solicitudes.size }))
    .sort((a, b) => b.n - a.n || a.valor.localeCompare(b.valor, 'es'))
}
