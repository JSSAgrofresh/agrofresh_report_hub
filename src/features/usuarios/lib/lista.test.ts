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
  u('7', 'Ricardo Traverso', 'comercial', { modulos: ['reports', 'storage'], plantasAsignadas: [{ clienteNombre: 'VERFRUT', plantaNombre: 'VERFRUT RAPEL' }, { clienteNombre: 'DOLE' }] }),
]

describe('lista de usuarios', () => {
  it('cuenta cada grupo y el total', () => {
    expect(contarPorGrupo(lista)).toEqual({ todos: 7, admin_general: 1, gerencia: 1, admin_area: 1, analista: 0, muestreador: 2, comercial: 1, cliente: 1 })
  })

  it('filtra por tipo de cuenta', () => {
    expect(filtrarUsuarios(lista, 'muestreador', '').map((x) => x.nombre)).toEqual(['Diego Inostroza', 'Francisca Donoso'])
    expect(filtrarUsuarios(lista, 'cliente', '')).toHaveLength(1)
    expect(filtrarUsuarios(lista, 'todos', '')).toHaveLength(7)
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

describe('comerciales en la lista', () => {
  it('se encuentran por una de sus plantas y resumen lo que abren', () => {
    expect(filtrarUsuarios(lista, 'todos', 'verfrut rapel').map((x) => x.id)).toEqual(['7'])
    expect(filtrarUsuarios(lista, 'comercial', '')).toHaveLength(1)
    expect(resumenAccesos(lista.find((x) => x.id === '7') as Usuario)).toEqual(['Report', 'Storage', '2 plantas'])
  })
})

describe('comercial con «todas las plantas»', () => {
  it('el resumen de accesos dice «Todas las plantas» en vez de contar plantas', () => {
    const u = { id: '1', email: 'c@x.cl', nombre: 'C', tipoAcceso: 'comercial', modulos: ['reports', 'todas_las_plantas'], plantasAsignadas: [] } as Usuario
    expect(resumenAccesos(u)).toEqual(['Report', 'Todas las plantas'])
  })
})
