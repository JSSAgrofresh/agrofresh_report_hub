import { describe, expect, it } from 'vitest'
import { describirFiltros, pedidoBd } from './descargaBd'
import { FILTROS_VACIOS } from './filtros'
import type { Observacion } from './tipos'

const obs = (solicitudId: number, ingrediente = 'IMZ') => ({ solicitudId, ingrediente }) as Observacion

describe('pedidoBd', () => {
  it('sin acotar pide la base completa, aunque haya filtros puestos', () => {
    const filtros = { ...FILTROS_VACIOS, laboratorio: 'ALS', ingredientes: ['IMZ'] }
    expect(pedidoBd([obs(1)], filtros, false, 'Laboratorio: ALS')).toEqual({
      solicitud_ids: null,
      ingredientes: null,
      descripcion_filtros: null,
    })
  })

  it('acotada manda las solicitudes distintas que quedaron a la vista', () => {
    const p = pedidoBd([obs(1), obs(1, 'FDL'), obs(2)], FILTROS_VACIOS, true, 'Especie: Cereza')
    expect(p.solicitud_ids).toEqual([1, 2])
    expect(p.descripcion_filtros).toBe('Especie: Cereza')
    expect(p.ingredientes).toBeNull()
  })

  it('acotada con ingredientes elegidos los manda para acotar las columnas', () => {
    const p = pedidoBd([obs(1)], { ...FILTROS_VACIOS, ingredientes: ['IMZ', 'FDL'] }, true, '')
    expect(p.ingredientes).toEqual(['IMZ', 'FDL'])
    expect(p.descripcion_filtros).toBeNull()
  })

  it('un filtro sin resultados manda lista vacía y NO null (null bajaría todo)', () => {
    const p = pedidoBd([], { ...FILTROS_VACIOS, laboratorio: 'X' }, true, 'Laboratorio: X')
    expect(p.solicitud_ids).toEqual([])
  })
})

describe('describirFiltros', () => {
  it('junta los chips en una línea legible', () => {
    expect(
      describirFiltros([
        { etiqueta: 'Laboratorio', valor: 'ALS' },
        { etiqueta: 'Especie', valor: 'Cereza' },
      ]),
    ).toBe('Laboratorio: ALS · Especie: Cereza')
  })
})
