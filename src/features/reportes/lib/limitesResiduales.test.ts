import { describe, expect, it } from 'vitest'
import type { InformeConPuntos } from './graficoResiduales'
import type { Observacion } from './tipos'
import { desvioResidual, limitesDeEspecie, posicionResidual, resumenResidual } from './limitesResiduales'

const punto = (ingrediente: string, ppm: number | null): Observacion => ({ ingrediente, ppm }) as Observacion
const informe = (id: number, ...puntos: Observacion[]): InformeConPuntos => ({ solicitudId: id, nroSolicitud: `OT-${id}`, fecha: '2026-10-01', puntos })

describe('limites residuales estáticos', () => {
  it('encuentra la especie sin importar tildes, mayúsculas ni plural', () => {
    expect(limitesDeEspecie('Cerezas')?.FDL).toEqual({ min: 0.7, max: 5 })
    expect(limitesDeEspecie('cereza')?.FDL.max).toBe(5)
    expect(limitesDeEspecie('LIMÓN')?.IMZ).toEqual({ min: 1, max: 5 })
    expect(limitesDeEspecie('Nectarin')?.TEBU).toEqual({ min: 0.5, max: 0.6 })
  })
  it('sin especie, o una que no está en la tabla, no hay límites', () => {
    expect(limitesDeEspecie('')).toBeNull()
    expect(limitesDeEspecie(null)).toBeNull()
    expect(limitesDeEspecie('Papaya')).toBeNull()
  })
  it('los NA de la tabla no tienen franja', () => {
    expect(limitesDeEspecie('Manzana')?.IMZ).toBeUndefined()
    expect(limitesDeEspecie('Kiwi')?.PYR).toBeUndefined()
  })
  it('posición y desvío contra la franja (los bordes cuentan como dentro)', () => {
    const l = limitesDeEspecie('Clementina')!
    expect(posicionResidual('FDL', 3, l)).toBe('dentro')
    expect(posicionResidual('FDL', 3.4, l)).toBe('sobre')
    expect(posicionResidual('FDL', 0.5, l)).toBe('bajo')
    expect(posicionResidual('TEBU', 9, l)).toBeNull()
    expect(desvioResidual('FDL', 3.4, l)).toBeCloseTo(0.4)
    expect(desvioResidual('FDL', 0.5, l)).toBeCloseTo(-0.2)
    expect(desvioResidual('FDL', 1, l)).toBe(0)
  })
})

describe('resumenResidual', () => {
  const l = limitesDeEspecie('Clementina')!
  it('un informe cuenta fuera si UNO de sus analitos queda fuera, y se suma por analito', () => {
    const r = resumenResidual(
      [
        informe(1, punto('FDL', 1), punto('PYR', 2)), // dentro
        informe(2, punto('FDL', 3.5), punto('PYR', 0.5)), // dos fuera, un solo informe
        informe(3, punto('FDL', 0.2)), // fuera
        informe(4, punto('TEBU', 99), punto('IMZ', null)), // sin límite o sin valor: no se evalúa
      ],
      l,
    )
    expect(r.informes).toBe(4)
    expect(r.informesFuera).toBe(2)
    const fdl = r.porAnalito.find((a) => a.codigo === 'FDL')!
    expect(fdl).toMatchObject({ evaluados: 3, fuera: 2 })
    expect(fdl.desvioPromedio).toBeCloseTo((0.5 + 0.5) / 2)
    expect(fdl.mayorDesvio).toBeCloseTo(0.5)
    expect(r.porAnalito.find((a) => a.codigo === 'TEBU')).toBeUndefined()
    expect(r.porAnalito.find((a) => a.codigo === 'PYR')).toMatchObject({ evaluados: 2, fuera: 1, mayorDesvio: -0.5 })
  })
  it('sin informes no hay nada fuera', () => {
    expect(resumenResidual([], l)).toEqual({ informes: 0, informesFuera: 0, porAnalito: [] })
  })
})
