import { describe, expect, it } from 'vitest'
import {
  estadoDe,
  ordenarSolicitudes,
  porClienteYServicio,
  porGrupoYLaboratorio,
  porLaboratorio,
  resumenPorTipo,
  solicitudesACsv,
  tipoServicioDe,
  topClientesPorServicio,
  totales,
} from './resumen'
import type { SolicitudAuditoria } from './tipos'

function sol(extra: Partial<SolicitudAuditoria> = {}): SolicitudAuditoria {
  return {
    archivo: 'a.xlsx',
    numero_solicitud: 'OT-1',
    laboratorio: 'Quiteca',
    sold_to: 'Dole',
    ship_to: 'Codegua',
    especie: 'Cerezas',
    variedad: null,
    tipo_servicio: 'Actimist',
    analitos: ['FDL', 'PYR'],
    fecha_solicitud: null,
    fecha_muestreo: null,
    emitida_en: '2026-09-28T10:00:00',
    informe: null,
    en_report: false,
    concretada: false,
    ...extra,
  }
}

const informe = { id: 1, nro_informe: 'INF-7', nombre_archivo: 'x.pdf', ruta: 'Q/C/x.pdf', cargado_en: null, fecha_envio: null }
const concretada = () => sol({ informe, en_report: true, concretada: true })
const sinReport = () => sol({ informe })

describe('estadoDe', () => {
  it('concretada exige PDF y Report', () => expect(estadoDe(concretada())).toBe('concretada'))
  it('con PDF pero sin Report NO está concretada', () => expect(estadoDe(sinReport())).toBe('sin_report'))
  it('sin PDF está pendiente', () => expect(estadoDe(sol())).toBe('pendiente'))
})

describe('totales', () => {
  it('cuenta cada estado y el porcentaje', () => {
    expect(totales([concretada(), sinReport(), sol(), sol()])).toEqual({
      emitidas: 4, concretadas: 1, sinReport: 1, pendientes: 2, porcentajeConcretado: 25,
    })
  })
  it('sin solicitudes no divide por cero', () => expect(totales([]).porcentajeConcretado).toBe(0))
})

describe('porLaboratorio', () => {
  it('un resumen por laboratorio, en orden alfabético', () => {
    const r = porLaboratorio([
      sol({ laboratorio: 'Quiteca' }), concretada(), sol({ laboratorio: 'Diagnofruit' }),
      sol({ laboratorio: 'Diagnofruit', ...{ informe, en_report: true, concretada: true } }),
    ])
    expect(r.map((x) => [x.laboratorio, x.emitidas, x.concretadas])).toEqual([
      ['Diagnofruit', 2, 1], ['Quiteca', 2, 1],
    ])
    expect(r[0].porcentajeConcretado).toBe(50)
  })
  it('los estados suman el total de cada laboratorio', () => {
    const r = porLaboratorio([concretada(), sinReport(), sol(), sol()])[0]
    expect(r.concretadas + r.sinReport + r.pendientes).toBe(r.emitidas)
  })
  it('sin laboratorio se agrupa aparte', () => {
    expect(porLaboratorio([sol({ laboratorio: null }), sol({ laboratorio: '  ' })])).toHaveLength(1)
    expect(porLaboratorio([sol({ laboratorio: null })])[0].laboratorio).toBe('Sin laboratorio')
  })
  it('sin datos, nada', () => expect(porLaboratorio([])).toEqual([]))
})

describe('tipoServicioDe', () => {
  it('unifica las escrituras', () => {
    expect(tipoServicioDe(sol({ tipo_servicio: 'ACTIMIST' }))).toBe('Actimist')
    expect(tipoServicioDe(sol({ tipo_servicio: 'Linea de Proceso' }))).toBe('Línea de proceso')
    expect(tipoServicioDe(sol({ tipo_servicio: 'línea de proceso' }))).toBe('Línea de proceso')
  })
  it('RYD es un tipo propio (AgroFresh)', () => {
    expect(tipoServicioDe(sol({ tipo_servicio: 'RYD' }))).toBe('RYD')
    expect(tipoServicioDe(sol({ tipo_servicio: 'ryd' }))).toBe('RYD')
  })
  it('sin tipo o con uno nuevo', () => {
    expect(tipoServicioDe(sol({ tipo_servicio: null }))).toBe('Sin tipo')
    expect(tipoServicioDe(sol({ tipo_servicio: '  Cámara fría ' }))).toBe('Cámara fría')
  })
})

describe('resumenPorTipo', () => {
  it('cuenta solo las solicitudes de ese tipo, con sus estados', () => {
    const lista = [
      concretada(), sol(), sinReport(),
      sol({ tipo_servicio: 'Línea de proceso' }),
      sol({ tipo_servicio: 'LINEA DE PROCESO', informe, en_report: true, concretada: true }),
    ]
    expect(resumenPorTipo(lista, 'Actimist')).toMatchObject({ emitidas: 3, concretadas: 1, sinReport: 1, pendientes: 1 })
    expect(resumenPorTipo(lista, 'Línea de proceso')).toMatchObject({ emitidas: 2, concretadas: 1, pendientes: 1 })
  })
  it('un tipo sin solicitudes queda en cero', () => {
    expect(resumenPorTipo([concretada()], 'Línea de proceso')).toMatchObject({ emitidas: 0, porcentajeConcretado: 0 })
  })
})

describe('porClienteYServicio', () => {
  it('cuenta análisis e informes por cliente y tipo', () => {
    const r = porClienteYServicio([
      sol({ sold_to: 'Dole', tipo_servicio: 'Actimist', informe, en_report: true, concretada: true }),
      sol({ sold_to: 'Dole', tipo_servicio: 'Actimist' }),
      sol({ sold_to: 'Dole', tipo_servicio: 'Línea de proceso' }),
      sol({ sold_to: 'Agricom', tipo_servicio: 'Línea de proceso', informe, en_report: true, concretada: true }),
    ])
    expect(r[0]).toEqual({
      cliente: 'Dole', total: 3,
      tipos: { Actimist: { analisis: 2, informes: 1 }, 'Línea de proceso': { analisis: 1, informes: 0 } },
    })
    expect(r[1].tipos).toEqual({ 'Línea de proceso': { analisis: 1, informes: 1 } })
  })
  it('un PDF sin Report NO cuenta como informe', () => {
    expect(porClienteYServicio([sinReport()])[0].tipos.Actimist).toEqual({ analisis: 1, informes: 0 })
  })
  it('más solicitudes primero, y sin cliente aparte', () => {
    const r = porClienteYServicio([sol({ sold_to: 'A' }), sol({ sold_to: 'B' }), sol({ sold_to: 'B' }), sol({ sold_to: null })])
    expect(r.map((c) => c.cliente)).toEqual(['B', 'A', 'Sin cliente'])
  })
})

describe('topClientesPorServicio', () => {
  const lista = [
    sol({ sold_to: 'A', tipo_servicio: 'Actimist' }),
    sol({ sold_to: 'A', tipo_servicio: 'Actimist' }),
    sol({ sold_to: 'B', tipo_servicio: 'Línea de proceso' }),
    sol({ sold_to: 'B', tipo_servicio: 'Línea de proceso' }),
    sol({ sold_to: 'B', tipo_servicio: 'Línea de proceso' }),
    sol({ sold_to: 'C', tipo_servicio: 'Actimist' }),
  ]
  const nombres = (l: ReturnType<typeof topClientesPorServicio>) => l.map((c) => c.cliente)

  it('con ambos tipos ordena por la suma', () => {
    expect(nombres(topClientesPorServicio(lista, ['Actimist', 'Línea de proceso'], 0))).toEqual(['B', 'A', 'C'])
  })
  it('con un solo tipo, solo los que lo tienen y ordenados por él', () => {
    expect(nombres(topClientesPorServicio(lista, ['Actimist'], 0))).toEqual(['A', 'C'])
    expect(nombres(topClientesPorServicio(lista, ['Línea de proceso'], 0))).toEqual(['B'])
  })
  it('respeta el límite (0 = todos)', () => {
    expect(topClientesPorServicio(lista, ['Actimist', 'Línea de proceso'], 2)).toHaveLength(2)
    expect(topClientesPorServicio(lista, ['Actimist', 'Línea de proceso'], 0)).toHaveLength(3)
  })
})

describe('ordenarSolicitudes', () => {
  const a = sol({ numero_solicitud: 'OT-2' })
  const b = sol({ numero_solicitud: 'OT-10' })
  const vacia = sol({ numero_solicitud: null })

  it('ordena las OT de forma natural (OT-2 antes que OT-10)', () => {
    expect(ordenarSolicitudes([b, a], 'solicitud', 'asc').map((s) => s.numero_solicitud)).toEqual(['OT-2', 'OT-10'])
  })
  it('los vacíos van al final en ambos sentidos', () => {
    expect(ordenarSolicitudes([vacia, a, b], 'solicitud', 'asc').at(-1)).toBe(vacia)
    expect(ordenarSolicitudes([vacia, a, b], 'solicitud', 'desc').at(-1)).toBe(vacia)
  })
  it('por informe: los que no tienen quedan al final', () => {
    const con = concretada()
    expect(ordenarSolicitudes([sol(), con], 'informe', 'asc')[0]).toBe(con)
    expect(ordenarSolicitudes([sol(), con], 'informe', 'desc')[0]).toBe(con)
  })
  it('por estado: concretadas primero', () => {
    const c = concretada()
    expect(ordenarSolicitudes([sol(), c], 'estado', 'asc')[0]).toBe(c)
  })
  it('el orden de partida es por fecha de emisión', () => {
    const vieja = sol({ emitida_en: '2026-09-01T00:00:00' })
    const nueva = sol({ emitida_en: '2026-09-20T00:00:00' })
    expect(ordenarSolicitudes([vieja, nueva], 'emitida', 'desc')[0]).toBe(nueva)
  })
  it('no muta la lista original', () => {
    const lista = [b, a]
    ordenarSolicitudes(lista, 'solicitud', 'asc')
    expect(lista[0]).toBe(b)
  })
})

describe('solicitudesACsv', () => {
  it('trae BOM, separador ; y las columnas de la tabla', () => {
    const csv = solicitudesACsv([concretada()])
    const [cab, fila] = csv.split('\r\n')
    expect(cab.startsWith('﻿Laboratorio;Solicitud;N° informe;Cliente;Planta;Tipo de análisis;Analitos;Estado')).toBe(true)
    expect(fila).toContain('Quiteca;OT-1;INF-7;Dole;Codegua;Actimist;FDL, PYR;Concretada')
  })
  it('el estado es concretada o no; el PDF sin Report se aclara', () => {
    expect(solicitudesACsv([sol()])).toContain(';Pendiente;')
    expect(solicitudesACsv([sinReport()])).toContain(';Pendiente (PDF sin Report);')
  })
  it('escapa comillas y separadores', () => {
    expect(solicitudesACsv([sol({ sold_to: 'Dole; "Chile"' })])).toContain('"Dole; ""Chile"""')
  })
  it('no queda nada de demora', () => {
    expect(solicitudesACsv([sol()]).toLowerCase()).not.toContain('demora')
  })
})

describe('porGrupoYLaboratorio', () => {
  const lista = [
    sol({ laboratorio: 'Quiteca', sold_to: 'Dole', informe, en_report: true, concretada: true }),
    sol({ laboratorio: 'QUITECA', sold_to: 'Dole' }),
    sol({ laboratorio: 'Agrofresh', sold_to: 'Dole', concretada: true }),
    sol({ laboratorio: 'ALS', sold_to: 'Copefrut' }),
    sol({ laboratorio: 'Otro lab', sold_to: 'Copefrut' }),
  ]

  it('cuenta análisis e informes por laboratorio, sin importar mayúsculas', () => {
    const [dole] = porGrupoYLaboratorio(lista, 'cliente', 0)
    expect(dole.grupo).toBe('Dole')
    expect(dole.total).toBe(3)
    expect(dole.labs.QUITECA).toEqual({ analisis: 2, informes: 1 })
    expect(dole.labs.AGROFRESH).toEqual({ analisis: 1, informes: 1 })
  })

  it('deja fuera los laboratorios que no son los cuatro', () => {
    const grupos = porGrupoYLaboratorio(lista, 'cliente', 0)
    expect(grupos.find((g) => g.grupo === 'Copefrut')?.total).toBe(1)
  })

  it('agrupa por Ship To con su Sold To al lado', () => {
    const [g] = porGrupoYLaboratorio([sol({ ship_to: 'Chillán', sold_to: 'Dole' })], 'planta', 0)
    expect(g.grupo).toBe('Chillán · Dole')
  })

  it('agrupa por especie y por tipo de servicio, y respeta el límite', () => {
    expect(porGrupoYLaboratorio(lista, 'especie', 0)[0].grupo).toBe('Cerezas')
    expect(porGrupoYLaboratorio(lista, 'tipo', 0)[0].grupo).toBe('Actimist')
    expect(porGrupoYLaboratorio(lista, 'cliente', 1)).toHaveLength(1)
  })
})
