import { describe, expect, it } from 'vitest'
import { fechaHoraCorta, fechaHoraLarga, normalizar, palabrasDe, resaltar } from './formato'

describe('normalizar (igual que el backend)', () => {
  it('quita tildes y mayúsculas sin cambiar el largo', () => {
    expect(normalizar('Verificación ÑUÑOA')).toBe('verificacion nunoa')
    expect(normalizar('Verificación ÑUÑOA')).toHaveLength('Verificación ÑUÑOA'.length)
  })

  it('las palabras de la búsqueda, máximo 8', () => {
    expect(palabrasDe('  OT-0457   Pázña ')).toEqual(['ot-0457', 'pazna'])
    expect(palabrasDe(Array.from({ length: 20 }, (_, i) => `p${i}`).join(' '))).toHaveLength(8)
  })
})

describe('resaltar', () => {
  it('marca lo que coincide aunque tenga tildes o mayúsculas', () => {
    expect(resaltar('Verificación diaria', ['verificacion'])).toEqual([
      { texto: 'Verificación', coincide: true },
      { texto: ' diaria', coincide: false },
    ])
  })

  it('marca todas las apariciones de todas las palabras', () => {
    const tramos = resaltar('OT 12 y OT 34', ['ot', '34'])
    expect(tramos.filter((t) => t.coincide).map((t) => t.texto)).toEqual(['OT', 'OT', '34'])
  })

  it('sin búsqueda, el texto queda entero', () => {
    expect(resaltar('Hola', [])).toEqual([{ texto: 'Hola', coincide: false }])
  })
})

describe('fecha y hora', () => {
  const ahora = new Date(2026, 8, 25, 16, 0)

  it('hoy y ayer se dicen así, con la hora', () => {
    expect(fechaHoraCorta(new Date(2026, 8, 25, 14, 32).toISOString(), ahora)).toBe('Hoy, 14:32')
    expect(fechaHoraCorta(new Date(2026, 8, 24, 9, 5).toISOString(), ahora)).toBe('Ayer, 09:05')
  })

  it('un día más atrás lleva la fecha y la hora', () => {
    const texto = fechaHoraCorta(new Date(2026, 8, 20, 8, 7).toISOString(), ahora)
    expect(texto).toMatch(/20/)
    expect(texto).toMatch(/2026, 08:07$/)
  })

  it('el detalle trae la hora con segundos', () => {
    expect(fechaHoraLarga(new Date(2026, 8, 24, 14, 32, 5).toISOString())).toMatch(/14:32:05$/)
  })

  it('sin fecha no inventa nada', () => {
    expect(fechaHoraCorta(null)).toBe('')
    expect(fechaHoraLarga(null)).toBe('')
  })
})
