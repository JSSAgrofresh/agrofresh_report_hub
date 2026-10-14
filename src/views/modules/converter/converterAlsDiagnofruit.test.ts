/**
 * Lectores de ALS (Corthorn) y Diagnofruit de public/modules/converter.html.
 *
 * OJO: los textos de abajo NO son PDF reales: se armaron con el formato que cada lector espera (sus
 * etiquetas y sus filas). Sirven para fijar la lógica (unidades de agua y de alimento, columnas que
 * recibe el backend), no para asegurar que un PDF nuevo se lea. Cuando llegue un informe real de cada
 * laboratorio, hay que pegar su texto aquí y ajustar el lector si algo no calza.
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
}
interface Lector {
  detectar: (texto: string) => string | null
  leerCorthorn: (texto: string, inf: Informe) => void
  leerDiagnofruit: (texto: string, inf: Informe) => void
  filaCruda: (inf: Informe) => Record<string, unknown>
  mapearAnalito: (nombre: string, unidad?: string) => string | null
}

function cargar(): Lector {
  const fuente = html.slice(inicio, fin) + '\n' + html.slice(inicioFila, finFila)
  return new Function(
    `${fuente}\nreturn { detectar, leerCorthorn, leerDiagnofruit, filaCruda, mapearAnalito }`,
  )() as Lector
}
const nuevo = (): Informe => ({ datos: {}, avisos: [], resultados: {}, sueltos: [], revision: [] })

const ALS = `LABORATORIO CROMATOGRAFÍA
INFORME DE ANALISIS N° 4521
Solicitante : SOCIEDAD AGRICOLA EL PORVENIR
Contacto : Maria Perez
Tipo de Muestras : Cereza
Fecha y Hora de Ingreso 24/09/2026 10:30
Identificación Muestra (NI) 32401 1112 Muestra de agua, línea 3, 22/09/2026
N° Metodología
Parámetro Unidad LC LQ Resultado
Plomo mg/kg 0,01 0,03 ND
Mercurio mg/kg 0,005 0,01 0,02
E. coli UFC/100 mL 1 1 <1
Coliformes Totales UFC/100 mL 1 1 12
Hongos UFC/g 10 10 150
Escherichia coli UFC/g 10 10 <10
Coliformes Totales UFC/g 10 10 40
`

const DIAGNO = `Diagnofruit Laboratorio
Reporte número: 77123
Cliente: Frutizano SpA
Predio/planta: Planta Rancagua
Especie: Cereza
Variedad: No aplica
Tipo de muestra: Agua de proceso
Fecha de muestreo: 22/09/2026
Fecha de recepción: 23/09/2026
Análisis realizado: Cuantificación de patógenos
Nombre de muestra: M1 - Frutizano - Pozo vaciado
Patógeno resultado unidad
Botrytis 120 conidia/mL
Levaduras BLD UFC/mL
Alternaria 15 conidia/mL
Nivel de contaminación: bajo
`

describe('ALS (Corthorn)', () => {
  const L = cargar()
  it('se reconoce y lee los datos generales', () => {
    expect(L.detectar(ALS)).toBe('ALS (Corthon)')
    const inf = nuevo()
    L.leerCorthorn(ALS, inf)
    expect(inf.datos['Laboratorio']).toBe('ALS (Corthon)')
    expect(inf.datos['Sold To']).toBe('SOCIEDAD AGRICOLA EL PORVENIR')
    expect(inf.datos['Especie']).toBe('Cereza')
    expect(inf.datos['N° Solicitud']).toBe('324011112')
  })

  it('agua (UFC/100 mL) y alimento (UFC/g) van a columnas distintas aunque el nombre sea igual', () => {
    const inf = nuevo()
    L.leerCorthorn(ALS, inf)
    expect(inf.resultados).toMatchObject({
      'Plomo mg/kg': 'ND',
      'Mercurio mg/kg': '0,02',
      'E. Coli UFC/100mL': '<1',
      'Coliformes Totales UFC/100mL': '12',
      'Hongos UFC/g': '150',
      'Escherichia coli UFC/g': '<10',
      'Coliformes Totales UFC/g': '40',
    })
    expect(inf.sueltos).toEqual([])
  })

  it('sin unidad, el nombre decide como siempre', () => {
    const L2 = cargar()
    expect(L2.mapearAnalito('Plomo')).toBe('Plomo mg/kg')
    expect(L2.mapearAnalito('Coliformes Totales')).toBe('Coliformes Totales UFC/g')
    expect(L2.mapearAnalito('Coliformes Totales', 'UFC/100 mL')).toBe('Coliformes Totales UFC/100mL')
    expect(L2.mapearAnalito('E. coli', 'UFC/g')).toBe('Escherichia coli UFC/g')
  })

  it('la fila que sube al backend lleva el laboratorio y las columnas de resultado', () => {
    const inf = nuevo()
    L.leerCorthorn(ALS, inf)
    const fila = L.filaCruda(inf)
    expect(fila['Laboratorio']).toBe('ALS (Corthon)')
    expect(fila['Coliformes Totales UFC/100mL']).toBe('12')
  })
})

describe('Diagnofruit', () => {
  const L = cargar()
  it('se reconoce, lee los datos generales y la tabla de patógenos', () => {
    expect(L.detectar(DIAGNO)).toBe('Diagnofruit')
    const inf = nuevo()
    L.leerDiagnofruit(DIAGNO, inf)
    expect(inf.datos['Sold To']).toBe('Frutizano SpA')
    expect(inf.datos['Ship To']).toBe('Planta Rancagua')
    expect(inf.datos['N° Solicitud']).toBe('77123')
    expect(inf.datos['Posición Muestreo']).toBe('M1')
    expect(inf.resultados).toMatchObject({
      'Botrytis conidia/mL': '120',
      'Levaduras UFC/mL': 'BLD',
      'Alternaria conidia/mL': '15',
    })
  })
})
