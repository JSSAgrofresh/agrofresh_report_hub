import { describe, expect, it } from 'vitest'
import { claveNuevas, duracion, hace, tonoDe, trazoPulso } from './monitoreo'

const AHORA = new Date('2026-10-22T15:00:00Z').getTime()
const antes = (seg: number) => new Date(AHORA - seg * 1000).toISOString()

describe('hace', () => {
  it('ahora, minutos, horas y días', () => {
    expect(hace(antes(10), AHORA)).toBe('ahora')
    expect(hace(antes(5 * 60), AHORA)).toBe('hace 5 min')
    expect(hace(antes(3 * 3600), AHORA)).toBe('hace 3 h')
    expect(hace(antes(50 * 3600), AHORA)).toBe('hace 2 d')
  })
  it('sin fecha no inventa nada y el futuro cuenta como ahora', () => {
    expect(hace(null, AHORA)).toBe('—')
    expect(hace(antes(-120), AHORA)).toBe('ahora')
  })
})

describe('duracion', () => {
  it('formatea minutos y horas', () => {
    expect(duracion(antes(20), antes(0))).toBe('menos de 1 min')
    expect(duracion(antes(8 * 60), antes(0))).toBe('8 min')
    expect(duracion(antes(72 * 60), antes(0))).toBe('1 h 12 min')
    expect(duracion(antes(120 * 60), antes(0))).toBe('2 h')
  })
})

describe('tonoDe', () => {
  it('es estable y está entre 0 y 359', () => {
    expect(tonoDe('a@x.cl')).toBe(tonoDe('a@x.cl'))
    expect(tonoDe('a@x.cl')).toBeGreaterThanOrEqual(0)
    expect(tonoDe('a@x.cl')).toBeLessThan(360)
  })
})

describe('claveNuevas', () => {
  const items = [{ id: 1 }, { id: 2 }, { id: 3 }]
  it('la primera vuelta no destaca nada', () => {
    expect(claveNuevas(null, items, (i) => String(i.id)).size).toBe(0)
  })
  it('destaca solo lo que no estaba', () => {
    expect([...claveNuevas(new Set(['1', '2']), items, (i) => String(i.id))]).toEqual(['3'])
  })
})

describe('trazoPulso', () => {
  it('una serie vacía no rompe y una plana queda abajo', () => {
    expect(trazoPulso([], 100, 40).linea).toBe('')
    const t = trazoPulso([0, 0, 0], 100, 40)
    expect(t.max).toBe(1)
    expect(t.ultimo?.y).toBeCloseTo(34)
  })
  it('el máximo llega arriba y el área se cierra', () => {
    const t = trazoPulso([0, 5, 10], 100, 40)
    expect(t.ultimo?.y).toBeCloseTo(6)
    expect(t.area.endsWith('Z')).toBe(true)
  })
})
