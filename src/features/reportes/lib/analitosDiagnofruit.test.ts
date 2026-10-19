import { describe, expect, it } from 'vitest'
import { analitoDiagnofruit } from './analitosDiagnofruit'

describe('analitoDiagnofruit', () => {
  it('cada patógeno lleva su nombre, su unidad y un orden fijo', () => {
    expect(analitoDiagnofruit('LEV')).toEqual({ nombre: 'Levaduras', unidad: 'UFC/mL', orden: 1 })
    expect(analitoDiagnofruit('geo')).toEqual({ nombre: 'Geotrichum', unidad: 'esporas/mL', orden: 4 })
    const ordenes = ['LEV', 'BOT', 'ALT', 'GEO', 'PEN'].map((c) => analitoDiagnofruit(c)!.orden)
    expect(ordenes).toEqual([1, 2, 3, 4, 5])
  })

  it('un código que no conoce da null', () => {
    expect(analitoDiagnofruit('XYZ')).toBeNull()
    expect(analitoDiagnofruit(undefined)).toBeNull()
  })
})
