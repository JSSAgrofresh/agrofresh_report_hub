import { describe, expect, it } from 'vitest'
import type { DetalleCostoKilo, DiaCostoKilo } from './api'
import { activosConConsumo, colorDeActivo, etiquetaDia, fmt, nombreDeActivo, seriesDeDias } from './graficos'

const dia = (fecha: string, kg: number, fdl: number, parcial = false): DiaCostoKilo => ({
  fecha, lecturas: 24, kg, sm_lamina: 1, sm_mant: 2, sm_total: 3, activos: { FDL: fdl, PYR: 0 }, parcial, ml_por_kg: {},
})

describe('costo por kilo: datos de los gráficos', () => {
  it('la etiqueta del eje es día y mes en palabras cortas', () => {
    expect(etiquetaDia('2025-12-05')).toBe('5-dic')
    expect(etiquetaDia('raro')).toBe('raro')
  })

  it('cada ingrediente activo conserva el color del PDF y uno nuevo recibe uno de la paleta', () => {
    expect(colorDeActivo('FDL')).toBe('#C0392B')
    expect(colorDeActivo('PYR')).toBe('#2F7DA3')
    expect(colorDeActivo('XYZ', ['FDL', 'XYZ'])).not.toBe(colorDeActivo('FDL'))
  })

  it('arma una serie por día y marca los parciales', () => {
    const s = seriesDeDias([dia('2025-12-05', 100, 2, true), dia('2025-12-06', 200, 4)], ['FDL'])
    expect(s.etiquetas).toEqual(['5-dic', '6-dic'])
    expect(s.kg).toEqual([100, 200])
    expect(s.activos.FDL).toEqual([2, 4])
    expect(s.parciales).toEqual([true, false])
  })

  it('un ingrediente que no gastó nada en el período no se dibuja', () => {
    const d = { codigos: ['FDL', 'PYR'], resumen: { totales: { activos: { FDL: 6, PYR: 0 } } } } as unknown as DetalleCostoKilo
    expect(activosConConsumo(d)).toEqual(['FDL'])
  })

  it('el nombre del activo suma el del catálogo si lo hay, y los números van en formato chileno', () => {
    expect(nombreDeActivo('FDL', { FDL: 'Fludioxonil' })).toBe('FDL (Fludioxonil)')
    expect(nombreDeActivo('TEBU', {})).toBe('TEBU')
    expect(fmt(1234.5, 1)).toBe('1.234,5')
    expect(fmt(null)).toBe('—')
  })
})
