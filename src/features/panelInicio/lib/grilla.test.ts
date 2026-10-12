import { describe, expect, it } from 'vitest'
import {
  COLUMNAS,
  agregar,
  cabe,
  compactar,
  mover,
  porQueNoCabe,
  primerHueco,
  redimensionar,
  seTocan,
  ubicarBajoPuntero,
} from './grilla'
import type { Pieza } from './grilla'

const P = (id: string, x: number, y: number, w: number, h: number): Pieza => ({ id, x, y, w, h })

describe('grilla del panel (espejo de tests/test_panel_inicio.py)', () => {
  it('compartir solo el borde no es pisarse', () => {
    expect(seTocan({ x: 0, y: 0, w: 3, h: 2 }, { x: 3, y: 0, w: 3, h: 2 })).toBe(false)
    expect(seTocan({ x: 0, y: 0, w: 3, h: 2 }, { x: 2, y: 1, w: 3, h: 2 })).toBe(true)
  })

  it('no cabe si se sale del tablero o pisa a otro, y dice por qué', () => {
    const base = [P('a', 0, 0, 4, 2)]
    expect(porQueNoCabe(base, { x: 10, y: 0, w: 3, h: 2 })).toMatch(/borde derecho/)
    expect(porQueNoCabe(base, { x: 3, y: 1, w: 3, h: 2 })).toMatch(/se pisa con «a»/)
    expect(porQueNoCabe(base, { x: 4, y: 0, w: 3, h: 2 })).toBeNull()
  })

  it('al mover una pieza no cuenta su propio lugar', () => {
    const base = [P('a', 0, 0, 4, 2)]
    expect(cabe(base, { x: 1, y: 0, w: 4, h: 2 }, 'a')).toBe(true)
    expect(cabe(base, { x: 1, y: 0, w: 4, h: 2 })).toBe(false)
  })

  it('primerHueco recorre de arriba a abajo y de izquierda a derecha', () => {
    expect(primerHueco([], 3, 2)).toEqual({ x: 0, y: 0, w: 3, h: 2 })
    const llena = [P('a', 0, 0, 12, 2)]
    expect(primerHueco(llena, 3, 2)).toEqual({ x: 0, y: 2, w: 3, h: 2 })
    const medio = [P('a', 0, 0, 6, 2)]
    expect(primerHueco(medio, 6, 2)).toEqual({ x: 6, y: 0, w: 6, h: 2 })
  })

  it('un widget más ancho que el tablero no tiene hueco', () => {
    expect(primerHueco([], COLUMNAS + 1, 1)).toBeNull()
  })

  it('compactar sube las piezas sin pisar a nadie y respeta el orden de la lista', () => {
    const r = compactar([P('b', 0, 6, 4, 2), P('a', 0, 2, 4, 2), P('c', 4, 9, 4, 2)])
    expect(r.map((p) => p.id)).toEqual(['b', 'a', 'c'])
    expect(r.find((p) => p.id === 'a')?.y).toBe(0)
    expect(r.find((p) => p.id === 'b')?.y).toBe(2)
    expect(r.find((p) => p.id === 'c')?.y).toBe(0)
  })

  it('mover, redimensionar y agregar devuelven null cuando no caben', () => {
    const base = [P('a', 0, 0, 4, 2), P('b', 4, 0, 4, 2)]
    expect(mover(base, 'a', 2, 0)).toBeNull()
    expect(mover(base, 'a', 0, 2)?.find((p) => p.id === 'a')?.y).toBe(2)
    expect(redimensionar(base, 'a', 6, 2)).toBeNull()
    expect(redimensionar(base, 'a', 4, 4)?.find((p) => p.id === 'a')?.h).toBe(4)
    expect(agregar(base, P('c', 4, 0, 2, 2))).toBeNull()
    expect(agregar(base, P('a', 8, 0, 2, 2))).toBeNull() // ya está puesto
    expect(agregar(base, P('c', 8, 0, 2, 2))).toHaveLength(3)
  })

  it('el puntero agarra el centro del widget y no lo deja salirse por la derecha', () => {
    expect(ubicarBajoPuntero(6, 3, 4, 2)).toEqual({ x: 4, y: 2, w: 4, h: 2 })
    expect(ubicarBajoPuntero(11, 0, 4, 2)).toEqual({ x: 8, y: 0, w: 4, h: 2 })
    expect(ubicarBajoPuntero(0, 0, 4, 2)).toEqual({ x: 0, y: 0, w: 4, h: 2 })
  })
})

import { BASE_CLIENTE_CROMATOGRAFIA, BASE_CLIENTE_POSTVENTA, BASE_INTERNO } from './disenosBase'
import { WIDGETS } from './catalogo'
import { dentroDelTablero } from './grilla'

describe('los diseños de partida son válidos', () => {
  it.each([
    ['interno', BASE_INTERNO],
    ['cliente cromatografía', BASE_CLIENTE_CROMATOGRAFIA],
    ['cliente post venta', BASE_CLIENTE_POSTVENTA],
  ])('%s: dentro del tablero, sin pisarse y con widgets que existen', (_n, base) => {
    for (const p of base) {
      expect(dentroDelTablero(p)).toBe(true)
      expect(WIDGETS.some((w) => w.id === p.id)).toBe(true)
    }
    base.forEach((a, i) => base.slice(i + 1).forEach((b) => expect(seTocan(a, b)).toBe(false)))
  })
})
