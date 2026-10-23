import { describe, expect, it } from 'vitest'
import { bandaFito, bandaLimite, fmtDesvio, fmtNum } from './escala'

describe('bandaLimite', () => {
  it('un valor dentro cae entre el mínimo y el máximo', () => {
    const b = bandaLimite(2, 0.7, 3)
    expect(b.marca).toBeGreaterThan(b.desde)
    expect(b.marca).toBeLessThan(b.hasta)
  })

  it('un valor sobre el máximo cae a la derecha de la banda', () => {
    const b = bandaLimite(3.4, 0.7, 3)
    expect(b.marca).toBeGreaterThan(b.hasta)
    expect(b.marca).toBeLessThanOrEqual(100)
  })

  it('un valor bajo el mínimo cae a la izquierda de la banda', () => {
    const b = bandaLimite(0.3, 0.7, 3)
    expect(b.marca).toBeLessThan(b.desde)
    expect(b.marca).toBeGreaterThanOrEqual(0)
  })

  it('un valor enorme no se sale del eje', () => {
    expect(bandaLimite(500, 0.7, 3).marca).toBe(100)
  })
})

describe('bandaFito', () => {
  it('los tramos van en orden y la marca cae en el suyo', () => {
    const b = bandaFito(250, 20, 200)
    expect(b.optimo).toBeLessThan(b.peligroso)
    expect(b.marca).toBeGreaterThan(b.peligroso)
    expect(bandaFito(5, 20, 200).marca).toBeLessThan(bandaFito(5, 20, 200).optimo)
  })
})

describe('formato', () => {
  it('números con coma y hasta 2 decimales', () => {
    expect(fmtNum(3.4)).toBe('3,4')
    expect(fmtNum(12)).toBe('12')
    expect(fmtNum(0.456)).toBe('0,46')
    expect(fmtNum(null)).toBe('—')
  })

  it('el desvío lleva su signo', () => {
    expect(fmtDesvio(0.4)).toBe('+0,4')
    expect(fmtDesvio(-0.4)).toBe('−0,4')
    expect(fmtDesvio(0)).toBe('0')
  })
})
