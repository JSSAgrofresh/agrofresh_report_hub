import { describe, expect, it } from 'vitest'
import { iniciales, nivelSalud, tendencia, totalDia } from './adminPanel'

describe('iniciales', () => {
  it('toma la primera y la última palabra', () => {
    expect(iniciales('Jorge Sandoval')).toBe('JS')
    expect(iniciales('María José Rojas Pérez')).toBe('MP')
  })
  it('un solo nombre da dos letras y vacío da «?»', () => {
    expect(iniciales('Claudia')).toBe('CL')
    expect(iniciales('  ')).toBe('?')
    expect(iniciales(null)).toBe('?')
  })
})

describe('tendencia', () => {
  it('sin período previo no inventa un cambio', () => {
    expect(tendencia(5, null).tono).toBe('neutro')
  })
  it('subir es bueno por defecto, malo si menos es mejor', () => {
    expect(tendencia(90, 80, { unidad: 'pts' })).toEqual({ texto: '▲ 10 pts', tono: 'bueno' })
    expect(tendencia(5, 4, { unidad: 'días', masEsMejor: false }).tono).toBe('malo')
    expect(tendencia(3.6, 4.2, { unidad: 'días', masEsMejor: false })).toEqual({ texto: '▼ 0,6 días', tono: 'bueno' })
  })
  it('igual es neutro', () => {
    expect(tendencia(4, 4).tono).toBe('neutro')
  })
})

describe('nivelSalud', () => {
  it('90 o más es bueno, 70 a 89 regular, menos es malo', () => {
    expect(nivelSalud(90)).toBe('bueno')
    expect(nivelSalud(89)).toBe('regular')
    expect(nivelSalud(70)).toBe('regular')
    expect(nivelSalud(69)).toBe('malo')
  })
})

describe('totalDia', () => {
  it('suma todas las categorías de trabajo', () => {
    expect(totalDia({ fecha: '2026-10-01', solicitudes: 3, cargas: 2, verificaciones: 1, laboratorio: 4, otros: 5 })).toBe(15)
  })
})
