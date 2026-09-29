import { describe, expect, it } from 'vitest'
import { fechaHora, formatoTamano, paraInputFechaHora, soloFecha } from './formato'

describe('formato de fechas (hora de Chile)', () => {
  it('sin fecha, guion', () => {
    expect(fechaHora(null)).toBe('—')
    expect(fechaHora('basura')).toBe('—')
    expect(soloFecha(undefined)).toBe('—')
  })

  it('convierte de UTC a la hora de Chile (septiembre = UTC-3)', () => {
    expect(fechaHora('2026-09-29T13:30:00Z')).toBe('29-09-2026 10:30')
    expect(soloFecha('2026-09-29T13:30:00Z')).toBe('29-09-2026')
  })

  it('en invierno el desfase es otro (UTC-4)', () => {
    expect(fechaHora('2026-07-15T13:30:00Z')).toBe('15-07-2026 09:30')
  })

  it('arma el valor del input datetime-local', () => {
    expect(paraInputFechaHora('2026-09-29T13:30:00Z')).toBe('2026-09-29T10:30')
    expect(paraInputFechaHora(null)).toBe('')
  })
})

describe('formatoTamano', () => {
  it('elige la unidad', () => {
    expect(formatoTamano(500)).toBe('500 B')
    expect(formatoTamano(2048)).toBe('2.0 KB')
    expect(formatoTamano(3 * 1024 * 1024)).toBe('3.0 MB')
  })
})
