import { describe, expect, it } from 'vitest'
import { FILTROS_VACIOS } from './filtros'
import { colorEspecieMarca, informesConPuntos, tituloGrafico } from './graficoResiduales'
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
