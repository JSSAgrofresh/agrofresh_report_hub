import { describe, expect, it } from 'vitest'
import {
  ESTADOS_DE_VISTA, FILTROS_VACIOS, chipsDeFiltros, filtrarSolicitudes, hayFiltros, opcionesDe, resumenVistas, vistaDeEstados,
} from './filtrosSolicitudes'
import type { EstadoFiltro, FiltrosSolicitudes, VistaRapida } from './filtrosSolicitudes'
import type { Solicitud } from './tipos'

function sol(n: string, extra: Partial<Solicitud> = {}): Solicitud {
  return {
    numero_solicitud: n,
    fecha_solicitud: '2026-09-30',
    laboratorio: 'QUITECA',
    sold_to: 'DOLE CHILE S.A.',
    ship_to: 'DOLE PLANTA CODEGUA',
    especie: 'Manzana',
    variedad: 'Gala',
    solicitante: 'X',
    generado_por: 'g',
    tipo_muestra: 'Fruta',
    nombre_muestreador: 'Ana',
    linea_proceso: null,
    campos_laboratorio: { 'Tipo Aplicación': 'Actimist' },
    enviada: false,
    sin_lista_distribucion: false,
    es_prueba: false,
    ...extra,
  } as Solicitud
}

const f = (extra: Partial<FiltrosSolicitudes>): FiltrosSolicitudes => ({ ...FILTROS_VACIOS, ...extra })
const numeros = (l: Solicitud[]) => l.map((s) => s.numero_solicitud)

const DATOS = [
  sol('A', { laboratorio: 'QUITECA', especie: 'Manzana' }),
  sol('B', { laboratorio: 'ALS', especie: 'Naranja', sold_to: 'MULTIFRUTA SA', ship_to: 'GESEX PLANTA FATIMA' }),
  sol('C', { laboratorio: 'DIAGNOFRUIT', especie: 'Palta', campos_laboratorio: { 'Tipo Aplicación': 'Línea de proceso' } }),
  sol('D', { laboratorio: 'QUITECA', especie: 'Palta', enviada: true, sin_lista_distribucion: true }),
]

describe('filtros de solicitudes con varias opciones', () => {
  it('sin nada marcado no filtra', () => {
    expect(filtrarSolicitudes(DATOS, FILTROS_VACIOS)).toHaveLength(4)
    expect(hayFiltros(FILTROS_VACIOS)).toBe(false)
  })

  it('dentro de un filtro vale cualquiera de los marcados', () => {
    expect(numeros(filtrarSolicitudes(DATOS, f({ laboratorio: ['QUITECA', 'ALS'] })))).toEqual(['A', 'B', 'D'])
    expect(numeros(filtrarSolicitudes(DATOS, f({ especie: ['Naranja', 'Palta'] })))).toEqual(['B', 'C', 'D'])
  })

  it('entre filtros distintos tienen que cumplirse todos', () => {
    const r = filtrarSolicitudes(DATOS, f({ laboratorio: ['QUITECA', 'ALS'], especie: ['Palta', 'Naranja'] }))
    expect(numeros(r)).toEqual(['B', 'D'])
  })

  it('tipo de aplicación y Sold To también aceptan varios', () => {
    expect(numeros(filtrarSolicitudes(DATOS, f({ tipoAplicacion: ['Línea de proceso'] })))).toEqual(['C'])
    expect(numeros(filtrarSolicitudes(DATOS, f({ soldTo: ['MULTIFRUTA SA', 'DOLE CHILE S.A.'] })))).toHaveLength(4)
  })

  it('Estado: Enviada y Pendiente son alternativas; Sin lista se suma como condición', () => {
    expect(numeros(filtrarSolicitudes(DATOS, f({ estado: ['enviada'] })))).toEqual(['D'])
    expect(numeros(filtrarSolicitudes(DATOS, f({ estado: ['pendiente'] })))).toEqual(['A', 'B', 'C'])
    expect(numeros(filtrarSolicitudes(DATOS, f({ estado: ['enviada', 'pendiente'] })))).toHaveLength(4)
    expect(numeros(filtrarSolicitudes(DATOS, f({ estado: ['sin_lista'] })))).toEqual(['D'])
    // Pendiente + Sin lista: las pendientes que van a Jorge y Claudia (ninguna acá).
    expect(filtrarSolicitudes(DATOS, f({ estado: ['pendiente', 'sin_lista'] }))).toHaveLength(0)
    expect(numeros(filtrarSolicitudes(DATOS, f({ estado: ['enviada', 'sin_lista'] })))).toEqual(['D'])
  })

  it('Estado: Con informe y Sin informe son alternativas y se suman al envío', () => {
    const inf = { nro_informe: '2026-1885-PC', numeros: ['2026-1885-PC'], pdf_guardado: true, en_report: true }
    const datos = [
      sol('A', { enviada: true, informe: inf }),
      sol('B', { enviada: true, informe: null }),
      sol('C', { enviada: false }),
    ]
    expect(numeros(filtrarSolicitudes(datos, f({ estado: ['con_informe'] })))).toEqual(['A'])
    expect(numeros(filtrarSolicitudes(datos, f({ estado: ['sin_informe'] })))).toEqual(['B', 'C'])
    expect(filtrarSolicitudes(datos, f({ estado: ['con_informe', 'sin_informe'] }))).toHaveLength(3)
    // Enviada + Sin informe: las que esperan el informe del laboratorio.
    expect(numeros(filtrarSolicitudes(datos, f({ estado: ['enviada', 'sin_informe'] })))).toEqual(['B'])
    expect(filtrarSolicitudes(datos, f({ estado: ['pendiente', 'con_informe'] }))).toHaveLength(0)
    // «Informe sin Report»: tiene PDF pero sus resultados no están en Report.
    const sinReport = sol('E', { enviada: true, informe: { ...inf, en_report: false } })
    expect(numeros(filtrarSolicitudes([...datos, sinReport], f({ estado: ['sin_report'] })))).toEqual(['E'])
    // El buscador también encuentra por N° de informe.
    expect(numeros(filtrarSolicitudes(datos, f({ busqueda: '1885-pc' })))).toEqual(['A'])
  })

  it('los filtros de texto siguen funcionando junto a las listas', () => {
    expect(numeros(filtrarSolicitudes(DATOS, f({ variedad: 'gal', laboratorio: ['ALS'] })))).toEqual(['B'])
    expect(numeros(filtrarSolicitudes(DATOS, f({ busqueda: 'multifruta' })))).toEqual(['B'])
    expect(numeros(filtrarSolicitudes(DATOS, f({ fechaDesde: '2026-10-01' })))).toEqual([])
  })

  it('Ship To ofrece solo las plantas de los clientes marcados', () => {
    expect(opcionesDe(DATOS, FILTROS_VACIOS).shipTo).toEqual(['DOLE PLANTA CODEGUA', 'GESEX PLANTA FATIMA'])
    expect(opcionesDe(DATOS, f({ soldTo: ['MULTIFRUTA SA'] })).shipTo).toEqual(['GESEX PLANTA FATIMA'])
    // Un Ship To ya marcado sigue ofrecido para poder desmarcarlo.
    expect(
      opcionesDe(DATOS, f({ soldTo: ['MULTIFRUTA SA'], shipTo: ['DOLE PLANTA CODEGUA'] })).shipTo,
    ).toEqual(['DOLE PLANTA CODEGUA', 'GESEX PLANTA FATIMA'])
  })

  it('hayFiltros detecta listas marcadas', () => {
    expect(hayFiltros(f({ laboratorio: ['ALS'] }))).toBe(true)
    expect(hayFiltros(f({ estado: ['sin_lista'] }))).toBe(true)
    expect(hayFiltros(f({ solicitante: '  ' }))).toBe(false)
  })
})

describe('vistas rápidas de Solicitudes e informes', () => {
  const inf = { nro_informe: 'X', numeros: ['X'], pdf_guardado: true, en_report: true }
  const datos = [
    sol('A', { enviada: false }),
    sol('B', { enviada: true }),
    sol('C', { enviada: true, informe: inf }),
    sol('D', { enviada: true, informe: { ...inf, en_report: false } }),
  ]

  it('cuenta cada vista', () => {
    expect(resumenVistas(datos)).toEqual({ todas: 4, pendientes: 1, enviadas: 3, esperando: 1, con_informe: 2, sin_report: 1 })
  })

  it('cada vista filtra lo mismo que cuenta', () => {
    const r = resumenVistas(datos)
    for (const [vista, estados] of Object.entries(ESTADOS_DE_VISTA) as [VistaRapida, EstadoFiltro[]][]) {
      expect(filtrarSolicitudes(datos, f({ estado: estados })), vista).toHaveLength(r[vista])
    }
  })

  it('reconoce la vista del filtro Estado, sin importar el orden', () => {
    expect(vistaDeEstados([])).toBe('todas')
    expect(vistaDeEstados(['sin_informe', 'enviada'])).toBe('esperando')
    expect(vistaDeEstados(['pendiente', 'sin_lista'])).toBeNull()
  })

  it('arma un chip por filtro puesto, sin el buscador', () => {
    const chips = chipsDeFiltros(f({ busqueda: 'dole', laboratorio: ['QUITECA', 'ALS'], estado: ['con_informe'], fechaDesde: '2026-10-01', prueba: 'sin' }))
    expect(chips.map((c) => c.texto)).toEqual([
      'Desde: 01-10-2026', 'Laboratorio: QUITECA, ALS', 'Estado: Con informe', 'Pruebas: sin las de prueba',
    ])
    expect(chipsDeFiltros(FILTROS_VACIOS)).toEqual([])
  })
})
