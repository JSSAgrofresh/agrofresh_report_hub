import { describe, expect, it } from 'vitest'
import type { CargaTrace, ResumenCargaTrace } from './api'
import {
  FILTRO_ACCUTAB_VACIO,
  contarFiltros,
  etiquetaSemana,
  filtrarAccutab,
  opcionesAccutab,
  semanaIso,
} from './filtros'
import { filasBdInformes, filasBdRegistros, reunirDetalles, totalMediciones } from './exportar'

function carga(p: Partial<ResumenCargaTrace> & { carpeta: string }): ResumenCargaTrace {
  return {
    guardado_en: null,
    cliente: 'DOLE',
    planta: 'DOLE LONTUE',
    ubicacion: 'Línea 1',
    equipo: 'EQUIPO_1',
    responsable: null,
    n_registros: 100,
    ph_promedio: null,
    mv_promedio: null,
    tiene_pdf: true,
    n_archivos: 0,
    origen: 'manual',
    ...p,
  }
}

const LISTA = [
  carga({ carpeta: '2026-10-20_10-00-00' }),
  carga({ carpeta: '2026-10-13_10-00-00', planta: 'DOLE MOLINA', ubicacion: 'Línea 2', equipo: 'EQUIPO_2' }),
  carga({ carpeta: '2026-09-01_10-00-00', cliente: 'VERFRUT', planta: 'VERFRUT RAPEL', equipo: 'EQUIPO_3', origen: 'email', tiene_pdf: false }),
]

describe('semanaIso', () => {
  it('da la semana ISO y usa el año de la semana, no el del día', () => {
    expect(semanaIso('2026-10-20')).toBe('2026-S43')
    expect(semanaIso('2026-01-01')).toBe('2026-S01')
    expect(semanaIso('2027-01-01')).toBe('2026-S53')
    expect(semanaIso('2024-12-30')).toBe('2025-S01')
    expect(semanaIso('basura')).toBeNull()
    expect(etiquetaSemana('2026-S43')).toBe('Semana 43 · 2026')
  })
})

describe('filtrarAccutab', () => {
  it('sin filtros devuelve todo y cada filtro admite varios valores sin importar mayúsculas', () => {
    expect(filtrarAccutab(LISTA, FILTRO_ACCUTAB_VACIO)).toHaveLength(3)
    expect(filtrarAccutab(LISTA, { ...FILTRO_ACCUTAB_VACIO, shipTo: ['dole lontue', 'DOLE MOLINA'] })).toHaveLength(2)
    expect(filtrarAccutab(LISTA, { ...FILTRO_ACCUTAB_VACIO, soldTo: ['Dole'], posicion: ['Línea 2'] }).map((c) => c.carpeta)).toEqual(['2026-10-13_10-00-00'])
    expect(filtrarAccutab(LISTA, { ...FILTRO_ACCUTAB_VACIO, equipo: ['EQUIPO_3'] })).toHaveLength(1)
  })

  it('la semana y el rango de fechas acotan por la fecha de la carga (extremos incluidos)', () => {
    expect(filtrarAccutab(LISTA, { ...FILTRO_ACCUTAB_VACIO, semana: ['2026-S43'] }).map((c) => c.carpeta)).toEqual(['2026-10-20_10-00-00'])
    const rango = { desde: '2026-10-13', hasta: '2026-10-20' }
    expect(filtrarAccutab(LISTA, { ...FILTRO_ACCUTAB_VACIO, rango })).toHaveLength(2)
    expect(filtrarAccutab(LISTA, { ...FILTRO_ACCUTAB_VACIO, rango: { desde: '2026-10-21', hasta: '2026-10-30' } })).toHaveLength(0)
  })
})

describe('opcionesAccutab', () => {
  it('cada filtro ofrece solo lo que queda con los demás puestos, y conserva lo ya marcado', () => {
    expect(opcionesAccutab(LISTA, FILTRO_ACCUTAB_VACIO, 'shipTo')).toEqual(['DOLE LONTUE', 'DOLE MOLINA', 'VERFRUT RAPEL'])
    const f = { ...FILTRO_ACCUTAB_VACIO, soldTo: ['VERFRUT'] }
    expect(opcionesAccutab(LISTA, f, 'shipTo')).toEqual(['VERFRUT RAPEL'])
    // el propio filtro no se acota a sí mismo: elegido VERFRUT, Sold To sigue ofreciendo DOLE
    expect(opcionesAccutab(LISTA, f, 'soldTo')).toEqual(['DOLE', 'VERFRUT'])
    expect(opcionesAccutab(LISTA, { ...FILTRO_ACCUTAB_VACIO, soldTo: ['DOLE'], equipo: ['EQUIPO_9'] }, 'equipo')).toEqual(['EQUIPO_1', 'EQUIPO_2', 'EQUIPO_9'])
  })

  it('las semanas van de la más reciente a la más antigua', () => {
    expect(opcionesAccutab(LISTA, FILTRO_ACCUTAB_VACIO, 'semana')).toEqual(['2026-S43', '2026-S42', '2026-S36'])
  })
})

describe('contarFiltros', () => {
  it('cuenta cada filtro con algo y el rango como uno', () => {
    expect(contarFiltros(FILTRO_ACCUTAB_VACIO)).toBe(0)
    expect(contarFiltros({ ...FILTRO_ACCUTAB_VACIO, soldTo: ['A', 'B'], rango: { desde: 'a', hasta: 'b' } })).toBe(2)
  })
})

describe('exportar a Excel', () => {
  const detalle = (filas: Partial<CargaTrace['filas'][number]>[]) =>
    ({ filas: filas.map((f, i) => ({ ts: i, fecha: '2026-10-20', hora: '10:00:00', modo: null, ph: 7, mv: 650, temp: null, archivo: 'a.csv', desfase: 0, ...f })) }) as CargaTrace

  it('la BD de informes lleva una fila por carga con su semana y origen', () => {
    const filas = filasBdInformes(LISTA)
    expect(filas).toHaveLength(4)
    expect(filas[1]).toEqual(['2026-10-20', '2026-S43', 'DOLE', 'DOLE LONTUE', 'Línea 1', 'Equipo 1', 'Carga manual', 100, 'Sí', '2026-10-20_10-00-00'])
    expect(filas[3][6]).toBe('Correo')
    expect(filas[3][8]).toBe('No')
    expect(totalMediciones(LISTA)).toBe(300)
  })

  it('la BD de registros lleva una fila por medición con los datos de su informe', () => {
    const detalles = new Map([[LISTA[0].carpeta, detalle([{ ph: 6.5 }, { ph: 6.6, hora: '10:10:00' }])]])
    const filas = filasBdRegistros(LISTA, detalles)
    expect(filas).toHaveLength(3)
    expect(filas[1]).toEqual(['2026-10-20', '10:00:00', '2026-S43', 'DOLE', 'DOLE LONTUE', 'Línea 1', 'Equipo 1', 6.5, 650, null, 'a.csv', '2026-10-20_10-00-00'])
  })

  it('reunirDetalles pide todas las cargas, avisa el avance y falla si una falla', async () => {
    const avances: number[] = []
    const mapa = await reunirDetalles(LISTA, (c) => Promise.resolve(detalle([{}, {}]) && ({ ...detalle([{}]), carpeta: c }) as CargaTrace), (h) => avances.push(h))
    expect([...mapa.keys()].sort()).toEqual(LISTA.map((c) => c.carpeta).sort())
    expect(avances).toEqual([1, 2, 3])
    await expect(reunirDetalles(LISTA, () => Promise.reject(new Error('x')))).rejects.toThrow('x')
  })
})
