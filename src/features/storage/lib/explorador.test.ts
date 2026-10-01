import { describe, expect, it } from 'vitest'
import {
  ESPACIOS,
  espacioDeRuta,
  espacioLocalDeRuta,
  leerArrastre,
  partirResaltado,
  puede,
  tipoDeArchivo,
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
const accutab = ESPACIOS.find((x) => x.id === 'accutab')!

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

// Los mismos casos que tests/test_storage_r2.py (storage_r2.permitir): si
// cambia la política de un lado, cambia en el otro.
describe('puede (espejo de storage_r2.permitir)', () => {
  it('en el disco del servidor se puede todo', () => {
    for (const op of ['crear', 'subir', 'renombrar', 'mover', 'eliminar'] as const) {
      expect(puede(local, op, 'Clientes/DOLE')).toBe(true)
    }
  })

  it('_config nunca se toca', () => {
    for (const op of ['crear', 'subir', 'renombrar', 'mover', 'eliminar'] as const) {
      expect(puede(solicitudes, op, 'solicitudes/_config')).toBe(false)
    }
  })

  it('Accutab se administra entero menos su carpeta base', () => {
    expect(puede(accutab, 'eliminar', 'accutab/mail/AGROFRESH_DEMO', true)).toBe(true)
    expect(puede(accutab, 'subir', 'accutab/mail')).toBe(true)
    expect(puede(accutab, 'eliminar', 'accutab/mail')).toBe(false)
    expect(puede(accutab, 'renombrar', 'accutab/mail')).toBe(false)
  })

  it('Solicitudes deja ordenar carpetas pero no subir, borrar ni tocar archivos', () => {
    expect(puede(solicitudes, 'crear', 'solicitudes/DOLE')).toBe(true)
    expect(puede(solicitudes, 'renombrar', 'solicitudes/DOLE', true)).toBe(true)
    expect(puede(solicitudes, 'mover', 'solicitudes/DOLE/2026', true)).toBe(true)
    expect(puede(solicitudes, 'renombrar', 'solicitudes/DOLE/OT-1/OT-1.xlsx', false)).toBe(false)
    expect(puede(solicitudes, 'subir', 'solicitudes/DOLE')).toBe(false)
    expect(puede(solicitudes, 'eliminar', 'solicitudes/DOLE', true)).toBe(false)
    expect(puede(solicitudes, 'renombrar', 'solicitudes', true)).toBe(false)
  })

  it('Informes se ven y se borran, pero no se reordenan (los ordena la aplicación)', () => {
    const informes = ESPACIOS.find((e) => e.id === 'informes')!
    const ruta = 'informes/PLANTA X/2026-09-30/Actimist/Quiteca/i.pdf'
    expect(puede(informes, 'eliminar', ruta, false)).toBe(true)
    expect(puede(informes, 'eliminar', 'informes/PLANTA X', true)).toBe(true)
    for (const op of ['crear', 'subir', 'renombrar', 'mover'] as const) {
      expect(puede(informes, op, ruta, false)).toBe(false)
      expect(puede(informes, op, 'informes/PLANTA X', true)).toBe(false)
    }
    expect(puede(informes, 'eliminar', 'informes', true)).toBe(false)
    expect(puede(informes, 'crear', 'informes2/x')).toBe(false)
  })

  it('Laboratorio AgroFresh es una carpeta del disco con su propia entrada', () => {
    const lab = ESPACIOS.find((e) => e.id === 'laboratorio')!
    expect(lab).toMatchObject({ r2: false, raiz: 'Laboratorio AgroFresh' })
    expect(puede(lab, 'subir', 'Laboratorio AgroFresh/GC')).toBe(true)
    expect(espacioLocalDeRuta('Laboratorio AgroFresh/GC/x.xlsx')).toBe('laboratorio')
    expect(espacioLocalDeRuta('Laboratorio AgroFresh')).toBe('laboratorio')
    expect(espacioLocalDeRuta('Laboratorio AgroFresh 2')).toBe('local')
    expect(espacioLocalDeRuta('Clientes/DOLE')).toBe('local')
  })

  it('no confunde prefijos parecidos', () => {
    expect(espacioDeRuta('informes/PLANTA X')).toBe('informes')
    expect(espacioDeRuta('informes2/x')).toBe('local')
    expect(puede(solicitudes, 'crear', 'solicitudes2/x')).toBe(false)
    expect(espacioDeRuta('solicitudes2/x')).toBe('local')
    expect(espacioDeRuta('accutab/mail/A')).toBe('accutab')
    expect(espacioDeRuta('solicitudes/DOLE')).toBe('solicitudes')
  })
})

describe('tipoDeArchivo', () => {
  it('reconoce por extensión, sin importar mayúsculas', () => {
    expect(tipoDeArchivo('Informe.PDF')).toMatchObject({ clave: 'pdf', etiqueta: 'PDF', vista: 'pdf' })
    expect(tipoDeArchivo('datos.xlsx').clave).toBe('excel')
    expect(tipoDeArchivo('foto.jpeg').vista).toBe('imagen')
  })

  it('lo desconocido y lo sin extensión no rompe', () => {
    expect(tipoDeArchivo('extraño.qzx')).toMatchObject({ clave: 'otro', etiqueta: 'QZX' })
    expect(tipoDeArchivo('Makefile')).toMatchObject({ clave: 'otro', etiqueta: 'ARCH' })
    expect(tipoDeArchivo('.env').clave).toBe('otro')
  })
})

describe('partirResaltado', () => {
  it('marca lo que coincide ignorando tildes y mayúsculas', () => {
    const t = partirResaltado('Agrícola San Clemente', 'agricola clem')
    expect(t.filter((x) => x.marca).map((x) => x.texto)).toEqual(['Agrícola', 'Clem'])
    expect(t.map((x) => x.texto).join('')).toBe('Agrícola San Clemente')
  })

  it('sin búsqueda devuelve el texto tal cual', () => {
    expect(partirResaltado('hola', '')).toEqual([{ texto: 'hola', marca: false }])
  })
})

describe('leerArrastre', () => {
  it('lee lo que se arrastró y tolera basura', () => {
    expect(leerArrastre('{"espacio":"local","rutas":["a","b",3]}')).toEqual({ espacio: 'local', rutas: ['a', 'b'] })
    expect(leerArrastre('no es json')).toBeNull()
    expect(leerArrastre('[]')).toBeNull()
    expect(leerArrastre('')).toBeNull()
  })
})
