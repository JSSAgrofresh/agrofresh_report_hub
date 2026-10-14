import { describe, expect, it } from 'vitest'
import type { Observacion } from './tipos'
import { MULTI_VACIOS, chipsMulti, contarMulti, cumpleMulti, tituloLimites } from './filtrosMultiples'

const o = (p: Partial<Observacion>) => p as Observacion

describe('filtros múltiples', () => {
  const obs = o({ cliente: 'DOLE CHILE S.A.', planta: 'DOLE PLANTA LONTUE', crop: 'Manzana', semana: 40, laboratorio: 'Quiteca' })

  it('sin nada elegido deja pasar todo', () => {
    expect(cumpleMulti(obs, MULTI_VACIOS)).toBe(true)
  })
  it('dentro de un filtro vale cualquiera de los elegidos, sin importar tildes ni mayúsculas', () => {
    expect(cumpleMulti(obs, { ...MULTI_VACIOS, crop: ['pera', 'MANZANA'] })).toBe(true)
    expect(cumpleMulti(obs, { ...MULTI_VACIOS, crop: ['pera', 'kiwi'] })).toBe(false)
    expect(cumpleMulti(obs, { ...MULTI_VACIOS, cliente: ['dole chile sa'] })).toBe(true)
  })
  it('entre filtros deben cumplirse todos; la semana se compara como texto', () => {
    expect(cumpleMulti(obs, { ...MULTI_VACIOS, crop: ['Manzana'], semana: ['40', '41'] })).toBe(true)
    expect(cumpleMulti(obs, { ...MULTI_VACIOS, crop: ['Manzana'], semana: ['41'] })).toBe(false)
  })
  it('`excepto` deja fuera un filtro (para sus propias opciones)', () => {
    const m = { ...MULTI_VACIOS, crop: ['Kiwi'], laboratorio: ['Quiteca'] }
    expect(cumpleMulti(obs, m)).toBe(false)
    expect(cumpleMulti(obs, m, 'crop')).toBe(true)
  })
  it('cuenta y describe lo elegido', () => {
    const m = { ...MULTI_VACIOS, crop: ['Manzana', 'Pera'], cliente: ['DOLE CHILE S.A.'] }
    expect(contarMulti(m)).toBe(2)
    expect(chipsMulti(m)).toEqual([
      { campo: 'cliente', etiqueta: 'Sold To', valor: 'DOLE CHILE S.A.' },
      { campo: 'crop', etiqueta: 'Especie', valor: 'Manzana, Pera' },
    ])
  })
})

describe('tituloLimites', () => {
  it('sin filtros es solo el nombre base', () => {
    expect(tituloLimites('Límites residuales', MULTI_VACIOS)).toBe('Límites residuales')
  })
  it('arma el título con lo elegido, en orden, y cuenta cuando son muchos', () => {
    expect(tituloLimites('Límites residuales', { ...MULTI_VACIOS, cliente: ['DOLE'], crop: ['Manzana', 'Pera'] }, ['FDL'])).toBe('Límites residuales - DOLE - Manzana, Pera - FDL')
    expect(tituloLimites('Límites de control', { ...MULTI_VACIOS, cliente: ['A', 'B', 'C', 'D'] })).toBe('Límites de control - 4 clientes')
  })
  it('incluye la semana y el mes elegidos', () => {
    expect(tituloLimites('Límites residuales', { ...MULTI_VACIOS, crop: ['Limón'], semana: ['39'] })).toBe('Límites residuales - Limón - Semana 39')
    expect(tituloLimites('Límites residuales', { ...MULTI_VACIOS, semana: ['39', '40'] })).toBe('Límites residuales - Semanas 39, 40')
    expect(tituloLimites('Límites residuales', { ...MULTI_VACIOS, semana: ['1', '2', '3', '4'] })).toBe('Límites residuales - 4 semanas')
    expect(tituloLimites('Límites residuales', { ...MULTI_VACIOS, crop: ['Limón'], mes: ['9'] }, [], (m) => (m === '9' ? 'Septiembre' : m))).toBe('Límites residuales - Limón - Septiembre')
  })
})
