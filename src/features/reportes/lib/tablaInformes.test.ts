import { describe, expect, it } from 'vitest'
import {
  ORDEN_INICIAL, alternarOrden, columnaAnalito, csvDeInformes, detectadosDe, filtrarInformes, ordenarInformes, paginar,
  resumenPorAnalito,
} from './tablaInformes'
import { modeloLinea, type InformeVista, type ResultadoVista } from './lineaTiempoInformes'

const COLT = { codigo: 'COLT', nombre: 'Coliformes Totales', unidad: 'UFC/100 mL', orden: 1 }
const ECOLI = { codigo: 'ECOLI', nombre: 'Escherichia coli', unidad: 'UFC/100 mL', orden: 2 }
const no = (a: typeof COLT): ResultadoVista => ({ ...a, texto: '<1', valor: null, detectado: false })
const si = (a: typeof COLT, v: number, texto = String(v)): ResultadoVista => ({ ...a, texto, valor: v, detectado: true })
const inf = (nro: string, fecha: string, c: ResultadoVista, e: ResultadoVista, detalle: string | null = null): InformeVista => ({
  nro, fecha, detalle, resultados: [c, e],
})

const INFORMES: InformeVista[] = [
  inf('496252', '2026-09-30', si(COLT, 49), si(ECOLI, 15), 'Pozo vaciado'),
  inf('496561', '2026-09-30', no(COLT), no(ECOLI), 'Línea 2'),
  inf('496250', '2026-10-01', si(COLT, 41), si(ECOLI, 33)),
  inf('496251', '2026-10-01', si(COLT, 67), si(ECOLI, 50), 'pozo vaciado'),
  inf('496563', '2026-10-30', no(COLT), no(ECOLI), 'Línea 2'),
]
const modelo = modeloLinea(INFORMES)
const nros = (l: { nro: string }[]) => l.map((i) => i.nro)

describe('ordenarInformes', () => {
  it('por defecto lo más reciente primero, y dentro del día el N° mayor primero', () => {
    expect(nros(ordenarInformes(modelo.informes, ORDEN_INICIAL))).toEqual(['496563', '496251', '496250', '496561', '496252'])
  })

  it('por un analito: los detectados con más valor primero, los no detectados al final', () => {
    const r = ordenarInformes(modelo.informes, { col: columnaAnalito('COLT'), dir: 'desc' })
    expect(nros(r).slice(0, 3)).toEqual(['496251', '496252', '496250'])
    expect(nros(r).slice(3).sort()).toEqual(['496561', '496563'])
  })

  it('por N° ascendente y por zona (sin importar tildes ni mayúsculas)', () => {
    expect(nros(ordenarInformes(modelo.informes, { col: 'nro', dir: 'asc' }))[0]).toBe('496250')
    // sin zona primero; «Línea 2» y «Pozo vaciado» juntas aunque cambien las mayúsculas; a igual zona, el más reciente primero
    expect(nros(ordenarInformes(modelo.informes, { col: 'detalle', dir: 'asc' }))).toEqual(['496250', '496563', '496561', '496251', '496252'])
  })

  it('por estado: primero los que tienen más detecciones', () => {
    const r = ordenarInformes(modelo.informes, { col: 'estado', dir: 'desc' })
    expect(r.slice(0, 3).every((i) => detectadosDe(i) === 2)).toBe(true)
  })

  it('no cambia la lista original', () => {
    const copia = nros(modelo.informes)
    ordenarInformes(modelo.informes, { col: 'nro', dir: 'desc' })
    expect(nros(modelo.informes)).toEqual(copia)
  })
})

describe('alternarOrden', () => {
  it('la primera vez ordena de la forma útil de cada columna y la segunda al revés', () => {
    expect(alternarOrden(ORDEN_INICIAL, 'nro')).toEqual({ col: 'nro', dir: 'asc' })
    expect(alternarOrden({ col: 'nro', dir: 'asc' }, 'nro')).toEqual({ col: 'nro', dir: 'desc' })
    expect(alternarOrden(ORDEN_INICIAL, columnaAnalito('COLT'))).toEqual({ col: 'a:COLT', dir: 'desc' })
    expect(alternarOrden(ORDEN_INICIAL, 'fecha')).toEqual({ col: 'fecha', dir: 'asc' })
  })
})

describe('filtrarInformes', () => {
  it('busca por N°, zona o fecha, sin tildes ni mayúsculas, y con varias palabras a la vez', () => {
    expect(nros(filtrarInformes(modelo.informes, '4965'))).toEqual(['496561', '496563'])
    expect(nros(filtrarInformes(modelo.informes, 'POZO'))).toEqual(['496252', '496251'])
    expect(nros(filtrarInformes(modelo.informes, 'linea 2'))).toEqual(['496561', '496563'])
    expect(nros(filtrarInformes(modelo.informes, '01-10-2026 pozo'))).toEqual(['496251'])
    expect(filtrarInformes(modelo.informes, '   ')).toBe(modelo.informes)
    expect(filtrarInformes(modelo.informes, 'zzz')).toEqual([])
  })
})

describe('paginar', () => {
  const filas = Array.from({ length: 23 }, (_, i) => i + 1)
  it('parte en páginas y dice qué filas se ven', () => {
    expect(paginar(filas, 1, 10)).toMatchObject({ pagina: 1, paginas: 3, desde: 1, hasta: 10 })
    expect(paginar(filas, 3, 10)).toMatchObject({ filas: [21, 22, 23], desde: 21, hasta: 23 })
  })
  it('una página que ya no existe cae en la última, y una lista vacía no falla', () => {
    expect(paginar(filas, 9, 10).pagina).toBe(3)
    expect(paginar([], 1, 10)).toMatchObject({ filas: [], pagina: 1, paginas: 1, desde: 0, hasta: 0 })
  })
})

describe('resumenPorAnalito y csvDeInformes', () => {
  it('cuenta en cuántos informes se detectó cada analito', () => {
    expect(resumenPorAnalito(modelo.informes, modelo.analitos)).toEqual([
      { codigo: 'COLT', detectados: 3, total: 5 },
      { codigo: 'ECOLI', detectados: 3, total: 5 },
    ])
  })

  it('el CSV lleva encabezado con unidad, los valores como se ven, el estado y marca para Excel', () => {
    const csv = csvDeInformes(ordenarInformes(modelo.informes, ORDEN_INICIAL).slice(0, 2), modelo.analitos, 'Zona de muestreo')
    const lineas = csv.split('\r\n')
    expect(csv.startsWith('﻿')).toBe(true)
    expect(lineas[0]).toBe('﻿"Fecha de muestreo";"N° de informe";"Zona de muestreo";"Coliformes Totales (UFC/100 mL)";"Escherichia coli (UFC/100 mL)";"Estado"')
    expect(lineas[1]).toBe('"30-10-2026";"496563";"Línea 2";"<1";"<1";"Sin detección"')
    expect(lineas[2]).toBe('"01-10-2026";"496251";"pozo vaciado";"67";"50";"Con detección (2 de 2)"')
  })

  it('las comillas del texto se duplican y sin columna de detalle no sale', () => {
    const raro = modeloLinea([inf('1', '2026-10-01', no(COLT), no(ECOLI), 'Pozo "2"')])
    expect(csvDeInformes(raro.informes, raro.analitos, 'Zona')).toContain('"Pozo ""2"""')
    expect(csvDeInformes(raro.informes, raro.analitos, null).split('\r\n')[0]).not.toContain('Zona')
  })
})
