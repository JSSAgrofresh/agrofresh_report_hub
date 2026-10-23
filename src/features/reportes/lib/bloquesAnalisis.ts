import { laboratorioBase } from './filtros'
import { laboratorioTabular, type LaboratorioTabular } from './laboratorios'

/**
 * Report muestra los resultados en bloques, uno por TIPO DE ANÁLISIS, siempre en este orden:
 *   1. Análisis de residuos   → Laboratorio AgroFresh y Laboratorio Quiteca
 *   2. Análisis FSMA          → Laboratorio ALS Global
 *   3. Análisis de fitopatología → Laboratorio Diagnofruit
 * Sin elegir laboratorio se ven los tres hacia abajo; eligiendo uno, solo el bloque de ese laboratorio.
 */

export type ClaveBloque = 'residuales' | 'fsma' | 'fito'

/** Ancla de cada bloque en la página: a ella saltan las tarjetas de análisis de arriba. */
export const ID_BLOQUE: Record<ClaveBloque, string> = {
  residuales: 'analisis-residuales',
  fsma: 'analisis-fsma',
  fito: 'analisis-fito',
}

export const NOMBRE_BLOQUE: Record<ClaveBloque, string> = {
  residuales: 'Análisis de residuos',
  fsma: 'Análisis FSMA',
  fito: 'Análisis de fitopatología',
}

/** Los laboratorios de residuos, en el orden en que se ofrecen como botones. */
export const LABS_RESIDUALES = ['agrofresh', 'quiteca'] as const
export type LabResidual = (typeof LABS_RESIDUALES)[number]

/** El nombre completo con que se llama a cada laboratorio en todo el sistema. */
const NOMBRE_LAB: Record<string, string> = {
  agrofresh: 'Laboratorio AgroFresh',
  quiteca: 'Laboratorio Quiteca',
  als: 'Laboratorio ALS Global',
  diagnofruit: 'Laboratorio Diagnofruit',
}

/**
 * «Laboratorio AgroFresh», «Laboratorio ALS Global»…: el nombre completo de un laboratorio a partir de como llegue
 * escrito («Agrofresh», «ALS (Corthon)», «Als»). Un laboratorio que no conoce queda como está. Solo cambia lo que se ve:
 * el valor guardado en la base no se toca.
 */
export function nombreLaboratorio(laboratorio: string | null | undefined): string {
  const crudo = String(laboratorio ?? '').trim()
  return NOMBRE_LAB[laboratorioBase(crudo)] ?? crudo
}

/** A qué bloque pertenece un laboratorio; los que no conoce se tratan como residuos (es el caso general). */
export function bloqueDeLaboratorio(laboratorio: string | null | undefined): ClaveBloque {
  const t = laboratorioTabular(laboratorio)
  return t === 'als' ? 'fsma' : t === 'diagnofruit' ? 'fito' : 'residuales'
}

export type BloquesVisibles = Record<ClaveBloque, boolean>

/** Qué bloques se ven según el laboratorio elegido en el filtro (vacío = todos). */
export function bloquesVisibles(laboratorioElegido: string | null | undefined): BloquesVisibles {
  if (!String(laboratorioElegido ?? '').trim()) return { residuales: true, fsma: true, fito: true }
  const b = bloqueDeLaboratorio(laboratorioElegido)
  return { residuales: b === 'residuales', fsma: b === 'fsma', fito: b === 'fito' }
}

/** `'agrofresh'` / `'quiteca'` si el laboratorio es uno de residuos con nombre conocido; `''` si no. */
export function labResidual(laboratorio: string | null | undefined): LabResidual | '' {
  const base = laboratorioBase(laboratorio)
  return (LABS_RESIDUALES as readonly string[]).includes(base) ? (base as LabResidual) : ''
}

/**
 * Lo que dicen los botones de laboratorio del bloque de residuos. Si el filtro de arriba ya eligió un laboratorio de
 * residuos, ese manda y el otro botón queda en gris; si no, manda lo que se tocó en el propio bloque (`''` = los dos).
 */
export function estadoBotonesResidual(laboratorioFiltro: string, botonElegido: LabResidual | ''): {
  efectivo: LabResidual | ''
  /** El filtro de arriba fijó el laboratorio: tocar el otro botón lo quita. */
  fijadoPorFiltro: boolean
} {
  const delFiltro = labResidual(laboratorioFiltro)
  return delFiltro ? { efectivo: delFiltro, fijadoPorFiltro: true } : { efectivo: botonElegido, fijadoPorFiltro: false }
}

/**
 * Qué pasa al tocar un botón de laboratorio:
 *  - con el laboratorio fijado por el filtro de arriba: tocar el otro lo quita (se ven todos los análisis de nuevo) y deja
 *    elegido el botón tocado; tocar el mismo también lo quita;
 *  - si no, tocar el elegido lo suelta y tocar otro lo elige.
 */
export function alTocarBoton(
  tocado: LabResidual,
  laboratorioFiltro: string,
  botonElegido: LabResidual | '',
): { botonElegido: LabResidual | ''; quitarFiltroLaboratorio: boolean } {
  const { efectivo, fijadoPorFiltro } = estadoBotonesResidual(laboratorioFiltro, botonElegido)
  if (fijadoPorFiltro) return { botonElegido: tocado === efectivo ? '' : tocado, quitarFiltroLaboratorio: true }
  return { botonElegido: tocado === efectivo ? '' : tocado, quitarFiltroLaboratorio: false }
}

export type { LaboratorioTabular }
