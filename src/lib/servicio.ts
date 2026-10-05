/**
 * Tipo de servicio: Línea de proceso, Actimist o Ecofog.
 *
 * Ecofog es una copia de Actimist (mismo formulario y reglas, datos aparte).
 * Cada uno tiene su listado de Sold To / Ship To y su lista de distribución.
 * Todo lo que había antes de separarlos es de Línea de proceso, por eso es el
 * valor por defecto. Espejo de `backend/app/servicios.py` (`clave_servicio`):
 * si tocas uno, toca el otro y sus pruebas (`servicio.test.ts` /
 * `test_servicio_actimist.py`).
 */
export type Servicio = 'linea' | 'actimist' | 'ecofog'

export const SERVICIOS: Servicio[] = ['linea', 'actimist', 'ecofog']

/** Los servicios con listado y lista de distribución propios (todos menos Línea de proceso). */
export type ServicioConListado = Exclude<Servicio, 'linea'>
export const SERVICIOS_CON_LISTADO: ServicioConListado[] = ['actimist', 'ecofog']

export function tieneListadoPropio(servicio: Servicio): servicio is ServicioConListado {
  return servicio !== 'linea'
}

export const ETIQUETA_SERVICIO: Record<Servicio, string> = {
  linea: 'Línea de proceso',
  actimist: 'Actimist',
  ecofog: 'Ecofog',
}

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

/** «Actimist», «ACTIMIST » → actimist; «Ecofog» → ecofog. Vacío, «Línea de proceso», «RYD» o
 * cualquier otro valor → Línea de proceso (lo que regía antes). */
export function servicioDeTipoAplicacion(tipo: string | null | undefined): Servicio {
  const n = normalizar(tipo ?? '')
  return n === 'actimist' || n === 'ecofog' ? n : 'linea'
}

/** Valor del parámetro `servicio` que espera el backend (vacío = Línea de proceso). */
export function parametroServicio(servicio: Servicio): string {
  return servicio === 'linea' ? '' : servicio
}
