/**
 * Paleta categórica validada (8 tonos, orden fijo que pasa los chequeos de
 * distinción para daltonismo en pares adyacentes — ver skill de dataviz).
 * El color de un analito depende de su posición en este orden fijo, nunca
 * del orden en que el usuario lo seleccionó — así un analito siempre tiene
 * el mismo color, sin importar qué otros estén activos junto a él.
 */
const PALETA_CATEGORICA = [
  '#2a78d6', // azul
  '#eb6834', // naranjo
  '#1baf7a', // aqua
  '#eda100', // amarillo
  '#e87ba4', // magenta
  '#008300', // verde
  '#4a3aa7', // violeta
  '#e34948', // rojo
]

// Orden fijo conocido de antemano: primero el catálogo de residuos
// (cromatografía), después el de Diagnofruit (cuantificación de patógenos).
// Van en la misma lista -y por eso comparten los mismos 8 colores en ciclo-
// porque nunca se comparan entre sí: Diagnofruit no reporta ppm de residuo,
// así que un residuo y un patógeno no aparecen juntos en el mismo gráfico.
// Lo que sí importa es que los 5 patógenos entre ellos salgan distintos, y
// por hash sin esto "ALT", "GEO" y "PEN" caían en el mismo color.
const ORDEN_CONOCIDO = [
  'AZOX', 'DFN', 'DPA', 'FDL', 'IMZ', 'PYR', 'TBZ', 'TEBU',
  'ALT', 'BOT', 'GEO', 'LEV', 'PEN',
]

function hashEstable(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

/** Color estable para un ingrediente: usa la posición fija en el catálogo
 * conocido: cualquier código nuevo cae en un color determinístico por hash. */
export function colorDeIngrediente(codigo: string): string {
  const idx = ORDEN_CONOCIDO.indexOf(codigo)
  if (idx !== -1) return PALETA_CATEGORICA[idx % PALETA_CATEGORICA.length]
  return PALETA_CATEGORICA[hashEstable(codigo) % PALETA_CATEGORICA.length]
}
