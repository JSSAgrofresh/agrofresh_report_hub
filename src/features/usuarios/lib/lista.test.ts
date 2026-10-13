import { describe, expect, it } from 'vitest'
import { contarPorGrupo, filtrarUsuarios, iniciales, resumenAccesos } from './lista'
import type { Usuario } from '../types'

const u = (id: string, nombre: string, tipoAcceso: Usuario['tipoAcceso'], extra: Partial<Usuario> = {}): Usuario =>
  ({ id, nombre, email: `${nombre.split(' ')[0].toLowerCase()}@agrofresh.com`, tipoAcceso, ...extra }) as Usuario

const lista = [
  u('1', 'Jorge Sandoval', 'admin_general'),
  u('2', 'Andrés González', 'gerencia'),
  u('3', 'Barly Fuentes', 'admin_area', { area: 'toma_muestras' }),
  u('4', 'Diego Inostroza', 'muestreador'),
  u('5', 'Francisca Donoso', 'muestreador'),
  u('6', 'DOLE CODEGUA', 'cliente', { clienteNombre: 'DOLE CHILE S.A.', plantaNombre: 'DOLE PLANTA CODEGUA', modulos: ['reports', 'storage'], reportes: ['laboratorio'] }),
]

describe('lista de usuarios', () => {
  it('cuenta cada grupo y el total', () => {
    expect(contarPorGrupo(lista)).toEqual({ todos: 6, admin_general: 1, gerencia: 1, admin_area: 1, analista: 0, muestreador: 2, cliente: 1 })
  })

  it('filtra por tipo de cuenta', () => {
    expect(filtrarUsuarios(lista, 'muestreador', '').map((x) => x.nombre)).toEqual(['Diego Inostroza', 'Francisca Donoso'])
    expect(filtrarUsuarios(lista, 'cliente', '')).toHaveLength(1)
    expect(filtrarUsuarios(lista, 'todos', '')).toHaveLength(6)
  })

  it('busca por nombre, correo, cliente o sucursal sin importar tildes ni mayúsculas, y exige todas las palabras', () => {
    expect(filtrarUsuarios(lista, 'todos', 'andres gonzalez').map((x) => x.id)).toEqual(['2'])
    expect(filtrarUsuarios(lista, 'todos', 'DIEGO@').map((x) => x.id)).toEqual(['4'])
    expect(filtrarUsuarios(lista, 'todos', 'dole chile').map((x) => x.id)).toEqual(['6'])
    expect(filtrarUsuarios(lista, 'todos', 'planta codegua').map((x) => x.id)).toEqual(['6'])
    expect(filtrarUsuarios(lista, 'todos', 'dole diego')).toEqual([])
  })

  it('el tipo y el texto se combinan', () => {
    expect(filtrarUsuarios(lista, 'muestreador', 'fran').map((x) => x.id)).toEqual(['5'])
    expect(filtrarUsuarios(lista, 'cliente', 'diego')).toEqual([])
  })

  it('iniciales: primera y última palabra', () => {
    expect(iniciales('Jorge Sandoval')).toBe('JS')
    expect(iniciales('José Arturo Berardi')).toBe('JB')
    expect(iniciales('Loreto')).toBe('L')
    expect(iniciales('   ')).toBe('?')
  })

  it('resume lo que ve cada cuenta', () => {
    expect(resumenAccesos(lista[0])).toEqual(['Todo el sistema'])
    expect(resumenAccesos(lista[1])).toEqual(['Todo, solo lectura'])
    expect(resumenAccesos(lista[5])).toEqual(['Report', 'Storage'])
    expect(resumenAccesos(lista[2])).toEqual(['Toma de solicitudes'])
    expect(resumenAccesos({ ...lista[2], modulos: ['converter', 'storage'] })).toEqual(['Converter', 'Storage'])
  })
})
