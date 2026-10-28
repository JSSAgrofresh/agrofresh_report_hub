/**
 * El informe de Diagnofruit con la cadena de la solicitud en el encabezado (formato nuevo, 28-10-2026): «Predio/planta» =
 * «Sold To // Ship To» y «Nombre de muestra» = la cadena. Es el mismo texto real (informe 253580, OT-DIAG0009) que prueba el
 * lector de Ingreso de Informes (`backend/tests/test_diagnofruit_lectura.py`): los dos lectores tienen que dar lo mismo.
 */
import { describe, expect, it } from 'vitest'
import html from '../../../../public/modules/converter.html?raw'
import TEXTO from '../../../../backend/tests/fixtures/correos/diagnofruit_253580.txt?raw'

const inicio = html.indexOf('/* Lógica del conversor')
const fin = html.indexOf('/* ============ interfaz')
const inicioFila = html.indexOf('// aFecha() deja las fechas')
const finFila = html.indexOf('async function llamarIngest')

interface Informe {
  laboratorio: string
  datos: Record<string, string>
  avisos: string[]
  resultados: Record<string, string>
}
const analizarVarios = new Function(
  'let fetch = null; const API_BASE = ""; const autorizacion = () => ({});' +
    'const APRENDIDAS = {}; const claveAprendida = () => "x"; const contextoDe = () => "";\n' +
    html.slice(inicio, fin) +
    '\n' +
    html.slice(inicioFila, finFila) +
    '\nreturn analizarVarios',
)() as (texto: string, nombre: string) => Informe[]

describe('Diagnofruit con la cadena de la solicitud en el encabezado', () => {
  const [inf, ...otros] = analizarVarios(TEXTO, '253580 - Agrofresh.pdf')
  const d = inf.datos

  it('es un solo informe y trae todo lo que necesita para cargarse', () => {
    expect(otros).toHaveLength(0)
    expect(d['OT']).toBe('OT-DIAG0009')
    expect(d['N° Solicitud']).toBe('253580')
    expect(d['Sold To']).toBe('THOMSEN CHILE SA')
    expect(d['Ship To']).toBe('THOMSEN CHILE SA LOS NICHES')
    expect(d['Especie']).toBe('Manzana')
    expect(d['Tipo Aplicación']).toBe('Línea de proceso')
    expect(d['Tipo de servicio']).toBe('Linea de Proceso')
    expect(d['Email Solicitante']).toBe('bfarias.agro@gmail.com') // venía en la segunda línea del PDF
    expect(d['Nombre Muestreador']).toBe('Barbara farias')
    expect(d['Línea Proceso']).toBe('1')
    expect(inf.avisos.filter((a) => a.startsWith('Sin dato'))).toEqual([])
  })

  it('el muestreo de la solicitud manda; la recepción viene como mes/día y se corrige', () => {
    expect(d['Fecha Muestreo']).toBe('22-10-2026')
    expect(d['Fecha entrada']).toBe('26-10-2026')
    expect(d['Fecha Análisis']).toBe('27-10-2026')
    expect(d['Fecha Informe']).toBe('28-10-2026')
    expect(inf.avisos.some((a) => a.includes('se usó el de la solicitud'))).toBe(true)
  })

  it('los resultados: no detectado queda como texto y el detectado como número', () => {
    expect(inf.resultados).toEqual({
      'Levaduras UFC/mL': 'BLD', 'Botrytis conidia/mL': 'BLD', 'Alternaria conidia/mL': 'BLD',
      'Geotrichum esporas/mL': '2,94', 'Penicillium conidia/mL': 'BLD',
    })
  })
})
