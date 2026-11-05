import { describe, expect, it } from 'vitest'
import type { ItemInventario } from './api'
import { STOCK_BAJO, ordenar, porAnio, porTipo, requierenAtencion, resumir, stockBajo, topStock } from './analisis'
import { anchos128, barras128, codigos128 } from './codigoBarras'

const it_ = (p: Partial<ItemInventario>): ItemInventario => ({
  id: 1, codigo: 'INS-01', categoria: 'Insumo', ubicacion: null, descripcion: 'x', detalle: null, almacenamiento: null, presentacion: null,
  lote: null, vencimiento: null, referencia: null, stock: 1, activo: true, actualizado: '', estado_vencimiento: 'sin_fecha', dias_para_vencer: null, ...p,
})
const lista = [
  it_({ id: 1, codigo: 'INS-52', categoria: 'Estándar analítico', estado_vencimiento: 'vencido', dias_para_vencer: -300, vencimiento: '2025-11-30' }),
  it_({ id: 2, codigo: 'INS-52', categoria: 'Estándar analítico', estado_vencimiento: 'vigente', dias_para_vencer: 1500, vencimiento: '2030-03-31' }),
  it_({ id: 3, codigo: 'INS-53', categoria: 'Estándar analítico', estado_vencimiento: 'por_vencer', dias_para_vencer: 20, vencimiento: '2026-11-25' }),
  it_({ id: 4, codigo: 'INS-54', categoria: 'Estándar analítico', estado_vencimiento: 'vencido', dias_para_vencer: -10, vencimiento: '2026-10-25', stock: 0 }),
  it_({ id: 5, codigo: 'INS-18', stock: 2600 }),
  it_({ id: 6, codigo: 'INS-25', stock: 11 }),
  it_({ id: 7, codigo: 'INS-26', stock: 0 }),
]

describe('inventario: números de arriba', () => {
  it('un vencido sin stock no es alerta; el stock bajo es solo de insumos y no cuenta el 0', () => {
    expect(resumir(lista)).toEqual({ registros: 7, codigos: 6, vencidos: 1, porVencer: 1, stockBajo: 1, sinStock: 1 })
    expect(STOCK_BAJO).toBe(50)
  })
  it('requieren atención: del más vencido al menos urgente', () => {
    expect(requierenAtencion(lista).map((i) => i.id)).toEqual([1, 3])
  })
  it('stock bajo incluye los sin stock; más stock ordena de mayor a menor', () => {
    expect(stockBajo(lista).map((i) => i.id)).toEqual([7, 6])
    expect(topStock(lista).map((i) => i.id)).toEqual([5, 6])
  })
  it('por tipo y por año cuentan solo lo que hay en stock; los insumos son vigentes', () => {
    const t = Object.fromEntries(porTipo(lista).map((x) => [x.tipo, x.reparto]))
    expect(t['Estándar analítico']).toEqual({ vigente: 1, porVencer: 1, vencido: 1 })
    expect(t['Insumo']).toEqual({ vigente: 2, porVencer: 0, vencido: 0 })
    expect(porAnio(lista).map((x) => x.anio)).toEqual(['2025', '2026', '2030'])
  })
  it('ordenar deja lo vacío al final en cualquier sentido', () => {
    const ids = (asc: boolean) => ordenar(lista, 'vencimiento', asc).map((i) => i.id).slice(0, 3)
    expect(ids(true)).toEqual([1, 4, 3])
    expect(ids(false)).toEqual([2, 3, 4])
  })
})

describe('Code 128', () => {
  it('«INS-01»: inicio B, caracteres, dígito de control y fin', () => {
    // INS-01 = I(41) N(46) S(51) -(13) 0(16) 1(17); control = (104 + 41 + 46*2 + 51*3 + 13*4 + 16*5 + 17*6) % 103 = 624 % 103 = 6
    expect(codigos128('INS-01')).toEqual([104, 41, 46, 51, 13, 16, 17, 6])
  })
  it('cada símbolo mide 11 módulos y el fin 13', () => {
    const a = anchos128('INS-01')
    expect(a.reduce((s, n) => s + n, 0)).toBe(8 * 11 + 13)
    expect(a.length % 2).toBe(1) // empieza y termina en barra
  })
  it('el dibujo trae margen y las barras no se pisan', () => {
    const { rects, ancho } = barras128('INS-01')
    expect(ancho).toBe(8 * 11 + 13 + 20)
    rects.slice(1).forEach((r, i) => expect(r.x).toBeGreaterThan(rects[i].x + rects[i].w - 1))
  })
})
