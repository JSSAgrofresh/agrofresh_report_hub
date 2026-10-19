import { describe, expect, it } from 'vitest'
import { analitoAls } from './analitosAls'

describe('analitoAls', () => {
  it('los dos ensayos de agua llevan su nombre del informe, su unidad y van en este orden', () => {
    const coliformes = analitoAls('COLT')!
    const ecoli = analitoAls('ECOLI')!
    expect(coliformes).toMatchObject({ nombre: 'Coliformes Totales', unidad: 'UFC/100 mL' })
    expect(ecoli).toMatchObject({ nombre: 'Escherichia coli', unidad: 'UFC/100 mL' })
    expect(coliformes.orden).toBeLessThan(ecoli.orden)
  })

  it('el código de la ingesta y el del catálogo son el mismo analito', () => {
    expect(analitoAls('ECOLI100')).toEqual(analitoAls('ECOLI'))
    expect(analitoAls('COLIF100')).toEqual(analitoAls('COLT'))
    expect(analitoAls('HONGOS')).toEqual(analitoAls('HONG'))
  })

  it('distingue agua y alimento por el código, no solo por el nombre', () => {
    expect(analitoAls('COLA')!.unidad).toBe('UFC/g')
    expect(analitoAls('COLT')!.unidad).toBe('UFC/100 mL')
  })

  it('no distingue mayúsculas y un código que no conoce da null', () => {
    expect(analitoAls(' ecoli ')!.nombre).toBe('Escherichia coli')
    expect(analitoAls('XYZ')).toBeNull()
    expect(analitoAls(null)).toBeNull()
  })
})
