import type { InformeCorreo } from './api'

/** En qué bloque de trabajo cae un informe pendiente. */
export type Bloque = 'listo' | 'homogeneizar' | 'seguimiento' | 'informado' | 'revisar'

export const CODIGO_NO_HOMOGENEO = 'no_homogeneo'

/**
 * Dónde va un informe pendiente:
 * - `seguimiento` / `informado`: el correo salió a quien no correspondía (hay que avisar, o ya se avisó);
 * - `revisar`: el envío salió incompleto o con algo raro (falta alguien, sin lista…);
 * - `homogeneizar`: el envío está bien pero sus datos no calzan con Listados (se corrigen a mano);
 * - `listo`: todo bien, solo falta aceptarlo.
 */
export function clasificar(i: InformeCorreo): Bloque {
  if (i.estado === 'rojo' && !i.resuelto_en) return i.informado ? 'informado' : 'seguimiento'
  const delEnvio = i.hallazgos.some((h) => h.nivel !== 'info' && h.codigo !== CODIGO_NO_HOMOGENEO)
  if (delEnvio) return 'revisar'
  if (i.hallazgos.some((h) => h.codigo === CODIGO_NO_HOMOGENEO)) return 'homogeneizar'
  return 'listo'
}

export function agrupar(informes: InformeCorreo[]): Record<Bloque, InformeCorreo[]> {
  const g: Record<Bloque, InformeCorreo[]> = { listo: [], homogeneizar: [], seguimiento: [], informado: [], revisar: [] }
  for (const i of informes) g[clasificar(i)].push(i)
  return g
}

/** Los laboratorios por los que se puede filtrar el tablero. */
export const LABORATORIOS = ['AgroFresh', 'Quiteca', 'ALS', 'Diagnofruit'] as const

/** «ALS (Corthon)», «Als» y «ALS» son el mismo laboratorio (misma regla del servidor). */
export function claveLaboratorio(nombre: string | null | undefined): string {
  return (nombre ?? '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').trim().split(' ')[0] ?? ''
}

/** Sin laboratorios elegidos se ve todo. */
export function enLaboratorios<T extends { laboratorio: string | null }>(items: T[], elegidos: string[]): T[] {
  if (elegidos.length === 0) return items
  const claves = new Set(elegidos.map(claveLaboratorio))
  return items.filter((i) => claves.has(claveLaboratorio(i.laboratorio)))
}
