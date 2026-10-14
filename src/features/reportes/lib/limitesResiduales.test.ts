import { describe, expect, it } from 'vitest'
import type { InformeConPuntos } from './graficoResiduales'
import type { Observacion } from './tipos'
import { desvioResidual, limitesDeEspecie, informeFueraDeRango, limitesDeInforme, posicionResidual, resumenResidual } from './limitesResiduales'

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
  it('un informe cuenta fuera si UNO de sus analitos queda fuera; se separa sobre y bajo y se suma por analito', () => {
    const r = resumenResidual(
      [
        informe(1, punto('FDL', 1), punto('PYR', 2)), // dentro
        informe(2, punto('FDL', 3.5), punto('PYR', 0.5)), // sobre (FDL) y bajo (PYR): un solo informe fuera
        informe(3, punto('FDL', 0.2)), // bajo
        informe(4, punto('TEBU', 99), punto('IMZ', null)), // sin límite o sin valor: no se evalúa
      ],
      l,
    )
    expect(r).toMatchObject({ informes: 4, informesEvaluados: 3, informesSinLimite: 1, informesFuera: 2, informesSobre: 1, informesBajo: 2 })
    const fdl = r.porAnalito.find((a) => a.codigo === 'FDL')!
    expect(fdl).toMatchObject({ evaluados: 3, sobre: 1, bajo: 1, fuera: 2 })
    expect(fdl.desvioPromedio).toBeCloseTo((0.5 + 0.5) / 2)
    expect(fdl.mayorDesvio).toBeCloseTo(0.5)
    expect(r.porAnalito.find((a) => a.codigo === 'TEBU')).toBeUndefined()
    expect(r.porAnalito.find((a) => a.codigo === 'PYR')).toMatchObject({ evaluados: 2, sobre: 0, bajo: 1, fuera: 1, mayorDesvio: -0.5 })
  })
  it('sin informes no hay nada fuera', () => {
    expect(resumenResidual([], l)).toMatchObject({ informes: 0, informesEvaluados: 0, informesFuera: 0, porAnalito: [] })
  })
  it('cada informe se juzga con los límites de SU especie, sin elegir una en los filtros', () => {
    const conEspecie = (id: number, crop: string, ...puntos: Observacion[]) => informe(id, ...puntos.map((x) => ({ ...x, crop }) as Observacion))
    const informes = [
      conEspecie(1, 'Cerezas', punto('FDL', 4.5)), // Cerezas: FDL hasta 5 → dentro
      conEspecie(2, 'Manzana', punto('FDL', 4.5)), // Manzana: FDL hasta 3 → sobre
      conEspecie(3, 'Papaya', punto('FDL', 9)), // especie fuera de la tabla → sin límite
    ]
    const r = resumenResidual(informes, limitesDeInforme)
    expect(r).toMatchObject({ informes: 3, informesEvaluados: 2, informesSinLimite: 1, informesFuera: 1, informesSobre: 1, informesBajo: 0 })
    const fdl = r.porAnalito[0]
    expect(fdl.rangos).toEqual([{ min: 0.7, max: 3 }, { min: 0.7, max: 5 }])
  })
})

describe('informeFueraDeRango', () => {
  const clem = (ing: string, ppm: number | null) => ({ ingrediente: ing, ppm, crop: 'Clementina' }) as Observacion
  it('es verdadero si UN analito queda sobre o bajo la franja de su especie', () => {
    expect(informeFueraDeRango(informe(1, clem('FDL', 1), clem('PYR', 2)))).toBe(false)
    expect(informeFueraDeRango(informe(2, clem('FDL', 3.5)))).toBe(true)
    expect(informeFueraDeRango(informe(3, clem('FDL', 1), clem('PYR', 0.5)))).toBe(true)
  })
  it('sin límite en la tabla o sin valor no cuenta como fuera', () => {
    expect(informeFueraDeRango(informe(4, clem('TEBU', 99), clem('IMZ', null)))).toBe(false)
    expect(informeFueraDeRango(informe(5, { ingrediente: 'FDL', ppm: 99, crop: 'Especie rara' } as Observacion))).toBe(false)
  })
})
