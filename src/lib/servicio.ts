/**
 * Tipo de servicio: Línea de proceso o Actimist.
 *
 * Cada uno tiene su listado de Sold To / Ship To y su lista de distribución.
 * Todo lo que había antes de separarlos es de Línea de proceso, por eso es el
 * valor por defecto. Espejo de `backend/app/servicios.py` (`clave_servicio`):
 * si tocas uno, toca el otro y sus pruebas (`servicio.test.ts` /
 * `test_servicio_actimist.py`).
 */
export type Servicio = 'linea' | 'actimist'

export const SERVICIOS: Servicio[] = ['linea', 'actimist']

export const ETIQUETA_SERVICIO: Record<Servicio, string> = {
  linea: 'Línea de proceso',
  actimist: 'Actimist',
}

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

/** «Actimist», «ACTIMIST » → actimist. Vacío, «Línea de proceso», «RYD» o
 * cualquier otro valor → Línea de proceso (lo que regía antes). */
export function servicioDeTipoAplicacion(tipo: string | null | undefined): Servicio {
  return normalizar(tipo ?? '') === 'actimist' ? 'actimist' : 'linea'
}

/** Valor del parámetro `servicio` que espera el backend (vacío = Línea de proceso). */
export function parametroServicio(servicio: Servicio): string {
  return servicio === 'actimist' ? 'actimist' : ''
}
