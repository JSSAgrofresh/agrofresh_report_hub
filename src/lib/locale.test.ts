import { describe, expect, it } from 'vitest'
import { formatDateCL, formatDecimalCL, parseDecimalCL } from './locale'

describe('formatDateCL', () => {
  it('formatea una fecha ISO como DD-MM-AAAA', () => {
    expect(formatDateCL('2026-08-11')).toBe('11-08-2026')
  })
})

describe('parseDecimalCL', () => {
  it('interpreta la coma como separador decimal', () => {
    expect(parseDecimalCL('6,42')).toBe(6.42)
  })

  it('interpreta el punto como separador decimal', () => {
    expect(parseDecimalCL('6.42')).toBe(6.42)
  })

  it('distingue miles de decimales cuando vienen los dos separadores', () => {
    expect(parseDecimalCL('1.234,56')).toBe(1234.56)
    expect(parseDecimalCL('1,234.56')).toBe(1234.56)
  })

  it('devuelve null para texto no numérico', () => {
    expect(parseDecimalCL('nd')).toBeNull()
    expect(parseDecimalCL('')).toBeNull()
  })
})

describe('formatDecimalCL', () => {
  it('formatea un número con coma decimal', () => {
    expect(formatDecimalCL(6.4)).toBe('6,40')
  })

  it('devuelve un guion largo para valores nulos', () => {
    expect(formatDecimalCL(null)).toBe('—')
  })
})
