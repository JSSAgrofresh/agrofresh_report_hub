import { describe, expect, it } from 'vitest'
import { filtrarCorrecciones, resumirCorrecciones } from './correcciones'
import type { CorreccionConverter } from './correcciones'

function c(extra: Partial<CorreccionConverter> = {}): CorreccionConverter {
  return {
    id: 1, campo: 'sold_to', contexto: '', valor_crudo: 'Soc. Agr. La Hornilla Spa.',
    valor_oficial: 'AGRICOLA LA HORNILLA SPA', archivo_origen: 'inf.pdf', creado_por_nombre: 'Ana',
    creado_por_email: 'ana@a.com', creado_en: '2026-09-29T10:00:00Z', actualizado_por_nombre: 'Ana',
    actualizado_en: '2026-09-29T10:00:00Z', usos: 0, ultimo_uso: null, revisiones: 0, ...extra,
  }
}

describe('filtrarCorrecciones', () => {
  const lista = [
    c({ id: 1 }),
    c({ id: 2, campo: 'ship_to', contexto: 'DOLE CHILE S.A.', valor_crudo: 'San Fernando', valor_oficial: 'DOLE PLANTA SAN FERNANDO' }),
    c({ id: 3, campo: 'variedad', contexto: 'Cerezas', valor_crudo: 'Bing (Ñ)', valor_oficial: 'Bing', creado_por_nombre: 'José' }),
  ]

  it('sin filtros devuelve todo', () => {
    expect(filtrarCorrecciones(lista, '', '')).toHaveLength(3)
  })
  it('por campo', () => {
    expect(filtrarCorrecciones(lista, 'ship_to', '').map((x) => x.id)).toEqual([2])
  })
  it('por texto, sin tildes ni mayúsculas, en cualquier columna', () => {
    expect(filtrarCorrecciones(lista, '', 'HORNILLA').map((x) => x.id)).toEqual([1])
    expect(filtrarCorrecciones(lista, '', 'jose').map((x) => x.id)).toEqual([3])
    expect(filtrarCorrecciones(lista, '', 'dole').map((x) => x.id)).toEqual([2])
    expect(filtrarCorrecciones(lista, '', 'inf.pdf')).toHaveLength(3)
  })
  it('campo y texto a la vez', () => {
    expect(filtrarCorrecciones(lista, 'sold_to', 'san fernando')).toEqual([])
  })
})

describe('resumirCorrecciones', () => {
  it('cuenta por campo y las aplicadas solas', () => {
    const r = resumirCorrecciones([c({ usos: 3 }), c({ id: 2, campo: 'ship_to', usos: 0 }), c({ id: 3, usos: 2 })])
    expect(r).toEqual({ total: 3, aplicadasSolas: 5, sinUsar: 1, porCampo: { sold_to: 2, ship_to: 1, especie: 0, variedad: 0 } })
  })
  it('lista vacía', () => {
    expect(resumirCorrecciones([]).total).toBe(0)
  })
})
