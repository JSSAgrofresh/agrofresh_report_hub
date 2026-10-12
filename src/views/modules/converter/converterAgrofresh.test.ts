/**
 * Formato nuevo del informe propio de AgroFresh («INFORME DE ANÁLISIS N° AGF2026-22»).
 * Como la prueba del lector de Quiteca, corre la lógica pura de
 * public/modules/converter.html con el texto de informes reales.
 */
import { describe, expect, it } from 'vitest'
import html from '../../../../public/modules/converter.html?raw'

const inicio = html.indexOf('/* Lógica del conversor')
const fin = html.indexOf('/* ============ interfaz')
const inicioFila = html.indexOf('// aFecha() deja las fechas')
const finFila = html.indexOf('async function llamarIngest')

interface Informe {
  datos: Record<string, unknown>
  avisos: string[]
  resultados: Record<string, unknown>
  sueltos: unknown[]
  revision: unknown[]
  dosis?: string
}
interface Lector {
  detectar: (texto: string) => string | null
  leerAgrofresh: (texto: string, inf: Informe) => void
  filaCruda: (inf: Informe) => Record<string, unknown>
}

function cargar(): Lector {
  const fuente = html.slice(inicio, fin) + '\n' + html.slice(inicioFila, finFila)
  return new Function(`${fuente}\nreturn { detectar, leerAgrofresh, filaCruda }`)() as Lector
}

const RYD = `INFORME DE ANÁLISIS N° AGF2026-22
Laboratorio de Cromatografía Emisión: 05-10-2026
Página 1 de 1
1. IDENTIFICACIÓN DE LA SOLICITUD Y DEL CLIENTE
N° SOLICITUD OT-AGF0058 FECHA SOLICITUD 30-09-2026
LABORATORIO AGROFRESH SOLICITANTE AGROFRESH
GENERADO POR Saul Ulloa EMAIL SOLICITANTE sulloa@agrofresh.com
SOLD TO AGROFRESH
SHIP TO LABORATORIO DE POSTCOSECHA
2. DATOS DE LA MUESTRA
ESPECIE Manzana VARIEDAD Rosy Glow
TIPO MUESTRA Fruta TIPO APLICACIÓN RYD
LÍNEA PROCESO CAMARA 5 POSICIÓN MUESTREO R2
PRODUCTO UTILIZADO — GASTO —
KILOS PROCESADOS — LOTE —
N° CÁMARA — N° ORDEN —
CÓDIGO PRODUCTOR — CÓDIGO PACKING —
CÓDIGO DE ENSAYO LACHL26PYRSMK01 N° ENSAYO 1
FECHA MUESTREO 30-09-2026 HORA MUESTREO —
MUESTREADOR OSVALDO MUÑOZ
OBSERVACIONES T2 R2 - CS(150) - PV -APP SMOKE
ANALITO SOLICITADO DOSIS ANALITO SOLICITADO DOSIS
Pirimetanil —
3. RECEPCIÓN Y ANÁLISIS
CÓD. INTERNO MUESTRA AGF0022 FECHA ANÁLISIS 02-10-2026
FECHA RECEPCIÓN —
OBSERVACIONES Sin observaciones.
4. MÉTODO DE ENSAYO
MÉTODO Determinación de fungicidas de postcosecha en fruta
TÉCNICA Cromatografía gaseosa con detector de nitrógeno-fósforo (GC-NPD)
5. RESULTADOS
Analito Resultado (mg/kg)
Pirimetanil 2,61
Resultados expresados en mg/kg (equivalente a ppm). Se informan solo los analitos solicitados. ND: no detectado.
DECLARACIONES
La muestra fue tomada y entregada al laboratorio por el cliente. Los resultados son válidos solo para la muestra analizada, tal como fue recibida.
Todos los ensayos fueron realizados en el Laboratorio de Cromatografía de AgroFresh, en la dirección indicada al pie de página.
Este informe no puede ser reproducido total o parcialmente sin autorización escrita del laboratorio.
Paz Salazar R.
Jefe de Laboratorio – Aprueba
AgroFresh Chile Comercial Limitada · Laboratorio de Cromatografía · Manuel Montt 4060, Parque Industrial km 90, Rancagua, Chile`

const LINEA = `INFORME DE ANÁLISIS N° AGF2026-24
Laboratorio de Cromatografía Emisión: 06-10-2026
Página 1 de 1
1. IDENTIFICACIÓN DE LA SOLICITUD Y DEL CLIENTE
N° SOLICITUD OT-AGF0079 FECHA SOLICITUD 02-10-2026
LABORATORIO AGROFRESH SOLICITANTE AGROFRESH
GENERADO POR Patricio Gamboa EMAIL SOLICITANTE patricio.gamboa@agrofresh.com
SOLD TO AGRICOLA SAN CLEMENTE LIMITADA
SHIP TO EXPORTADORA SAN CLEMENTE RENAICO
2. DATOS DE LA MUESTRA
ESPECIE Manzana VARIEDAD —
TIPO MUESTRA Fruta TIPO APLICACIÓN Línea de proceso
LÍNEA PROCESO B POSICIÓN MUESTREO Producto terminado
PRODUCTO UTILIZADO SHIELD BRITE FDL 230 SC (20L) GASTO —
KILOS PROCESADOS — LOTE —
N° CÁMARA — N° ORDEN —
CÓDIGO PRODUCTOR — CÓDIGO PACKING —
CÓDIGO DE ENSAYO — N° ENSAYO —
FECHA MUESTREO 30-09-2026 HORA MUESTREO 10:27
MUESTREADOR Patricio Gamboa
OBSERVACIONES Variedad jazz
ANALITO SOLICITADO DOSIS ANALITO SOLICITADO DOSIS
Fludioxonil —
3. RECEPCIÓN Y ANÁLISIS
CÓD. INTERNO MUESTRA AGF0024 FECHA ANÁLISIS 05-10-2026
FECHA RECEPCIÓN —
OBSERVACIONES Sin observaciones.
4. MÉTODO DE ENSAYO
MÉTODO Determinación de fungicidas de postcosecha en fruta
TÉCNICA Cromatografía gaseosa con detector de nitrógeno-fósforo (GC-NPD)
5. RESULTADOS
Analito Resultado (mg/kg)
Fludioxonil 0,23
Resultados expresados en mg/kg (equivalente a ppm). Se informan solo los analitos solicitados. ND: no detectado.
DECLARACIONES
La muestra fue tomada y entregada al laboratorio por el cliente. Los resultados son válidos solo para la muestra analizada, tal como fue recibida.
Todos los ensayos fueron realizados en el Laboratorio de Cromatografía de AgroFresh, en la dirección indicada al pie de página.
Este informe no puede ser reproducido total o parcialmente sin autorización escrita del laboratorio.
Paz Salazar R.
Jefe de Laboratorio – Aprueba
AgroFresh Chile Comercial Limitada · Laboratorio de Cromatografía · Manuel Montt 4060, Parque Industrial km 90, Rancagua, Chile`

function leer(texto: string) {
  const { leerAgrofresh, filaCruda } = cargar()
  const inf: Informe = { datos: {}, avisos: [], resultados: {}, sueltos: [], revision: [] }
  leerAgrofresh(texto, inf)
  return { inf, fila: filaCruda(inf) }
}

describe('informe propio de AgroFresh, formato nuevo', () => {
  it('se reconoce como AgroFresh', () => {
    expect(cargar().detectar(RYD)).toBe('AgroFresh')
    expect(cargar().detectar(LINEA)).toBe('AgroFresh')
  })

  it('RYD: lee identificación, muestra y tipo de aplicación', () => {
    const { datos } = leer(RYD).inf
    expect(datos['Laboratorio']).toBe('Agrofresh')
    expect(datos['N° Solicitud']).toBe('AGF2026-22')
    expect(datos['OT']).toBe('OT-AGF0058')
    expect(datos['Fecha Informe']).toBe('05-10-2026')
    expect(datos['Fecha Solicitud']).toBe('30-09-2026')
    expect(datos['Sold To']).toBe('AGROFRESH')
    expect(datos['Ship To']).toBe('LABORATORIO DE POSTCOSECHA')
    expect(datos['Especie']).toBe('Manzana')
    expect(datos['Variedad']).toBe('Rosy Glow')
    expect(datos['Tipo Aplicación']).toBe('RYD')
    expect(datos['Línea Proceso']).toBe('CAMARA 5')
    expect(datos['Posición Muestreo']).toBe('R2')
    expect(datos['Fecha Muestreo']).toBe('30-09-2026')
    expect(datos['Nombre Muestreador']).toBe('OSVALDO MUÑOZ')
    expect(datos['Generado Por']).toBe('Saul Ulloa')
    expect(datos['Email Solicitante']).toBe('sulloa@agrofresh.com')
    expect(datos['Observación']).toBe('T2 R2 - CS(150) - PV -APP SMOKE')
    expect(datos['Fecha Análisis']).toBe('02-10-2026')
  })

  it('«—» es sin dato y no se guarda', () => {
    const { datos } = leer(RYD).inf
    expect(datos['Producto Utilizado'] ?? null).toBeNull()
    expect(datos['Gasto'] ?? null).toBeNull()
    expect(datos['Fecha entrada'] ?? null).toBeNull()
    expect(datos['Hora Muestreo'] ?? null).toBeNull()
  })

  it('Línea de proceso: producto con espacios y paréntesis, hora y variedad vacía', () => {
    const { datos } = leer(LINEA).inf
    expect(datos['Tipo Aplicación']).toBe('Línea de proceso')
    expect(datos['Producto Utilizado']).toBe('SHIELD BRITE FDL 230 SC (20L)')
    expect(datos['Hora Muestreo']).toBe('10:27')
    expect(datos['Variedad'] ?? null).toBeNull()
    expect(datos['Línea Proceso']).toBe('B')
    expect(datos['Posición Muestreo']).toBe('Producto terminado')
    expect(datos['Sold To']).toBe('AGRICOLA SAN CLEMENTE LIMITADA')
    expect(datos['Ship To']).toBe('EXPORTADORA SAN CLEMENTE RENAICO')
  })

  it('lee el resultado con coma decimal', () => {
    expect(leer(RYD).inf.resultados).toEqual({ 'PYR ppm': '2,61' })
    expect(leer(LINEA).inf.resultados).toEqual({ 'FDL ppm': '0,23' })
  })

  it('manda al backend los nombres que el mapeo espera', () => {
    const { fila } = leer(LINEA)
    expect(fila['N° Solicitud']).toBe('OT-AGF0079')
    expect(fila['Informe']).toBe('AGF2026-24')
    expect(fila['Fecha Informe']).toBe('2026-10-06')
    expect(fila['TIPO APP']).toBe('Línea de proceso')
  })

  it('ND se conserva tal cual', () => {
    const nd = LINEA.replace('Fludioxonil 0,23', 'Fludioxonil ND')
    expect(leer(nd).inf.resultados).toEqual({ 'FDL ppm': 'ND' })
  })

  it('una observación con palabras de etiqueta no rompe las filas', () => {
    const raro = LINEA.replace('OBSERVACIONES Variedad jazz', 'OBSERVACIONES LOTE 5 GASTO alto')
    const { datos } = leer(raro).inf
    expect(datos['Observación']).toBe('LOTE 5 GASTO alto')
    expect(datos['Lote'] ?? null).toBeNull()
  })
})

describe('informe propio de AgroFresh, formato anterior', () => {
  it('sigue leyéndose con su lector de siempre', () => {
    const viejo = `INFORME 2026-1 Solicitud de Análisis N° OT-AGF0001
laboratorio@agrofresh.com
Fecha análisis 29 de septiembre de 2026
Cultivo: Manzana Tipo de análisis: Residuos
Variedad: Gala
Referencia/s de la muestra: LOTE 4
Resultados:
ANALITO mg/kg
Fludioxonil 0,5
Este informe`
    const { inf } = leer(viejo)
    expect(inf.datos['OT']).toBe('OT-AGF0001')
    expect(inf.datos['Fecha Análisis']).toBe('29-09-2026')
  })
})
