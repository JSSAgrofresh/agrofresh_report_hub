import type { Solicitud } from './tipos'

/** Deja un folio comparable venga como venga: el lector de códigos de barras
 * puede entregarlo en minúsculas, con espacios de más o con guiones que el
 * operador no tipearía. Se compara sin nada de eso, así "ot-0012", "OT 0012" y
 * "OT0012" son el mismo folio. */
function normalizar(texto: string): string {
  return texto.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** Busca la solicitud cuyo N° coincide con lo escaneado. Primero exacto —el
 * caso normal, porque el código de barras lleva el folio tal cual va impreso—
 * y recién después el normalizado, para que un lector con sufijos raros o un
 * folio tipeado a mano igual encuentren la solicitud. */
export function buscarPorFolio(solicitudes: Solicitud[], escaneado: string): Solicitud | null {
  const crudo = escaneado.trim()
  if (!crudo) return null
  const exacta = solicitudes.find((s) => (s.campos['N° Solicitud'] || '').trim() === crudo)
  if (exacta) return exacta
  const clave = normalizar(crudo)
  if (!clave) return null
  return (
    solicitudes.find((s) => normalizar(s.campos['N° Solicitud'] || '') === clave) ??
    // Último recurso: el nombre del archivo en Storage, para solicitudes
    // viejas guardadas antes de que el folio fuera un campo propio.
    solicitudes.find((s) => normalizar(s.archivo).includes(clave)) ??
    null
  )
}
