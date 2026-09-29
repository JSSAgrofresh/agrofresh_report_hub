/**
 * Fecha, hora y búsqueda de la bandeja de notificaciones.
 *
 * La normalización es la MISMA que usa el backend (`normalizar_busqueda` en
 * `app/notificaciones.py`): minúsculas y sin tildes, letra por letra. Por eso
 * lo que el servidor encontró es lo mismo que acá se resalta.
 */

const CON_TILDE = 'áéíóúüñÁÉÍÓÚÜÑàèìòùÀÈÌÒÙ'
const SIN_TILDE = 'aeiouunAEIOUUNaeiouAEIOU'

/** Minúsculas y sin tildes. Conserva el largo: cada letra se cambia por una. */
export function normalizar(texto: string): string {
  let salida = ''
  for (const letra of texto) {
    const i = CON_TILDE.indexOf(letra)
    salida += i >= 0 ? SIN_TILDE[i] : letra
  }
  return salida.toLowerCase()
}

/** Las palabras de una búsqueda, normalizadas (máximo 8, como el backend). */
export function palabrasDe(busqueda: string): string[] {
  return normalizar(busqueda).split(/\s+/).filter(Boolean).slice(0, 8)
}

export interface Tramo {
  texto: string
  coincide: boolean
}

/** Parte un texto en tramos, marcando los que coinciden con alguna palabra. */
export function resaltar(texto: string, palabras: string[]): Tramo[] {
  const base = normalizar(texto)
  // Si normalizar cambió el largo (letras raras), no se resalta: mejor nada
  // que resaltar el tramo equivocado.
  if (!palabras.length || base.length !== texto.length) return [{ texto, coincide: false }]
  const marcado = new Array<boolean>(texto.length).fill(false)
  for (const palabra of palabras) {
    let desde = base.indexOf(palabra)
    while (desde >= 0) {
      marcado.fill(true, desde, desde + palabra.length)
      desde = base.indexOf(palabra, desde + palabra.length)
    }
  }
  const tramos: Tramo[] = []
  for (let i = 0; i < texto.length; i++) {
    const ultimo = tramos[tramos.length - 1]
    if (ultimo && ultimo.coincide === marcado[i]) ultimo.texto += texto[i]
    else tramos.push({ texto: texto[i], coincide: marcado[i] })
  }
  return tramos
}

function mismoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function hora(d: Date, conSegundos = false): string {
  return d.toLocaleTimeString('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
    ...(conSegundos ? { second: '2-digit' } : {}),
    hour12: false,
  })
}

/** Para la lista: «Hoy, 14:32», «Ayer, 09:05» o «24 sept 2026, 14:32». */
export function fechaHoraCorta(iso: string | null, ahora: Date = new Date()): string {
  if (!iso) return ''
  const d = new Date(iso)
  const ayer = new Date(ahora)
  ayer.setDate(ahora.getDate() - 1)
  if (mismoDia(d, ahora)) return `Hoy, ${hora(d)}`
  if (mismoDia(d, ayer)) return `Ayer, ${hora(d)}`
  const fecha = d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
  return `${fecha}, ${hora(d)}`
}

/** Para el detalle: «miércoles 24 de septiembre de 2026, 14:32:05». */
export function fechaHoraLarga(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const fecha = d.toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  return `${fecha}, ${hora(d, true)}`
}
