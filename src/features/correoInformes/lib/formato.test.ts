import { describe, expect, it } from 'vitest'
import { dias, frasePendiente, semanaCorta } from './formato'

describe('formato', () => {
  it('muestra los días con un decimal o un guion si no hay dato', () => {
    expect(dias(2.5)).toBe('2,5 d')
    expect(dias(3)).toBe('3 d')
    expect(dias(null)).toBe('—')
  })

  it('pone la semana como día y mes corto', () => {
    expect(semanaCorta('2026-10-12')).toMatch(/^12 oct/)
  })

  it('dice hacia dónde va la demora', () => {
    expect(frasePendiente(0.4)).toBe('La demora sube 0,4 días hábiles por semana.')
    expect(frasePendiente(-1)).toBe('La demora baja 1 día hábil por semana.')
    expect(frasePendiente(0.01)).toMatch(/estable/)
    expect(frasePendiente(null)).toMatch(/Aún no hay semanas/)
  })
})
