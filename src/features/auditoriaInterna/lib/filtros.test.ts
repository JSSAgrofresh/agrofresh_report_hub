import { describe, expect, it } from 'vitest'
import { FILTROS_VACIOS, camposTituloTabla, chipsDeFiltros, contarFiltros, filtrarSolicitudes, opcionesDeFiltros } from './filtros'
import type { FiltrosSolicitudes } from './filtros'
import type { SolicitudAuditoria } from './tipos'

function sol(extra: Partial<SolicitudAuditoria> = {}): SolicitudAuditoria {
  return {
    archivo: 'a.xlsx', numero_solicitud: 'OT-1', laboratorio: 'Quiteca', sold_to: 'Dole Chile S.A.',
    ship_to: 'Dole Codegua', especie: 'Cerezas', variedad: 'Bing', tipo_servicio: 'Actimist',
    analitos: ['FDL'], fecha_solicitud: null, fecha_muestreo: null, emitida_en: '2026-09-10T10:00:00',
    informe: null, en_report: false, concretada: false, ...extra,
  }
}
const informe = { id: 1, nro_informe: 'INF-7', nombre_archivo: 'x.pdf', ruta: 'r', cargado_en: null, fecha_envio: null }
const f = (extra: Partial<FiltrosSolicitudes>): FiltrosSolicitudes => ({ ...FILTROS_VACIOS, ...extra })

const lista = [
  sol({ archivo: '1' }),
  sol({ archivo: '2', laboratorio: 'Diagnofruit', sold_to: 'Agricom', ship_to: 'Agricom Sur', tipo_servicio: 'Línea de Proceso', analitos: ['BOT', 'ALT'], especie: 'Uvas', variedad: 'Thompson', emitida_en: '2026-09-20T09:00:00' }),
  sol({ archivo: '3', informe, en_report: true, concretada: true, emitida_en: '2026-10-02T09:00:00' }),
]
const ids = (l: SolicitudAuditoria[]) => l.map((s) => s.archivo)

describe('filtrarSolicitudes', () => {
  it('sin filtros devuelve todo', () => expect(ids(filtrarSolicitudes(lista, FILTROS_VACIOS))).toEqual(['1', '2', '3']))

  it('cada filtro por su cuenta', () => {
    expect(ids(filtrarSolicitudes(lista, f({ laboratorio: 'diagnofruit' })))).toEqual(['2'])
    expect(ids(filtrarSolicitudes(lista, f({ cliente: 'AGRICOM' })))).toEqual(['2'])
    expect(ids(filtrarSolicitudes(lista, f({ planta: 'Dole Codegua' })))).toEqual(['1', '3'])
    expect(ids(filtrarSolicitudes(lista, f({ tipo: 'Línea de proceso' })))).toEqual(['2'])
    expect(ids(filtrarSolicitudes(lista, f({ especie: 'uvas' })))).toEqual(['2'])
    expect(ids(filtrarSolicitudes(lista, f({ variedad: 'Thompson' })))).toEqual(['2'])
  })

  it('analitos: pasa si pidió al menos uno', () => {
    expect(ids(filtrarSolicitudes(lista, f({ analitos: ['FDL'] })))).toEqual(['1', '3'])
    expect(ids(filtrarSolicitudes(lista, f({ analitos: ['ALT', 'FDL'] })))).toEqual(['1', '2', '3'])
    expect(ids(filtrarSolicitudes(lista, f({ analitos: ['PYR'] })))).toEqual([])
  })

  it('rango de fechas de emisión, con los extremos incluidos', () => {
    expect(ids(filtrarSolicitudes(lista, f({ rango: { desde: '2026-09-10', hasta: '2026-09-20' } })))).toEqual(['1', '2'])
    expect(ids(filtrarSolicitudes(lista, f({ rango: { desde: '2026-10-01', hasta: '2026-10-31' } })))).toEqual(['3'])
  })

  it('una solicitud sin fecha no pasa un filtro de fechas', () => {
    const sinFecha = sol({ archivo: '9', emitida_en: null, fecha_solicitud: null })
    expect(filtrarSolicitudes([sinFecha], f({ rango: { desde: '2026-01-01', hasta: '2026-12-31' } }))).toEqual([])
  })

  it('estado, y se puede ignorar para los conteos de la tabla', () => {
    expect(ids(filtrarSolicitudes(lista, f({ estado: 'concretada' })))).toEqual(['3'])
    expect(ids(filtrarSolicitudes(lista, f({ estado: 'concretada' }), { estado: true }))).toEqual(['1', '2', '3'])
  })

  it('sin fecha de envío: solo informes que no la tienen', () => {
    expect(ids(filtrarSolicitudes(lista, f({ sinEnvio: true })))).toEqual(['3'])
    const conEnvio = sol({ archivo: '4', informe: { ...informe, fecha_envio: '2026-10-05T10:00:00Z' } })
    expect(filtrarSolicitudes([conEnvio], f({ sinEnvio: true }))).toEqual([])
  })

  it('el texto busca sin tildes ni mayúsculas en varias columnas', () => {
    expect(ids(filtrarSolicitudes(lista, f({ texto: 'linea de proceso' })))).toEqual(['2'])
    expect(ids(filtrarSolicitudes(lista, f({ texto: 'inf-7' })))).toEqual(['3'])
    expect(ids(filtrarSolicitudes(lista, f({ texto: 'bot' })))).toEqual(['2'])
  })

  it('los filtros se combinan (Y)', () => {
    expect(ids(filtrarSolicitudes(lista, f({ planta: 'Dole Codegua', estado: 'pendiente' })))).toEqual(['1'])
    expect(filtrarSolicitudes(lista, f({ laboratorio: 'Quiteca', cliente: 'Agricom' }))).toEqual([])
  })
})

describe('contarFiltros y chips', () => {
  it('cuenta los puestos', () => {
    expect(contarFiltros(FILTROS_VACIOS)).toBe(0)
    expect(contarFiltros(f({ texto: '  ', laboratorio: 'Quiteca', analitos: ['A', 'B'], sinEnvio: true }))).toBe(3)
  })
  it('un chip por filtro puesto', () => {
    const chips = chipsDeFiltros(f({ cliente: 'Dole', estado: 'sin_report', rango: { desde: '2026-09-01', hasta: '2026-09-30' } }))
    expect(chips.map((c) => c.clave)).toEqual(['cliente', 'estado', 'rango'])
    expect(chips[1].texto).toBe('Estado: PDF sin Report')
  })
})

describe('opcionesDeFiltros', () => {
  it('saca las opciones de los datos, sin repetir y ordenadas', () => {
    const o = opcionesDeFiltros(lista, FILTROS_VACIOS)
    expect(o.laboratorios).toEqual(['Diagnofruit', 'Quiteca'])
    expect(o.tipos).toEqual(['Actimist', 'Línea de proceso'])
    expect(o.analitos).toEqual(['ALT', 'BOT', 'FDL'])
  })
  it('las plantas se acotan al cliente elegido y las variedades a la especie', () => {
    const o = opcionesDeFiltros(lista, f({ cliente: 'Agricom', especie: 'Uvas' }))
    expect(o.plantas).toEqual(['Agricom Sur'])
    expect(o.variedades).toEqual(['Thompson'])
    expect(opcionesDeFiltros(lista, FILTROS_VACIOS).plantas).toEqual(['Agricom Sur', 'Dole Codegua'])
  })
})

describe('camposTituloTabla', () => {
  it('sin filtros, cada campo dice «Todos»', () => {
    expect(camposTituloTabla(FILTROS_VACIOS)).toEqual([
      'Todos los clientes', 'Todas las sucursales', 'Todos los laboratorios', 'Todos los tipos de servicio',
      'Todas las fechas', 'Todas las especies', 'Todas las variedades', 'Todos los analitos',
    ])
  })

  it('con filtros, cada campo muestra lo elegido y el resto sigue en «Todos»', () => {
    const campos = camposTituloTabla({
      ...FILTROS_VACIOS, cliente: 'Dole', laboratorio: 'ALS', analitos: ['FDL', 'PYR'],
      rango: { desde: '2026-09-01', hasta: '2026-09-30' },
    })
    expect(campos[0]).toBe('Dole')
    expect(campos[1]).toBe('Todas las sucursales')
    expect(campos[2]).toBe('ALS')
    expect(campos[4]).toBe('Emitidas del 2026-09-01 al 2026-09-30')
    expect(campos[7]).toBe('FDL, PYR')
  })
})
