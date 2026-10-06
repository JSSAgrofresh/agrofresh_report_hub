import { describe, expect, it } from 'vitest'
import type { ResumenCargaTrace } from './api'
import {
  FILTRO_CARGAS_VACIO,
  calcularKpis,
  cargasPorMes,
  cronologico,
  fechaDeCarga,
  filtrarCargas,
  opcionesDeCampo,
  resumenPorEquipo,
} from './resumen'

function carga(p: Partial<ResumenCargaTrace> & { carpeta: string }): ResumenCargaTrace {
  return {
    guardado_en: null,
    cliente: 'Cliente A',
    planta: null,
    equipo: 'EQUIPO_1',
    responsable: null,
    n_registros: 100,
    ph_promedio: 7,
    mv_promedio: 700,
    tiene_pdf: false,
    n_archivos: 2,
    origen: 'manual',
    ...p,
  }
}

const HOY = new Date(Date.UTC(2026, 8, 28))

describe('fechaDeCarga', () => {
  it('sale del nombre de la carpeta, y si no calza, del ISO', () => {
    expect(fechaDeCarga(carga({ carpeta: '2026-08-24_14-32-07' }))).toBe('2026-08-24')
    expect(fechaDeCarga(carga({ carpeta: 'otra', guardado_en: '2026-07-01T10:00:00Z' }))).toBe(
      '2026-07-01',
    )
    expect(fechaDeCarga(carga({ carpeta: 'otra' }))).toBeNull()
  })
})

describe('filtrarCargas', () => {
  const cargas = [
    carga({ carpeta: '2026-09-20_10-00-00', cliente: 'Cliente A', equipo: 'EQUIPO_1' }),
    carga({ carpeta: '2026-07-01_10-00-00', cliente: 'cliente a', equipo: 'EQUIPO_2' }),
    carga({ carpeta: '2025-01-01_10-00-00', cliente: 'Cliente B', equipo: 'EQUIPO_1' }),
  ]

  it('sin filtros devuelve todo', () => {
    expect(filtrarCargas(cargas, FILTRO_CARGAS_VACIO, HOY)).toHaveLength(3)
  })

  it('Ship To y posición de muestreo se filtran igual que el cliente', () => {
    const lista = [
      carga({ carpeta: '2026-09-20_10-00-00', planta: 'LONTUE', ubicacion: 'Línea 1' }),
      carga({ carpeta: '2026-09-19_10-00-00', planta: 'Lontue', ubicacion: 'Línea 2' }),
      carga({ carpeta: '2026-09-18_10-00-00', planta: 'Molina', ubicacion: 'Línea 1' }),
    ]
    expect(filtrarCargas(lista, { ...FILTRO_CARGAS_VACIO, planta: 'lontue' }, HOY)).toHaveLength(2)
    expect(filtrarCargas(lista, { ...FILTRO_CARGAS_VACIO, ubicacion: 'línea 1' }, HOY)).toHaveLength(2)
    expect(
      filtrarCargas(lista, { ...FILTRO_CARGAS_VACIO, planta: 'Lontue', ubicacion: 'Línea 2' }, HOY),
    ).toHaveLength(1)
  })

  it('cliente y equipo sin importar mayúsculas', () => {
    expect(
      filtrarCargas(cargas, { ...FILTRO_CARGAS_VACIO, cliente: 'CLIENTE A' }, HOY),
    ).toHaveLength(2)
    expect(filtrarCargas(cargas, { ...FILTRO_CARGAS_VACIO, equipo: 'equipo_1' }, HOY)).toHaveLength(
      2,
    )
  })

  it('el período cuenta hacia atrás desde hoy', () => {
    expect(
      filtrarCargas(cargas, { ...FILTRO_CARGAS_VACIO, periodo: '30' }, HOY).map((c) => c.carpeta),
    ).toEqual(['2026-09-20_10-00-00'])
    expect(filtrarCargas(cargas, { ...FILTRO_CARGAS_VACIO, periodo: '90' }, HOY)).toHaveLength(2)
    expect(filtrarCargas(cargas, { ...FILTRO_CARGAS_VACIO, periodo: '365' }, HOY)).toHaveLength(2)
  })
})

describe('calcularKpis', () => {
  it('pondera los promedios por cantidad de mediciones', () => {
    const k = calcularKpis([
      carga({ carpeta: '2026-09-01_00-00-00', n_registros: 300, ph_promedio: 6, mv_promedio: 600 }),
      carga({
        carpeta: '2026-09-02_00-00-00',
        n_registros: 100,
        ph_promedio: 8,
        mv_promedio: 800,
        equipo: 'EQUIPO_2',
        origen: 'email',
      }),
    ])
    // (6*300 + 8*100) / 400 = 6,5 — un promedio simple daría 7.
    expect(k.phPromedio).toBeCloseTo(6.5)
    expect(k.mvPromedio).toBeCloseTo(650)
    expect(k.mediciones).toBe(400)
    expect(k.equipos).toBe(2)
    expect(k.porCorreo).toBe(1)
    expect(k.ultima).toBe('2026-09-02')
  })

  it('ignora las cargas sin promedio y sin cargas no inventa un valor', () => {
    const k = calcularKpis([carga({ carpeta: 'x', ph_promedio: null, mv_promedio: null })])
    expect(k.phPromedio).toBeNull()
    expect(calcularKpis([]).phPromedio).toBeNull()
    expect(calcularKpis([]).ultima).toBeNull()
  })
})

describe('cargasPorMes', () => {
  it('cuenta por origen y rellena los meses vacíos entre medio', () => {
    const r = cargasPorMes([
      carga({ carpeta: '2025-11-05_00-00-00' }),
      carga({ carpeta: '2026-02-01_00-00-00', origen: 'email' }),
      carga({ carpeta: '2026-02-09_00-00-00' }),
    ])
    expect(r).toEqual([
      { mes: '2025-11', manual: 1, email: 0 },
      { mes: '2025-12', manual: 0, email: 0 },
      { mes: '2026-01', manual: 0, email: 0 },
      { mes: '2026-02', manual: 1, email: 1 },
    ])
    expect(cargasPorMes([])).toEqual([])
  })
})

describe('resumenPorEquipo y opciones', () => {
  it('agrupa por equipo, de más a menos cargas', () => {
    const r = resumenPorEquipo([
      carga({ carpeta: 'a', equipo: 'EQUIPO_2' }),
      carga({ carpeta: 'b', equipo: 'EQUIPO_1' }),
      carga({ carpeta: 'c', equipo: 'equipo_1' }),
      carga({ carpeta: 'd', equipo: null }),
    ])
    expect(r.map((x) => [x.equipo, x.cargas])).toEqual([
      ['EQUIPO_1', 2],
      ['EQUIPO_2', 1],
      ['Sin equipo', 1],
    ])
  })

  it('opciones sin repetir por mayúsculas, y cronológico de antiguo a nuevo', () => {
    const cargas = [
      carga({ carpeta: '2026-02-01_00-00-00', cliente: 'B' }),
      carga({ carpeta: '2026-01-01_00-00-00', cliente: 'b' }),
    ]
    expect(opcionesDeCampo(cargas, 'cliente')).toEqual(['B'])
    expect(cronologico(cargas).map((c) => c.carpeta)).toEqual([
      '2026-01-01_00-00-00',
      '2026-02-01_00-00-00',
    ])
  })
})
