import type { FiltrosReporte } from './filtros'
import type { Observacion } from './tipos'

/** Lo que se le pide al backend para armar el Excel de la BD. */
export interface PedidoBd {
  /** Solicitudes a incluir. `null` = TODAS. Ojo: una lista vacía es «ninguna»,
   * nunca «todas»: un filtro sin resultados no puede terminar bajando la base entera. */
  solicitud_ids: number[] | null
  /** Solo estos analitos. `null` = todos los que tengan dato. */
  ingredientes: string[] | null
  /** Filtros en palabras, para la hoja «Filtros aplicados» del Excel. */
  descripcion_filtros: string | null
}

/**
 * Qué pedir según lo que la pantalla tiene filtrado.
 *
 * `acotada` = descargar solo lo filtrado. Sin eso se pide la base completa,
 * aunque haya filtros puestos: es la opción «limpiar filtros y descargar todo».
 * Los filtros los tiene la pantalla (se aplican en el navegador), por eso es
 * ella quien manda al servidor qué solicitudes quedaron a la vista.
 */
export function pedidoBd(
  filtradas: Observacion[],
  filtros: FiltrosReporte,
  acotada: boolean,
  descripcion: string,
): PedidoBd {
  if (!acotada) return { solicitud_ids: null, ingredientes: null, descripcion_filtros: null }
  return {
    solicitud_ids: [...new Set(filtradas.map((o) => o.solicitudId))],
    ingredientes: filtros.ingredientes.length > 0 ? filtros.ingredientes : null,
    descripcion_filtros: descripcion || null,
  }
}

/** «Laboratorio: ALS · Especie: Cereza» a partir de los chips de filtros. */
export function describirFiltros(chips: { etiqueta: string; valor: string }[]): string {
  return chips.map((c) => `${c.etiqueta}: ${c.valor}`).join(' · ')
}
