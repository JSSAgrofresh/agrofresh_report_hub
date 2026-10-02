import { describe, expect, it } from 'vitest'
import { posicionesDeMuestreo } from './posicionesMuestreo'

describe('posicionesDeMuestreo', () => {
  it('Cerezas con agua trae las cuatro posiciones de agua', () => {
    expect(posicionesDeMuestreo('Cerezas', 'Agua')).toEqual([
      'Hidrocooler',
      'Pozo vaciado',
      'Cortapedicelo',
      'Pozo Fungicida',
    ])
  })
  it('Cerezas con fruta trae solo producto terminado', () => {
    expect(posicionesDeMuestreo('Cerezas', 'Fruta')).toEqual(['Producto terminado'])
  })
  it('sin tipo trae todas, sin repetir; acepta singular y tildes', () => {
    expect(posicionesDeMuestreo('Cítricos')).toEqual(['Vaciado', 'Pozo Heat', 'Producto terminado'])
    expect(posicionesDeMuestreo('Kiwi', 'Fruta')).toEqual(['Pozo inmersión', 'Producto terminado'])
  })
  it('especie sin lista = null (texto libre)', () => {
    expect(posicionesDeMuestreo('Uvas', 'Fruta')).toBeNull()
  })
})
