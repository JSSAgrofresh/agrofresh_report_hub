import { describe, expect, it } from 'vitest'
import {
  agruparPorPlanta,
  agruparPorSemana,
  buscarCliente,
  filtrarPorFecha,
  lunesDe,
  numeroSemana,
  pctNoCumple,
  porcentajeGeneral,
  rangoPorDefecto,
  rangoSemana,
  sumarBloques,
} from './agregar'
import type { FilaRendimiento } from './tipos'

const f = (o: Partial<FilaRendimiento>): FilaRendimiento => ({
  sold_to: 'DOLE CHILE S.A.', ship_to: 'DOLE PLANTA CODEGUA', semana: '2026-10-26', bloque: 'residuales', servicio: 'linea', cumple: 0, no_cumple: 0, ...o,
})

// DOLE CODEGUA del Excel: residuales 10 de 15 dentro, FSMA 8 de 8, FITO 4 de 6.
const codegua = [
  f({ bloque: 'residuales', servicio: 'linea', cumple: 7, no_cumple: 2 }),
  f({ bloque: 'residuales', servicio: 'actimist', cumple: 3, no_cumple: 3 }),
  f({ bloque: 'fsma', servicio: 'linea', cumple: 8 }),
  f({ bloque: 'fito', servicio: 'linea', cumple: 4, no_cumple: 2 }),
]

describe('agruparPorPlanta', () => {
  it('suma Línea de proceso y Actimist en el total de cada análisis', () => {
    const [p] = agruparPorPlanta(codegua)
    expect(p.bloques.residuales.total).toEqual({ cumple: 10, noCumple: 5 })
    expect(p.bloques.residuales.linea).toEqual({ cumple: 7, noCumple: 2 })
    expect(p.bloques.residuales.actimist).toEqual({ cumple: 3, noCumple: 3 })
    expect(p.bloques.fsma.total).toEqual({ cumple: 8, noCumple: 0 })
  })

  it('el general es el promedio simple del % No cumple de los tres análisis (cada uno pesa lo mismo)', () => {
    const [p] = agruparPorPlanta(codegua)
    // (33,3 + 0 + 33,3) / 3
    expect(p.general).toBeCloseTo(22.22, 1)
  })

  it('un análisis sin informes no cuenta en el general (no mejora el promedio con un 0 falso)', () => {
    const [p] = agruparPorPlanta([f({ bloque: 'residuales', cumple: 1, no_cumple: 1 })])
    expect(p.general).toBe(50)
    expect(pctNoCumple(p.bloques.fsma.total)).toBeNull()
  })

  it('sin ningún informe el general no existe', () => {
    expect(porcentajeGeneral(sumarBloques([]))).toBeNull()
  })

  it('ordena del que más no cumple al que menos, y los empates por nombre', () => {
    const lista = agruparPorPlanta([
      f({ ship_to: 'B', cumple: 1 }),
      f({ ship_to: 'A', cumple: 1 }),
      f({ ship_to: 'C', cumple: 1, no_cumple: 3 }),
    ])
    expect(lista.map((p) => p.shipTo)).toEqual(['C', 'A', 'B'])
  })

  it('separa dos plantas con el mismo nombre de clientes distintos', () => {
    const lista = agruparPorPlanta([f({ sold_to: 'X', ship_to: 'CHILLAN', cumple: 1 }), f({ sold_to: 'Y', ship_to: 'CHILLAN', cumple: 1 })])
    expect(lista).toHaveLength(2)
  })
})

describe('agruparPorSemana', () => {
  it('una fila por semana, de la más antigua a la más nueva', () => {
    const lista = agruparPorSemana([
      f({ semana: '2026-11-02', cumple: 1 }),
      f({ semana: '2026-10-26', cumple: 2, no_cumple: 1 }),
      f({ semana: '2026-10-26', bloque: 'fsma', cumple: 1 }),
    ])
    expect(lista.map((s) => s.semana)).toEqual(['2026-10-26', '2026-11-02'])
    expect(lista[0].bloques.residuales.total).toEqual({ cumple: 2, noCumple: 1 })
    expect(lista[0].bloques.fsma.total).toEqual({ cumple: 1, noCumple: 0 })
  })
})

describe('filtros', () => {
  const filas = [f({ semana: '2026-10-05' }), f({ semana: '2026-10-12' }), f({ semana: '2026-10-19' }), f({ semana: '2026-10-26' })]

  it('el rango incluye la semana de la fecha «desde» y la de «hasta»', () => {
    // el miércoles 14 está en la semana que parte el lunes 12
    expect(filtrarPorFecha(filas, '2026-10-14', '2026-10-20').map((x) => x.semana)).toEqual(['2026-10-12', '2026-10-19'])
  })

  it('sin fechas no filtra', () => {
    expect(filtrarPorFecha(filas, '', '')).toHaveLength(4)
  })

  it('el buscador encuentra por Sold To o Ship To sin tildes ni mayúsculas', () => {
    const datos = [f({ sold_to: 'COMERCIALIZADORA GARATE', ship_to: 'GREENEX PLANTA CODEGUA' }), f({ sold_to: 'MULTIFRUTA SA', ship_to: 'GESEX PLANTA FÁTIMA' })]
    expect(buscarCliente(datos, 'fatima')).toHaveLength(1)
    expect(buscarCliente(datos, 'garate codegua')).toHaveLength(1)
    expect(buscarCliente(datos, '')).toHaveLength(2)
    expect(buscarCliente(datos, 'zzz')).toHaveLength(0)
  })
})

describe('semanas', () => {
  it('el lunes de cualquier día de la semana', () => {
    expect(lunesDe('2026-10-28')).toBe('2026-10-26')
    expect(lunesDe('2026-11-01')).toBe('2026-10-26')
    expect(lunesDe('2026-10-26')).toBe('2026-10-26')
  })

  it('número de semana ISO y rango legible', () => {
    expect(numeroSemana('2026-10-26')).toBe(44)
    expect(rangoSemana('2026-10-26')).toBe('26 oct – 1 nov')
  })

  it('por defecto muestra las últimas 5 semanas con datos', () => {
    const filas = ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12'].map((s) => f({ semana: s }))
    expect(rangoPorDefecto(filas)).toEqual({ desde: '2026-09-14', hasta: '2026-10-18' })
    expect(rangoPorDefecto([])).toEqual({ desde: '', hasta: '' })
  })
})
