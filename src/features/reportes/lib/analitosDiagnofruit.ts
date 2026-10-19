import type { AnalitoAls } from './analitosAls'

/**
 * Nombre, unidad y orden de los patógenos de Diagnofruit en la tabla y los gráficos de Report. Es una tabla fija (los
 * mismos de `ANALITOS_DEFECTO` de Toma de muestras) para que no dependa de que el catálogo esté sembrado: sin sembrar
 * salían los códigos «LEV», «BOT»… Las claves son los códigos de la ingesta.
 */
export type AnalitoDiagnofruit = AnalitoAls

const POR_CODIGO: Record<string, AnalitoDiagnofruit> = {
  LEV: { nombre: 'Levaduras', unidad: 'UFC/mL', orden: 1 },
  BOT: { nombre: 'Botrytis', unidad: 'conidia/mL', orden: 2 },
  ALT: { nombre: 'Alternaria', unidad: 'conidia/mL', orden: 3 },
  GEO: { nombre: 'Geotrichum', unidad: 'esporas/mL', orden: 4 },
  PEN: { nombre: 'Penicillium', unidad: 'conidia/mL', orden: 5 },
}

/** Nombre, unidad y orden de un patógeno de Diagnofruit por su código; `null` si trae uno que esta tabla no conoce. */
export function analitoDiagnofruit(codigo: string | null | undefined): AnalitoDiagnofruit | null {
  return POR_CODIGO[(codigo ?? '').trim().toUpperCase()] ?? null
}
