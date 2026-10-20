import { describe, expect, it } from 'vitest'
import { FILTROS_VACIOS } from './filtros'
import { colorEspecieMarca, columnasPorLaboratorio, informesConPuntos, laboratoriosDeInformes, tituloGrafico } from './graficoResiduales'
import type { Observacion } from './tipos'

function obs(p: Partial<Observacion>): Observacion {
  return {
    solicitudId: 1,
    nroSolicitud: 'A-1',
    ingrediente: 'FDL',
    ppm: 1,
    valorTexto: null,
    fecha: '2026-03-01',
    cliente: '',
    planta: '',
    tipoAplicacion: '',
    tipoServicio: '',
    posicionMuestreo: null,
    laboratorio: '',
    crop: '',
    variedad: '',
    semana: null,
    mes: null,
    ...p,
  } as Observacion
}

describe('tituloGrafico', () => {
  it('con los analitos graficados, nombra solo los que se dibujan', () => {
    const f = { ...FILTROS_VACIOS, ingredientes: ['IMZ', 'LEV', 'PEN', 'PYR', 'TBZ', 'ECOLI'] }
    expect(tituloGrafico(f, true, 'Residuales', ['IMZ', 'PYR', 'TBZ'])).toBe('Residuales - IMZ, PYR, TBZ')
    expect(tituloGrafico(f)).toBe('Residuales - IMZ, LEV, PEN, PYR, TBZ, ECOLI')
  })

  it('sin filtros es solo «Residuales»', () => {
    expect(tituloGrafico(FILTROS_VACIOS)).toBe('Residuales')
  })

  it('arma el título con lo filtrado, en orden', () => {
    const f = { ...FILTROS_VACIOS, cliente: 'Dole', planta: 'Lontué', tipoServicio: 'Actimist', crop: 'Manzana', ingredientes: ['Fludioxonil'] }
    expect(tituloGrafico(f)).toBe('Residuales - Dole Lontué - Actimist - Manzana - Fludioxonil')
  })

  it('en el portal de cliente no repite cliente ni sucursal', () => {
    const f = { ...FILTROS_VACIOS, cliente: 'Dole', crop: 'Manzana' }
    expect(tituloGrafico(f, false)).toBe('Residuales - Manzana')
  })
})

describe('informesConPuntos', () => {
  it('una columna por informe, aunque compartan fecha', () => {
    const lista = informesConPuntos([
      obs({ solicitudId: 2, nroSolicitud: 'A-2', ingrediente: 'FDL' }),
      obs({ solicitudId: 2, nroSolicitud: 'A-2', ingrediente: 'TBZ', ppm: 3 }),
      obs({ solicitudId: 1, nroSolicitud: 'A-1', ingrediente: 'FDL' }),
    ])
    expect(lista.map((i) => i.nroSolicitud)).toEqual(['A-1', 'A-2'])
    expect(lista[1].puntos).toHaveLength(2)
  })

  it('ignora resultados sin valor numérico y deja «sin fecha» al final', () => {
    const lista = informesConPuntos([
      obs({ solicitudId: 1, fecha: null }),
      obs({ solicitudId: 2, fecha: '2026-01-01' }),
      obs({ solicitudId: 3, ppm: null }),
    ])
    expect(lista.map((i) => i.solicitudId)).toEqual([2, 1])
  })
})

describe('colorEspecieMarca', () => {
  it('devuelve null pasada la paleta', () => {
    expect(colorEspecieMarca(0)).toBeTruthy()
    expect(colorEspecieMarca(99)).toBeNull()
  })
})

describe('curvas por laboratorio', () => {
  const informes = informesConPuntos([
    obs({ solicitudId: 1, nroSolicitud: 'A', laboratorio: 'Agrofresh', fecha: '2026-03-01', ingrediente: 'FDL' }),
    obs({ solicitudId: 2, nroSolicitud: 'B', laboratorio: 'Quiteca', fecha: '2026-03-02', ingrediente: 'FDL' }),
    obs({ solicitudId: 3, nroSolicitud: 'C', laboratorio: 'Agrofresh', fecha: '2026-03-03', ingrediente: 'FDL' }),
    obs({ solicitudId: 3, nroSolicitud: 'C', laboratorio: 'Agrofresh', fecha: '2026-03-03', ingrediente: 'IMZ', ppm: null }),
  ])

  it('reparte las columnas de un analito en una curva por laboratorio', () => {
    const g = columnasPorLaboratorio(informes, 'FDL')
    expect([...g.keys()].sort()).toEqual(['Laboratorio AgroFresh', 'Laboratorio Quiteca'])
    expect(g.get('Laboratorio AgroFresh')).toEqual([0, 2])
    expect(g.get('Laboratorio Quiteca')).toEqual([1])
  })

  it('no cuenta columnas donde el analito no trae valor', () => {
    expect(columnasPorLaboratorio(informes, 'IMZ').size).toBe(0)
  })

  it('lista los laboratorios presentes', () => {
    expect(laboratoriosDeInformes(informes)).toEqual(['Laboratorio AgroFresh', 'Laboratorio Quiteca'])
  })
})
