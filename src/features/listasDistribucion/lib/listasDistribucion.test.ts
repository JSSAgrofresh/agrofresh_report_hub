import { describe, expect, it } from 'vitest'
import { agruparPorPlanta, coincideFiltro, contarCorreos, filtrarCambios } from './listasDistribucion'
import type { CambioLista } from './listasDistribucion'

function cambio(parcial: Partial<CambioLista>): CambioLista {
  return {
    id: 'x', tipo: 'campo', planta: { sold_to: 'COPEFRUT SA', ship_to: 'COPEFRUT PLANTA ROMERAL' },
    campo: 'tecnico', etiqueta: 'Técnico a cargo · copia oculta', agregar: [], quitar: [], corregir: [],
    aviso: null, fila: null, ...parcial,
  }
}

describe('listas de distribución', () => {
  it('«solo agregan» excluye a todo cambio que quita a alguien', () => {
    expect(coincideFiltro(cambio({ agregar: ['a@x.cl'] }), 'agregan')).toBe(true)
    expect(coincideFiltro(cambio({ agregar: ['a@x.cl'], quitar: ['b@x.cl'] }), 'agregan')).toBe(false)
    expect(coincideFiltro(cambio({ agregar: ['a@x.cl'], quitar: ['b@x.cl'] }), 'quitan')).toBe(true)
    expect(coincideFiltro(cambio({ tipo: 'planta_nueva' }), 'agregan')).toBe(false)
    expect(coincideFiltro(cambio({ tipo: 'planta_nueva' }), 'nuevas')).toBe(true)
  })

  it('busca sin tildes ni mayúsculas, en planta, rol y correos', () => {
    const lista = [cambio({ agregar: ['ana@x.cl'] }), cambio({ planta: { sold_to: 'OTRO', ship_to: 'PLANTA DOS' }, agregar: ['luis@y.cl'] })]
    expect(filtrarCambios(lista, 'todos', 'romeral')).toHaveLength(1)
    expect(filtrarCambios(lista, 'todos', 'TECNICO luis')).toHaveLength(1)
    expect(filtrarCambios(lista, 'todos', '')).toHaveLength(2)
    expect(filtrarCambios(lista, 'todos', 'inexistente')).toHaveLength(0)
  })

  it('agrupa por planta y cuenta correos', () => {
    const lista = [
      cambio({ id: '1', agregar: ['a@x.cl', 'b@x.cl'] }),
      cambio({ id: '2', campo: 'comercial', quitar: ['c@x.cl'] }),
      cambio({ id: '3', planta: { sold_to: 'OTRO', ship_to: 'PLANTA DOS' }, tipo: 'copia', corregir: ['d@x.cl'] }),
    ]
    const grupos = agruparPorPlanta(lista)
    expect(grupos.map((g) => g.cambios.length)).toEqual([2, 1])
    expect(contarCorreos(lista)).toEqual({ agregan: 2, quitan: 1, ajustan: 1 })
  })

  it('una planta nueva cuenta todos los correos de su fila', () => {
    const fila = { sold_to: 'A', ship_to: 'B', admin: ['a@x.cl'], comercial: ['c@x.cl'], tecnico: [], clientes: { Kiwi: ['k@x.cl'] } }
    expect(contarCorreos([cambio({ tipo: 'planta_nueva', fila })]).agregan).toBe(3)
  })
})
