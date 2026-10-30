import { describe, expect, it } from 'vitest'
import { alternarEspecie, especiesDe, fijarEspecies, resumenDeCliente } from './accesos'

const TODAS = ['Cerezas', 'Uva', 'Pera']

describe('accesos por planta y especie', () => {
  it('fija las mismas especies en varias plantas de una vez, sin tocar las demás', () => {
    const base = [{ clienteNombre: 'DOLE', plantaNombre: 'LONTUE', especie: 'Pera' }]
    const r = fijarEspecies(base, 'UNI', ['A', 'B'], ['Cerezas', 'Uva'])
    expect(r).toHaveLength(5)
    expect(especiesDe(r, 'UNI', 'B').especies).toEqual(['Cerezas', 'Uva'])
    expect(especiesDe(r, 'DOLE', 'LONTUE').especies).toEqual(['Pera'])
  })

  it('«todas» es una fila sin especie y [] quita el acceso', () => {
    const r = fijarEspecies([], 'UNI', ['A'], 'todas')
    expect(especiesDe(r, 'UNI', 'A')).toMatchObject({ tiene: true, todas: true })
    expect(especiesDe(fijarEspecies(r, 'UNI', ['A'], []), 'UNI', 'A').tiene).toBe(false)
  })

  it('alterna una especie; desde «todas» deja todas menos esa', () => {
    const r = alternarEspecie(fijarEspecies([], 'UNI', ['A'], 'todas'), 'UNI', 'A', 'Uva', TODAS)
    expect(especiesDe(r, 'UNI', 'A').especies).toEqual(['Cerezas', 'Pera'])
    expect(especiesDe(alternarEspecie(r, 'UNI', 'A', 'Uva', TODAS), 'UNI', 'A').especies).toEqual(['Cerezas', 'Pera', 'Uva'])
  })

  it('compara nombres sin mayúsculas ni espacios de más y cuenta plantas por cliente', () => {
    const r = fijarEspecies(fijarEspecies([], 'COPEFRUT', ['PLANTA  ROMERAL'], 'todas'), 'COPEFRUT', ['X'], ['Uva', 'Pera'])
    expect(especiesDe(r, 'copefrut', 'planta romeral').todas).toBe(true)
    expect(resumenDeCliente(r, 'COPEFRUT')).toEqual({ todo: false, plantas: 2 })
    expect(resumenDeCliente(fijarEspecies([], 'D', [null], 'todas'), 'D').todo).toBe(true)
  })
})
