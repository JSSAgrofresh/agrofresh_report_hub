import { describe, expect, it } from 'vitest'
import { Chart } from 'chart.js'
import { resolucionDeGraficos } from './graficosNitidos'

describe('graficosNitidos', () => {
  it('dibuja siempre al menos al doble y sube al entero siguiente con zoom raro', () => {
    expect(resolucionDeGraficos(1)).toBe(2)
    expect(resolucionDeGraficos(undefined)).toBe(2)
    expect(resolucionDeGraficos(1.25)).toBe(2)
    expect(resolucionDeGraficos(1.5)).toBe(2)
    expect(resolucionDeGraficos(2.25)).toBe(3)
  })

  it('al cargarse deja la resolución como valor por defecto de todos los gráficos', async () => {
    await import('./graficosNitidos')
    expect(Chart.defaults.devicePixelRatio).toBeGreaterThanOrEqual(2)
  })
})
