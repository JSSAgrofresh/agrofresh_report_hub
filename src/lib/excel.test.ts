import { describe, expect, it } from 'vitest'
import { nombreDeArchivo, nombreDeHoja } from './excel'

describe('nombres de Excel', () => {
  it('la hoja sin caracteres prohibidos y de hasta 31 letras', () => {
    expect(nombreDeHoja('Informes: [enviados]/a clientes')).toBe('Informes enviados a clientes')
    expect(nombreDeHoja('x'.repeat(50))).toHaveLength(31)
    expect(nombreDeHoja('  ')).toBe('Hoja')
  })
  it('el archivo sin tildes, con guiones y la fecha', () => {
    expect(nombreDeArchivo('Análisis por cliente', new Date('2026-10-22T12:00:00Z'))).toBe('analisis-por-cliente-2026-10-22.xlsx')
  })
})
