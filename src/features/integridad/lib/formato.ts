import type { Gravedad, ResumenLaboratorio } from './api'

export const NOMBRE_GRAVEDAD: Record<Gravedad, string> = { alto: 'Grave', medio: 'A revisar', info: 'Informativo' }

/** % de informes revisados que tienen al menos un error (0 si no se revisó ninguno). */
export function porcentajeConErrores(l: Pick<ResumenLaboratorio, 'informes_revisados' | 'informes_con_problema'>): number {
  return l.informes_revisados > 0 ? Math.round((l.informes_con_problema / l.informes_revisados) * 100) : 0
}

/** Los laboratorios con más errores graves primero; a igualdad, el de más informes con problema. */
export function ordenarLaboratorios(ls: ResumenLaboratorio[]): ResumenLaboratorio[] {
  return [...ls].sort((a, b) => b.altos - a.altos || b.informes_con_problema - a.informes_con_problema || a.laboratorio.localeCompare(b.laboratorio))
}

/** Un análisis «en curso» que lleva más de este tiempo se muestra como colgado (el servidor también lo cierra a los 45 min). */
export const MINUTOS_COLGADO = 45
