import { describe, expect, it } from 'vitest'
import { widgetsParaObjetivo } from './catalogo'

describe('widgetsParaObjetivo', () => {
  it('a un panel de clientes solo se le ofrecen widgets de cliente', () => {
    for (const area of [undefined, 'cromatografia', 'postventa'] as const) {
      const ids = widgetsParaObjetivo({ audiencia: 'cliente', area }).map((w) => w.id)
      expect(ids.length).toBeGreaterThan(0)
      expect(ids.every((id) => id.startsWith('cliente:'))).toBe(true)
    }
  })

  it('a un panel interno nunca se le ofrecen widgets de cliente', () => {
    const ids = widgetsParaObjetivo({ audiencia: 'interno' }).map((w) => w.id)
    expect(ids.some((id) => id.startsWith('cliente:'))).toBe(false)
  })
})
