/**
 * Los dos reportes REALES de Diagnofruit de octubre 2026 (253521 con 4 muestras y 253522 con 2), con el texto que
 * arma el Converter al leer el PDF. Fijan el estándar para cargarlos como vienen:
 *  - cada muestra es un informe, y su OT sale de «Nombre de muestra» (M1 - DIAG0003 → OT-DIAG0003);
 *  - del PDF solo se toman la OT, los resultados y las fechas del informe (muestreo, recepción, ejecución, informe);
 *  - Sold To, Ship To, especie y posición salen de la solicitud, no de lo que escribe Diagnofruit.
 */
import { describe, expect, it } from 'vitest'
import html from '../../../../public/modules/converter.html?raw'
import { REPORTE_253521, REPORTE_253522 } from './diagnofruitPdfjs.fixture'

const inicio = html.indexOf('/* Lógica del conversor')
const fin = html.indexOf('/* ============ interfaz')
const inicioFila = html.indexOf('// aFecha() deja las fechas')
const finFila = html.indexOf('async function llamarIngest')

interface Informe {
  archivo: string
  laboratorio: string
  datos: Record<string, string>
  avisos: string[]
  resultados: Record<string, string>
  parteDe?: string
}
interface Lector {
  analizarVarios: (texto: string, nombre: string) => Informe[]
  completarDesdeSolicitud: (inf: Informe) => Promise<void>
  setFetch: (f: (url: string) => Promise<unknown>) => void
}
function cargar(): Lector {
  const interfaz = 'let fetch = null; const API_BASE = ""; const autorizacion = () => ({});' +
    'const APRENDIDAS = {}; const claveAprendida = () => "x"; const contextoDe = () => "";'
  const fuente = interfaz + '\n' + html.slice(inicio, fin) + '\n' + html.slice(inicioFila, finFila)
  return new Function(`${fuente}\nreturn { analizarVarios, completarDesdeSolicitud, setFetch: (f) => { fetch = f } }`)() as Lector
}
const L = cargar()

describe('reporte 253521 (4 muestras)', () => {
  const infs = L.analizarVarios(REPORTE_253521, '253521 - Agrofresh.pdf')

  it('cada muestra es un informe, con su OT; la página de observaciones no cuenta', () => {
    expect(infs).toHaveLength(4)
    expect(infs.map((i) => i.datos['OT'])).toEqual(['OT-DIAG0003', 'OT-DIAG0004', 'OT-DIAG0005', 'OT-DIAG0006'])
    expect(infs.map((i) => i.datos['N° Solicitud'])).toEqual([
      '253521-DIAG0003', '253521-DIAG0004', '253521-DIAG0005', '253521-DIAG0006',
    ])
    expect(infs.every((i) => i.parteDe === '253521 - Agrofresh.pdf')).toBe(true)
  })

  it('cada muestra trae SUS resultados, tal como están en el PDF', () => {
    expect(infs.map((i) => i.resultados)).toEqual([
      { 'Levaduras UFC/mL': '>100', 'Botrytis conidia/mL': '4,66', 'Alternaria conidia/mL': 'BLD', 'Geotrichum esporas/mL': '49,91', 'Penicillium conidia/mL': 'BLD' },
      { 'Levaduras UFC/mL': '>100', 'Botrytis conidia/mL': '4,24', 'Alternaria conidia/mL': 'BLD', 'Geotrichum esporas/mL': '114,02', 'Penicillium conidia/mL': 'BLD' },
      { 'Levaduras UFC/mL': '>100', 'Botrytis conidia/mL': '9,15', 'Alternaria conidia/mL': 'BLD', 'Geotrichum esporas/mL': '49,23', 'Penicillium conidia/mL': 'BLD' },
      { 'Levaduras UFC/mL': 'BLD', 'Botrytis conidia/mL': 'BLD', 'Alternaria conidia/mL': 'BLD', 'Geotrichum esporas/mL': '6,22', 'Penicillium conidia/mL': 'BLD' },
    ])
  })

  it('las fechas son las del informe: muestreo, recepción, ejecución (análisis) e informe', () => {
    infs.slice(0, 3).forEach((i) =>
      expect(i.datos).toMatchObject({
        'Fecha Muestreo': '01-10-2026',
        'Fecha entrada': '01-10-2026', // el PDF escribe 10/1/2026 (mes/día): no puede ser antes del muestreo
        'Fecha Análisis': '02-10-2026',
        'Fecha Informe': '08-10-2026',
      }),
    )
  })

  it('Sold To, Ship To, especie y posición NO salen del PDF: quedan para la solicitud, y la planta como pista', () => {
    infs.forEach((i) => {
      expect(i.datos['Sold To']).toBeUndefined()
      expect(i.datos['Ship To']).toBeUndefined()
      expect(i.datos['Especie']).toBeUndefined() // el PDF dice «AGUA»: no es la especie de la fruta
      expect(i.datos['Posición Muestreo']).toBeUndefined() // «M1» es el nombre de la muestra, no el lugar
      expect(i.datos['Tipo Muestra']).toBe('Agua')
    })
    expect(infs[0].datos['Observación']).toContain('Muestra: M1 - DIAG0003')
    expect(infs[0].datos['Observación']).toContain('Planta según Diagnofruit: Gesex Planta Fátima')
  })
})

describe('reporte 253522 (2 muestras)', () => {
  const infs = L.analizarVarios(REPORTE_253522, '253522 - Agrofresh.pdf')

  it('dos informes, DIAG0007 y DIAG0008, cada uno con sus resultados', () => {
    expect(infs.map((i) => i.datos['OT'])).toEqual(['OT-DIAG0007', 'OT-DIAG0008'])
    expect(infs[0].resultados['Botrytis conidia/mL']).toBe('5,2')
    expect(infs[1].resultados['Geotrichum esporas/mL']).toBe('7,2')
    expect(infs[1].resultados['Botrytis conidia/mL']).toBe('BLD')
  })
})

describe('con la solicitud (por la OT)', () => {
  const solicitud = (campos: Record<string, string>) => ({ ok: true, status: 200, json: async () => ({ campos, analitos_solicitados: [], fecha_recepcion: null }) })

  it('Sold To, Ship To, especie, variedad y posición vienen de la solicitud; las fechas siguen siendo las del informe', async () => {
    const inf = L.analizarVarios(REPORTE_253521, '253521.pdf')[0]
    let url = ''
    L.setFetch(async (u) => {
      url = u
      return solicitud({
        'Sold To (Nombre)': 'GREENEX', 'Ship To (Nombre)': 'GREENEX PLANTA FATIMA', Especie: 'Manzana', Variedad: 'Gala',
        'Posición Muestreo': 'Pozo vaciado', 'Tipo Aplicación': 'Línea de proceso', 'Fecha Muestreo': '01-10-2026',
      })
    })
    await L.completarDesdeSolicitud(inf)
    expect(url).toBe('/emitir/cromatografia/solicitud-ot/OT-DIAG0003')
    expect(inf.datos).toMatchObject({
      'Sold To': 'GREENEX', 'Ship To': 'GREENEX PLANTA FATIMA', Especie: 'Manzana', Variedad: 'Gala',
      'Posición Muestreo': 'Pozo vaciado', 'Tipo de servicio': 'Linea de Proceso',
      'Fecha Análisis': '02-10-2026', 'Fecha Informe': '08-10-2026',
    })
    expect(inf.avisos.join(' ')).not.toContain('Sin dato para')
  })

  it('si la solicitud no existe, avisa y deja Sold To, Ship To y especie para elegir a mano', async () => {
    const inf = L.analizarVarios(REPORTE_253522, '253522.pdf')[1]
    L.setFetch(async () => ({ ok: false, status: 404, json: async () => ({}) }))
    await L.completarDesdeSolicitud(inf)
    expect(inf.avisos.join(' ')).toMatch(/No se encontró la solicitud OT-DIAG0008/)
    expect(inf.datos['Sold To']).toBeUndefined()
  })
})

describe('la OT dentro del informe', () => {
  it('si el nombre de la muestra no la trae, se busca en la página', () => {
    const t = REPORTE_253522.replace('Nombre de muestra: M1 - DIAG0007', 'Nombre de muestra: M1 - Codegua Pozo\nObs: OT-DIAG0007')
    expect(L.analizarVarios(t, 'x.pdf')[0].datos['OT']).toBe('OT-DIAG0007')
  })

  it('una muestra sin código DIAG queda sin OT y se avisa (no se inventa)', async () => {
    const t = REPORTE_253522.replace(/DIAG0007/g, 'XX').replace(/DIAG0008/g, 'YY')
    const inf = L.analizarVarios(t, 'x.pdf')[0]
    expect(inf.datos['OT']).toBeUndefined()
    await L.completarDesdeSolicitud(inf)
    expect(inf.avisos.join(' ')).toMatch(/no trae el N° de solicitud/)
  })
})
