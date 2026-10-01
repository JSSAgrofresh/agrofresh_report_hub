import { describe, expect, it } from 'vitest'
import { estadoResultado, limiteDeAnalito } from './estadoResultado'
import type { Analito, LimiteAnalito } from './tipos'

const analito = (id: number, codigo: string, laboratorio: string) => ({ id, codigo, laboratorio }) as Analito
const lim = (analito_id: number, especie: string, tipo_servicio: string, max: number | string | null, min: number | null = null) =>
  ({ id: 1, analito_id, especie, tipo_servicio, limite_min: min, limite_central: null, limite_max: max }) as LimiteAnalito

describe('limiteDeAnalito', () => {
  const analitos = [analito(1, 'FLUD', 'Quiteca'), analito(2, 'FLUD', 'Agrofresh')]
  const limites = [lim(1, '', '', 5), lim(1, 'Manzana', '', 3), lim(1, 'Manzana', 'Actimist', '2,5'.replace(',', '.'))]

  it('prefiere la combinación exacta, luego especie, luego general', () => {
    expect(limiteDeAnalito(analitos, limites, 'FLUD', 'Quiteca', 'Manzana', 'Actimist').max).toBe(2.5)
    expect(limiteDeAnalito(analitos, limites, 'FLUD', 'Quiteca', 'Manzana', 'Línea').max).toBe(3)
    expect(limiteDeAnalito(analitos, limites, 'FLUD', 'Quiteca', 'Pera', 'Línea').max).toBe(5)
  })
  it('respeta el laboratorio y no inventa límites', () => {
    expect(limiteDeAnalito(analitos, limites, 'FLUD', 'Agrofresh', 'Manzana', null).max).toBeNull()
    expect(limiteDeAnalito(analitos, limites, 'XXX', null, null, null)).toEqual({ min: null, central: null, max: null })
  })
})

describe('estadoResultado', () => {
  it('clasifica', () => {
    const l = { min: 1, central: null, max: 3 }
    expect(estadoResultado(2, l)).toBe('dentro')
    expect(estadoResultado(3.5, l)).toBe('sobre')
    expect(estadoResultado(0.5, l)).toBe('bajo')
    expect(estadoResultado(2, { min: null, central: null, max: null })).toBe('sin_limite')
    expect(estadoResultado(null, l)).toBe('nd')
  })
})
