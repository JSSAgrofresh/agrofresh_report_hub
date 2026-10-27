/** Generador pseudoaleatorio con semilla (mulberry32): la misma semilla da siempre los mismos datos, así los tests son estables. */
export function crearAzar(semilla: number) {
  let a = semilla >>> 0
  const siguiente = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const elegir = <T>(lista: readonly T[]): T => lista[Math.floor(siguiente() * lista.length)]
  /** Normal estándar (Box-Muller). */
  const normal = () => {
    const u = Math.max(siguiente(), 1e-9)
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * siguiente())
  }
  return { siguiente, elegir, normal }
}
