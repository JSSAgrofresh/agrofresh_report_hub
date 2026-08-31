import type { Solicitud } from './tipos'

/** Deja un folio comparable venga como venga.
 *
 * Un lector USB no manda texto: manda las teclas que habría apretado alguien
 * en un teclado *US*. Con Windows en español, la tecla que allá es `-` acá es
 * `'`, así que un folio impreso "OT-0010" llega escrito "OT'0010". Eso se
 * arregla de verdad configurando el país del lector, pero el sistema no puede
 * depender de que alguien lo haya hecho: comparando sin nada que no sea letra
 * o número, "OT-0010", "OT'0010", "ot 0010" y "OT0010" son el mismo folio.
 */
export function normalizarFolio(texto: string): string {
  return texto.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** El folio de la solicitud tal como se compara. */
function folioDe(solicitud: Solicitud): string {
  return normalizarFolio(solicitud.campos['N° Solicitud'] || '')
}

/** Solicitudes cuyo folio empieza con lo tecleado hasta ahora: lo que se ve
 * mientras el lector escribe, o mientras alguien tipea el número a mano. */
export function filtrarPorFolio(solicitudes: Solicitud[], texto: string): Solicitud[] {
  const clave = normalizarFolio(texto)
  if (!clave) return solicitudes
  return solicitudes.filter((s) => folioDe(s).includes(clave) || normalizarFolio(s.archivo).includes(clave))
}

/** La solicitud que corresponde a un folio COMPLETO, o `null`.
 *
 * Solo acepta la coincidencia exacta, nunca un prefijo: mientras el lector
 * escribe letra por letra, "OT001" calza con varias solicitudes, y resolver
 * ahí elegiría cualquiera. Recién con el folio entero hay una sola respuesta
 * posible, y por eso esto se puede llamar en cada tecla sin equivocarse.
 */
export function buscarPorFolio(solicitudes: Solicitud[], escaneado: string): Solicitud | null {
  const clave = normalizarFolio(escaneado)
  if (!clave) return null
  return (
    solicitudes.find((s) => folioDe(s) === clave) ??
    // Solicitudes viejas, guardadas antes de que el folio fuera un campo
    // propio: ahí el número solo existe en el nombre del archivo.
    solicitudes.find((s) => !folioDe(s) && normalizarFolio(s.archivo).includes(clave)) ??
    null
  )
}
