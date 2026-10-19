import { describe, expect, it } from 'vitest'
import { construirInformes, esDetectado } from './informesPorLab'
import type { Analito, Observacion } from './tipos'

const o = (p: Partial<Observacion>): Observacion => ({
  solicitudId: 1, nroSolicitud: '496561', ingrediente: 'COLT', ppm: null, valorTexto: null, fecha: '2026-10-01T00:00:00Z',
  cliente: null, planta: null, tipoAplicacion: null, tipoServicio: null, posicionMuestreo: null, laboratorio: 'ALS (Corthon)',
  crop: null, variedad: null, semana: null, mes: null, ...p,
})

describe('esDetectado', () => {
  it('número mayor que cero sí; cero, «<1», «ND» y «BLD» no; «>100» y «Presente» sí', () => {
    expect(esDetectado(o({ ppm: 41 }))).toBe(true)
    expect(esDetectado(o({ ppm: 0 }))).toBe(false)
    expect(esDetectado(o({ valorTexto: '<1' }))).toBe(false)
    expect(esDetectado(o({ valorTexto: 'ND' }))).toBe(false)
    expect(esDetectado(o({ valorTexto: 'BLD' }))).toBe(false)
    expect(esDetectado(o({ valorTexto: '>100' }))).toBe(true)
    expect(esDetectado(o({ valorTexto: 'Presente' }))).toBe(true)
    expect(esDetectado(undefined)).toBe(false)
  })
})

describe('construirInformes', () => {
  const filas: Observacion[] = [
    o({ solicitudId: 1, nroSolicitud: '496251', ingrediente: 'ECOLI', ppm: 50 }),
    o({ solicitudId: 1, nroSolicitud: '496251', ingrediente: 'COLT', ppm: 67 }),
    o({ solicitudId: 2, nroSolicitud: '496563', ingrediente: 'COLT', valorTexto: '<1', fecha: '2026-10-30' }),
    o({ solicitudId: 3, nroSolicitud: '253521-DIAG0003', ingrediente: 'LEV', valorTexto: '>100', laboratorio: 'Diagnofruit', posicionMuestreo: 'Pozo vaciado' }),
    o({ solicitudId: 4, nroSolicitud: '496000', ingrediente: null }), // solicitud sin resultados
    o({ solicitudId: 5, nroSolicitud: 'Q-1', ingrediente: 'FDL', ppm: 2, laboratorio: 'Quiteca' }),
  ]

  it('arma un informe por solicitud de ESE laboratorio y deja afuera a los demás', () => {
    expect(construirInformes(filas, 'als', []).map((i) => i.nro)).toEqual(['496563', '496251'])
    expect(construirInformes(filas, 'diagnofruit', []).map((i) => i.nro)).toEqual(['253521-DIAG0003'])
  })

  it('los analitos de un informe van en su orden fijo, con su nombre y unidad, aunque lleguen al revés', () => {
    const informe = construirInformes(filas, 'als', []).find((i) => i.nro === '496251')!
    expect(informe.resultados.map((r) => [r.nombre, r.unidad, r.texto])).toEqual([
      ['Coliformes Totales', 'UFC/100 mL', '67'],
      ['Escherichia coli', 'UFC/100 mL', '50'],
    ])
    expect(informe.fecha).toBe('2026-10-01')
  })

  it('«<1» queda como texto y no detectado; el número, detectado y con su valor', () => {
    const [nuevo, medio] = construirInformes(filas, 'als', [])
    expect(nuevo.resultados[0]).toMatchObject({ texto: '<1', valor: null, detectado: false })
    expect(medio.resultados[0]).toMatchObject({ texto: '67', valor: 67, detectado: true })
  })

  it('«>100» de Diagnofruit se toma como detectado con valor 100, y la posición queda como detalle', () => {
    const [d] = construirInformes(filas, 'diagnofruit', [])
    expect(d.resultados[0]).toMatchObject({ nombre: 'Levaduras', unidad: 'UFC/mL', texto: '>100', valor: 100, detectado: true })
    expect(d.detalle).toBe('Pozo vaciado')
  })

  it('un analito que la tabla fija no conoce toma su nombre y unidad del catálogo, y si no, su código', () => {
    const catalogo = [{ codigo: 'XYZ', nombre: 'Analito raro', unidad: 'mg/L', laboratorio: 'Als' }] as Analito[]
    const f = [o({ ingrediente: 'XYZ', ppm: 3 }), o({ solicitudId: 2, nroSolicitud: '2', ingrediente: 'QQQ', ppm: 1 })]
    const r = construirInformes(f, 'als', catalogo)
    const [a, b] = r.flatMap((i) => i.resultados)
    expect([a, b].map((x) => [x.codigo, x.nombre, x.unidad]).sort()).toEqual([['QQQ', 'QQQ', ''], ['XYZ', 'Analito raro', 'mg/L']])
  })

  it('sin filas no falla', () => {
    expect(construirInformes([], 'als', [])).toEqual([])
  })
})
