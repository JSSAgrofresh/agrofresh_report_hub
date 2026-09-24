import { describe, expect, it } from 'vitest'
import { histograma } from './estadisticas'

describe('histograma', () => {
  it('sin valores no hay tramos', () => {
    expect(histograma([])).toEqual([])
  })

  it('todos iguales: un solo tramo con todo', () => {
    expect(histograma([2, 2, 2])).toEqual([{ desde: 2, hasta: 2, conteo: 3 }])
  })

  it('reparte en tramos del mismo ancho y el máximo cae en el último', () => {
    const t = histograma([0, 1, 2, 3, 4], 2)
    expect(t).toEqual([
      { desde: 0, hasta: 2, conteo: 2 },
      { desde: 2, hasta: 4, conteo: 3 },
    ])
    expect(t.reduce((a, b) => a + b.conteo, 0)).toBe(5)
  })

  it('por defecto usa raíz de n tramos, con máximo 12', () => {
    expect(histograma(Array.from({ length: 16 }, (_, i) => i))).toHaveLength(4)
    expect(histograma(Array.from({ length: 1000 }, (_, i) => i))).toHaveLength(12)
  })
})
