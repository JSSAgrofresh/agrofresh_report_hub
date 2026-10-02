/** Posiciones de muestreo por especie y tipo de muestra, tal cual las define
 *  el laboratorio. Las especies sin lista siguen con texto libre. */

type Tipo = 'Agua' | 'Fruta'

const POSICIONES: Record<string, Array<[Tipo, string]>> = {
  cereza: [
    ['Agua', 'Hidrocooler'],
    ['Agua', 'Pozo vaciado'],
    ['Agua', 'Cortapedicelo'],
    ['Agua', 'Pozo Fungicida'],
    ['Fruta', 'Producto terminado'],
  ],
  carozo: [
    ['Agua', 'Hidrocooler'],
    ['Fruta', 'Producto terminado'],
  ],
  manzana: [
    ['Agua', 'Pozo vaciado'],
    ['Fruta', 'Producto terminado'],
  ],
  pera: [
    ['Agua', 'Producto terminado'],
    ['Fruta', 'Producto terminado'],
  ],
  citrico: [
    ['Agua', 'Vaciado'],
    ['Fruta', 'Pozo Heat'],
    ['Fruta', 'Producto terminado'],
  ],
  palta: [['Fruta', 'Producto terminado']],
  arandano: [['Fruta', 'Producto terminado']],
  kiwi: [
    ['Fruta', 'Pozo inmersión'],
    ['Fruta', 'Producto terminado'],
  ],
}

/** «Cerezas», «CEREZA» y «Cítricos» → clave singular sin tildes. */
function clave(especie: string): string {
  const base = especie
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
  return base.endsWith('s') ? base.slice(0, -1) : base
}

/** Posiciones válidas para la especie (y el tipo de muestra, si ya se eligió).
 *  `null` = esa especie no tiene lista: el campo queda de texto libre. */
export function posicionesDeMuestreo(
  especie: string | null | undefined,
  tipoMuestra?: string | null,
): string[] | null {
  const lista = POSICIONES[clave(especie ?? '')]
  if (!lista) return null
  const filtradas = lista.filter(([t]) => !tipoMuestra || t === tipoMuestra).map(([, p]) => p)
  return [...new Set(filtradas.length > 0 ? filtradas : lista.map(([, p]) => p))]
}
