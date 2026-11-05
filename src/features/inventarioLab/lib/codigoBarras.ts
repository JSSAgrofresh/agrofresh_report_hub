/** Código de barras Code 128 (juego B: letras, números y signos) para dibujar la etiqueta de un producto.
 * Devuelve el ancho de cada barra y cada espacio, alternados y empezando por barra, en módulos. */
const PATRONES = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212',
  '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131',
  '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321',
  '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', '111242', '121142', '121241', '114212',
  '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232',
]
const FIN = '2331112'
const START_B = 104

/** Los caracteres que el juego B no puede dibujar se reemplazan por «?». */
export const limpiarTexto = (t: string): string => [...t].map((c) => (c >= ' ' && c <= '~' ? c : '?')).join('')

export function codigos128(texto: string): number[] {
  const t = limpiarTexto(texto)
  const valores = [START_B, ...[...t].map((c) => c.charCodeAt(0) - 32)]
  const suma = valores.reduce((s, v, i) => s + v * (i === 0 ? 1 : i), 0)
  return [...valores, suma % 103]
}

export function anchos128(texto: string): number[] {
  const partes = codigos128(texto).map((v) => PATRONES[v])
  return [...partes, FIN].join('').split('').map(Number)
}

/** El dibujo listo para un `<svg viewBox>`: rectángulos negros y el ancho total en módulos (con margen blanco a cada lado). */
export function barras128(texto: string, margen = 10): { rects: { x: number; w: number }[]; ancho: number } {
  const rects: { x: number; w: number }[] = []
  let x = margen
  anchos128(texto).forEach((w, i) => {
    if (i % 2 === 0) rects.push({ x, w })
    x += w
  })
  return { rects, ancho: x + margen }
}
