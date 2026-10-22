import { describe, expect, it } from 'vitest'
import {
  filtrarBloque,
  nivelDe,
  nivelesPorAnalito,
  presenciaPorAnalito,
} from './estadoPatogenos'
import type { InformeVista, ResultadoVista } from './lineaTiempoInformes'

const r = (codigo: string, nombre: string, orden: number, texto: string, valor: number | null, detectado: boolean): ResultadoVista => ({
  codigo, nombre, unidad: 'con/mL', orden, texto, valor, detectado,
})
const inf = (nro: string, ...resultados: ResultadoVista[]): InformeVista => ({ nro, fecha: '2026-10-01', resultados })

describe('presencia: detectado es malo, no detectado es bueno', () => {
  it('una torta por analito con su porcentaje bueno', () => {
    const informes = [
      inf('1', r('ECOLI', 'Escherichia coli', 2, '<1', null, false), r('COLT', 'Coliformes Totales', 1, '41', 41, true)),
      inf('2', r('ECOLI', 'Escherichia coli', 2, '<1', null, false), r('COLT', 'Coliformes Totales', 1, '<1', null, false)),
      inf('3', r('ECOLI100', 'Escherichia coli', 2, '5', 5, true)),
    ]
    const dona = presenciaPorAnalito(informes)
    expect(dona.map((d) => d.nombre)).toEqual(['Coliformes Totales', 'Escherichia coli'])
    const ecoli = dona[1]
    expect(ecoli.total).toBe(3)
    expect(ecoli.tajadas.map((t) => [t.texto, t.cantidad])).toEqual([['No detectado', 2], ['Detectado', 1]])
    expect(ecoli.porcentajeBien).toBe(67)
    expect(dona[0].porcentajeBien).toBe(50)
  })

  it('sin informes no hay tortas', () => {
    expect(presenciaPorAnalito([])).toEqual([])
  })
})

describe('nivel de contaminación según la tabla de límites (con/mL)', () => {
  const bot = (texto: string, valor: number | null, detectado = true) => r('BOT', 'Botrytis', 2, texto, valor, detectado)
  it('Botrytis: óptimo < 20, moderado 20–200, peligroso > 200', () => {
    expect(nivelDe(bot('BLD', null, false))).toBe('optimo')
    expect(nivelDe(bot('19', 19))).toBe('optimo')
    expect(nivelDe(bot('20', 20))).toBe('moderado')
    expect(nivelDe(bot('200', 200))).toBe('moderado')
    expect(nivelDe(bot('201', 201))).toBe('peligroso')
  })
  it('Alternaria 50/300, Geotrichum 10/50 y Penicillium 50/300', () => {
    expect(nivelDe(r('ALT', 'Alternaria', 3, '49', 49, true))).toBe('optimo')
    expect(nivelDe(r('ALT', 'Alternaria', 3, '300', 300, true))).toBe('moderado')
    expect(nivelDe(r('GEO', 'Geotrichum', 4, '9', 9, true))).toBe('optimo')
    expect(nivelDe(r('GEO', 'Geotrichum', 4, '51', 51, true))).toBe('peligroso')
    expect(nivelDe(r('PEN', 'Penicillium', 5, '301', 301, true))).toBe('peligroso')
  })
  it('«>100» solo es concluyente si el piso ya llega a peligroso; levaduras no tiene tabla', () => {
    expect(nivelDe(bot('>100', 100))).toBe('incierto')
    expect(nivelDe(bot('>250', 250))).toBe('peligroso')
    expect(nivelDe(r('LEV', 'Levaduras', 1, '5', 5, true))).toBeNull()
  })
  it('una torta por hongo con tabla (sin levaduras) y el % óptimo', () => {
    const informes = [
      inf('1', bot('BLD', null, false), r('LEV', 'Levaduras', 1, '4', 4, true)),
      inf('2', bot('25', 25)),
      inf('3', bot('400', 400)),
      inf('4', bot('>100', 100)),
    ]
    const dona = nivelesPorAnalito(informes)
    expect(dona.map((d) => d.nombre)).toEqual(['Botrytis'])
    expect(dona[0].tajadas.map((t) => [t.texto, t.cantidad])).toEqual([
      ['Óptimo', 1], ['Moderado', 1], ['Peligroso', 1], ['No concluyente', 1],
    ])
    expect(dona[0].porcentajeBien).toBe(25)
  })
})

describe('filtros propios del bloque', () => {
  const informes = [
    inf('1', r('ECOLI', 'Escherichia coli', 2, '<1', null, false), r('COLT', 'Coliformes Totales', 1, '41', 41, true)),
    inf('2', r('ECOLI', 'Escherichia coli', 2, '<1', null, false)),
  ]
  it('sin filtro devuelve la misma lista', () => {
    expect(filtrarBloque(informes, { analitos: [], estado: 'todos' })).toBe(informes)
  })
  it('por analito deja solo ese y saca los informes que quedan vacíos', () => {
    const f = filtrarBloque(informes, { analitos: ['COLT'], estado: 'todos' })
    expect(f.map((i) => i.nro)).toEqual(['1'])
    expect(f[0].resultados.map((x) => x.codigo)).toEqual(['COLT'])
  })
  it('por estado: detectado / no detectado', () => {
    expect(filtrarBloque(informes, { analitos: [], estado: 'detectado' }).map((i) => i.nro)).toEqual(['1'])
    expect(filtrarBloque(informes, { analitos: [], estado: 'no_detectado' }).map((i) => i.nro)).toEqual(['1', '2'])
  })
})
