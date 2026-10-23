import { SEMAFORO_SOBRIO, VERDES_SOBRIO, esPaletaSobria } from '@/lib/paleta'
import { colorDeAnalito, type InformeVista, type ResultadoVista } from './lineaTiempoInformes'

/**
 * Los gráficos de torta de FSMA (ALS) y fitopatología (Diagnofruit): qué parte de los informes está bien y cuál mal.
 *
 *  · Por PRESENCIA: «detectado» es malo y «no detectado» es bueno. Una torta por analito.
 *  · Por NIVEL (solo Diagnofruit, con su tabla de límites): Óptimo, Moderado o Peligroso según cuántos conidios por mL
 *    trae el informe. La tabla es del laboratorio; solo están los cuatro hongos que la traen.
 */

export const COLOR_BIEN = '#6dad3c'
export const COLOR_ATENCION = '#e8c32e'
export const COLOR_MAL = '#b0271f'
export const COLOR_NEUTRO = '#9aa39a'

/** Los colores de lo bueno, lo dudoso y lo malo según el estilo activo. */
function semaforo() {
  return esPaletaSobria()
    ? SEMAFORO_SOBRIO
    : { bien: COLOR_BIEN, atencion: COLOR_ATENCION, mal: COLOR_MAL, neutro: COLOR_NEUTRO }
}

export type ClaveTajada = 'bien' | 'atencion' | 'mal' | 'neutro'

export interface Tajada {
  clave: ClaveTajada
  texto: string
  cantidad: number
  color: string
}

export interface DonaAnalito {
  /** Código del analito (el primero que se vio con ese nombre). */
  codigo: string
  nombre: string
  unidad: string
  orden: number
  /** Cuántos informes midieron el analito. */
  total: number
  tajadas: Tajada[]
  /** Parte (0 a 100) que está en buen estado; `null` si no hay informes. */
  porcentajeBien: number | null
}

export const TEXTO_BIEN_PRESENCIA = 'No detectado'
export const TEXTO_MAL_PRESENCIA = 'Detectado'

/** Mezcla un color `#rrggbb` con negro: `factor` 0 = el mismo, 1 = negro. */
export function oscurecer(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16)
  const canal = (desplazamiento: number) => Math.round(((n >> desplazamiento) & 255) * (1 - factor))
  return `#${[16, 8, 0].map((d) => canal(d).toString(16).padStart(2, '0')).join('')}`
}

/** Los colores de las tajadas cuando la torta toma el color de SU analito (fitopatología): lo bueno es el color del analito y lo peor, ese color oscurecido. */
function coloresDelAnalito(orden: number) {
  const base = colorDeAnalito(orden).fill
  return { bien: base, atencion: oscurecer(base, 0.3), mal: oscurecer(base, 0.62) }
}

export interface OpcionesTorta {
  /** Cada torta usa el color de su analito en vez de verde / amarillo / rojo. */
  colorDelAnalito?: boolean
}

const porcentaje = (parte: number, total: number): number | null => (total > 0 ? Math.round((parte / total) * 100) : null)

/** Agrupa los resultados por analito (por nombre: «Escherichia coli» de agua y de alimento es el mismo analito). */
function agrupar(informes: InformeVista[]): Map<string, ResultadoVista[]> {
  const grupos = new Map<string, ResultadoVista[]>()
  informes.forEach((i) =>
    i.resultados.forEach((r) => {
      const lista = grupos.get(r.nombre) ?? []
      lista.push(r)
      grupos.set(r.nombre, lista)
    }),
  )
  return grupos
}

/** Una torta por analito: cuántos informes lo detectaron (malo) y cuántos no (bueno). */
export function presenciaPorAnalito(informes: InformeVista[], opciones: OpcionesTorta = {}): DonaAnalito[] {
  return [...agrupar(informes).entries()]
    .map(([nombre, rs]): DonaAnalito => {
      const detectados = rs.filter((r) => r.detectado).length
      const limpios = rs.length - detectados
      const orden = Math.min(...rs.map((r) => r.orden))
      const c = esPaletaSobria() ? VERDES_SOBRIO : opciones.colorDelAnalito ? coloresDelAnalito(orden) : semaforo()
      return {
        codigo: rs[0].codigo,
        nombre,
        unidad: rs[0].unidad,
        orden,
        total: rs.length,
        tajadas: [
          { clave: 'bien', texto: TEXTO_BIEN_PRESENCIA, cantidad: limpios, color: c.bien },
          { clave: 'mal', texto: TEXTO_MAL_PRESENCIA, cantidad: detectados, color: c.mal },
        ],
        porcentajeBien: porcentaje(limpios, rs.length),
      }
    })
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'))
}

/** Los límites de nivel de contaminación del laboratorio (con/mL): óptimo bajo `optimoHasta`, moderado hasta `moderadoHasta` (incluido), peligroso sobre eso. */
export interface LimitesNivel {
  optimoMenorQue: number
  moderadoHasta: number
}

/** Tabla de límites de Diagnofruit por código de la ingesta. Es del laboratorio: no se inventan ni se completan los hongos que no trae. */
export const LIMITES_NIVEL: Record<string, LimitesNivel & { nombre: string }> = {
  BOT: { nombre: 'Botrytis', optimoMenorQue: 20, moderadoHasta: 200 },
  ALT: { nombre: 'Alternaria', optimoMenorQue: 50, moderadoHasta: 300 },
  GEO: { nombre: 'Geotrichum', optimoMenorQue: 10, moderadoHasta: 50 },
  PEN: { nombre: 'Penicillium', optimoMenorQue: 50, moderadoHasta: 300 },
}

export type Nivel = 'optimo' | 'moderado' | 'peligroso' | 'incierto'

export const TEXTO_NIVEL: Record<Nivel, string> = {
  optimo: 'Óptimo',
  moderado: 'Moderado',
  peligroso: 'Peligroso',
  incierto: 'No concluyente',
}

/**
 * El nivel de un resultado, o `null` si ese analito no tiene tabla de límites.
 * Sin detección es óptimo. «>100» (el laboratorio solo dio un piso) es «no concluyente» salvo que ese piso ya
 * alcance la zona peligrosa; no se adivina cuánto era.
 */
export function nivelDe(r: ResultadoVista): Nivel | null {
  const lim = LIMITES_NIVEL[r.codigo.trim().toUpperCase()]
  if (!lim) return null
  if (!r.detectado) return 'optimo'
  if (r.valor === null) return 'incierto'
  const esPiso = r.texto.trim().startsWith('>')
  if (r.valor > lim.moderadoHasta) return 'peligroso'
  if (esPiso) return 'incierto'
  if (r.valor < lim.optimoMenorQue) return 'optimo'
  return 'moderado'
}

/** Una torta por hongo con tabla de límites: cuántos informes caen en Óptimo, Moderado y Peligroso. */
export function nivelesPorAnalito(informes: InformeVista[], opciones: OpcionesTorta = {}): DonaAnalito[] {
  return [...agrupar(informes).entries()]
    .filter(([, rs]) => LIMITES_NIVEL[rs[0].codigo.trim().toUpperCase()])
    .map(([nombre, rs]): DonaAnalito => {
      const niveles = rs.map((r) => nivelDe(r) as Nivel)
      const cuenta = (n: Nivel) => niveles.filter((x) => x === n).length
      const orden = Math.min(...rs.map((r) => r.orden))
      const c = !esPaletaSobria() && opciones.colorDelAnalito ? coloresDelAnalito(orden) : semaforo()
      const tajadas: Tajada[] = [
        { clave: 'bien', texto: TEXTO_NIVEL.optimo, cantidad: cuenta('optimo'), color: c.bien },
        { clave: 'atencion', texto: TEXTO_NIVEL.moderado, cantidad: cuenta('moderado'), color: c.atencion },
        { clave: 'mal', texto: TEXTO_NIVEL.peligroso, cantidad: cuenta('peligroso'), color: c.mal },
      ]
      if (cuenta('incierto') > 0) tajadas.push({ clave: 'neutro', texto: TEXTO_NIVEL.incierto, cantidad: cuenta('incierto'), color: semaforo().neutro })
      return {
        codigo: rs[0].codigo,
        nombre,
        unidad: rs[0].unidad,
        orden,
        total: rs.length,
        tajadas,
        porcentajeBien: porcentaje(cuenta('optimo'), rs.length),
      }
    })
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'))
}

/** Filtros propios de un bloque de FSMA o fitopatología. */
export type EstadoFiltro = 'todos' | 'detectado' | 'no_detectado'

export interface FiltroBloque {
  /** Códigos de analito elegidos; vacío = todos. */
  analitos: string[]
  estado: EstadoFiltro
}

export const FILTRO_BLOQUE_VACIO: FiltroBloque = { analitos: [], estado: 'todos' }

/** Deja en cada informe solo los resultados que cumplen el filtro del bloque; el informe que se queda sin ninguno sale. */
export function filtrarBloque(informes: InformeVista[], f: FiltroBloque): InformeVista[] {
  if (f.analitos.length === 0 && f.estado === 'todos') return informes
  return informes
    .map((i) => ({
      ...i,
      resultados: i.resultados.filter(
        (r) =>
          (f.analitos.length === 0 || f.analitos.includes(r.codigo)) &&
          (f.estado === 'todos' || (f.estado === 'detectado' ? r.detectado : !r.detectado)),
      ),
    }))
    .filter((i) => i.resultados.length > 0)
}

/** Los analitos que trae un conjunto de informes (código, nombre y orden), en el orden fijo del laboratorio. */
export function analitosDeInformes(informes: InformeVista[]): [string, { nombre: string; orden: number }][] {
  const porCodigo = new Map<string, { nombre: string; orden: number }>()
  informes.forEach((i) => i.resultados.forEach((r) => porCodigo.has(r.codigo) || porCodigo.set(r.codigo, { nombre: r.nombre, orden: r.orden })))
  return [...porCodigo.entries()].sort((a, b) => a[1].orden - b[1].orden || a[1].nombre.localeCompare(b[1].nombre, 'es'))
}

export function filtrosActivosBloque(f: FiltroBloque): boolean {
  return f.analitos.length > 0 || f.estado !== 'todos'
}
