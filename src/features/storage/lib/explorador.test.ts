import { describe, expect, it } from 'vitest'
import {
  ESPACIOS,
  estaDentro,
  filtrarEntradas,
  formatoTamano,
  migasDe,
  nombreVisible,
  ordenarEntradas,
} from './explorador'
import type { EntradaStorage } from './tipos'

function e(nombre: string, tipo: 'carpeta' | 'archivo', extra: Partial<EntradaStorage> = {}): EntradaStorage {
  return { nombre, ruta: nombre, tipo, tamano_bytes: tipo === 'carpeta' ? null : 10, modificado: '', ...extra }
}

const solicitudes = ESPACIOS.find((x) => x.id === 'solicitudes')!
const local = ESPACIOS.find((x) => x.id === 'local')!

describe('ordenarEntradas', () => {
  it('deja las carpetas primero aunque el orden sea descendente', () => {
    const lista = [e('b.txt', 'archivo'), e('Zeta', 'carpeta'), e('a.txt', 'archivo'), e('Alfa', 'carpeta')]
    const asc = ordenarEntradas(lista, { campo: 'nombre', descendente: false }).map((x) => x.nombre)
    expect(asc).toEqual(['Alfa', 'Zeta', 'a.txt', 'b.txt'])
    const desc = ordenarEntradas(lista, { campo: 'nombre', descendente: true }).map((x) => x.nombre)
    expect(desc).toEqual(['Zeta', 'Alfa', 'b.txt', 'a.txt'])
  })

  it('ordena por tamaño y por fecha', () => {
    const lista = [
      e('grande', 'archivo', { tamano_bytes: 900, modificado: '2026-01-01' }),
      e('chico', 'archivo', { tamano_bytes: 5, modificado: '2026-03-01' }),
    ]
    expect(ordenarEntradas(lista, { campo: 'tamano', descendente: false })[0].nombre).toBe('chico')
    expect(ordenarEntradas(lista, { campo: 'modificado', descendente: true })[0].nombre).toBe('chico')
  })

  it('no modifica la lista original', () => {
    const lista = [e('b', 'archivo'), e('a', 'archivo')]
    ordenarEntradas(lista, { campo: 'nombre', descendente: false })
    expect(lista.map((x) => x.nombre)).toEqual(['b', 'a'])
  })
})

describe('filtrarEntradas', () => {
  const lista = [e('Agrícola San Clemente', 'carpeta'), e('DOLE CHILE S.A', 'carpeta'), e('2026-09-28', 'carpeta')]

  it('ignora mayúsculas y tildes', () => {
    expect(filtrarEntradas(lista, 'agricola').map((x) => x.nombre)).toEqual(['Agrícola San Clemente'])
  })

  it('pide todas las palabras, en cualquier orden', () => {
    expect(filtrarEntradas(lista, 'clemente san')).toHaveLength(1)
    expect(filtrarEntradas(lista, 'dole clemente')).toHaveLength(0)
  })

  it('encuentra una fecha como se ve en pantalla', () => {
    expect(filtrarEntradas(lista, '28-09-2026')).toHaveLength(1)
  })

  it('sin texto devuelve todo', () => {
    expect(filtrarEntradas(lista, '  ')).toHaveLength(3)
  })
})

describe('migasDe', () => {
  it('en local, la raíz es el espacio y cada carpeta suma una miga', () => {
    expect(migasDe(local, 'Clientes/DOLE')).toEqual([
      { etiqueta: 'Archivos del servidor', ruta: '' },
      { etiqueta: 'Clientes', ruta: 'Clientes' },
      { etiqueta: 'DOLE', ruta: 'Clientes/DOLE' },
    ])
  })

  it('en R2 no repite el prefijo del bucket', () => {
    expect(migasDe(solicitudes, 'solicitudes/DOLE CHILE S.A')).toEqual([
      { etiqueta: 'Solicitudes', ruta: 'solicitudes' },
      { etiqueta: 'DOLE CHILE S.A', ruta: 'solicitudes/DOLE CHILE S.A' },
    ])
  })
})

describe('helpers', () => {
  it('formatea tamaños', () => {
    expect(formatoTamano(null)).toBe('—')
    expect(formatoTamano(512)).toBe('512 B')
    expect(formatoTamano(2048)).toBe('2.0 KB')
  })

  it('muestra las fechas ISO a la chilena y deja el resto', () => {
    expect(nombreVisible('2026-09-28')).toBe('28-09-2026')
    expect(nombreVisible('Clientes')).toBe('Clientes')
  })

  it('estaDentro no confunde carpetas con nombre parecido', () => {
    expect(estaDentro('a/b/c', 'a/b')).toBe(true)
    expect(estaDentro('a/b', 'a/b')).toBe(true)
    expect(estaDentro('a/bc', 'a/b')).toBe(false)
  })
})
