/**
 * El lector de informes de Quiteca vive en public/modules/converter.html, que es
 * un archivo estático (no pasa por el build). Esta prueba toma su lógica pura
 * -todo lo que hay antes de la interfaz- y la corre tal cual, con el texto de un
 * informe real, para que un cambio en el HTML no rompa la lectura sin avisar.
 */
import { describe, expect, it } from 'vitest'
import html from '../../../../public/modules/converter.html?raw'

const inicio = html.indexOf('/* Lógica del conversor')
const fin = html.indexOf('/* ============ interfaz')
// aISO y filaCruda (lo que se manda al backend) están más abajo, fuera de ese bloque.
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
  leerQuiteca: (texto: string, inf: Informe) => void
  filaCruda: (inf: Informe) => Record<string, unknown>
  aFechaLarga: (t: string) => string | null
}

function cargar(): Lector {
  expect(inicio).toBeGreaterThan(0)
  expect(fin).toBeGreaterThan(inicio)
  expect(finFila).toBeGreaterThan(inicioFila)
  const fuente = html.slice(inicio, fin) + '\n' + html.slice(inicioFila, finFila)
  return new Function(`${fuente}\nreturn { leerQuiteca, filaCruda, aFechaLarga }`)() as Lector
}

const INFORME = `Informe N° 2026-1883-PC
Identificación del Cliente :
Cliente : AGROFRESH CHILE COMERCIAL LIMITADA. RUT : 76.411.711-5
Dirección : Manuel Montt, 4060 Bodega 54 y 55, Barrio Ind. KM90 Comuna : Rancagua
Empacador : Dole Chile S. A.
Lugar de muestreo : Dole Planta San Fernando
Identificación de la Muestra N° 85849 Fecha de Recepción : 24-09-2026 14:00
N° Solicitud : OT-QUI0022 Fecha de Muestreo : 22-09-2026 Hora : 14:30
Solicitado por : Patricio Gamboa Fecha solicitud : 23-09-2026
Especie : manzana Variedad : Modi
Camara húmeda : Cód. productor :
Línea : Kg procesados :
Lote : N° cámara :
Posición muestreo : Análisis
Dosis : FDL: IMZ: PYR: TBZ: AZOX: FHNE: TEBU :
Tratamiento : Línea de Proceso : Línea 4 Código interno del cliente :
Obs.: Gasto 340cc/bins cera-Producto Shield Brite 230 SC-tipo aplicación Línea de proceso
Resultados de la Muestra N° 85849 Fecha de Análisis 24-09-2026
Resultado Desv.Est L.D.
Método Activo mg/Kg mg/Kg mg/Kg
IT-08 Fludioxonil 0,81 0,05 0,02
Fecha Informe : 25 de septiembre de 2026
Paula Olivares Astroza
Gerente Técnico`

function leer(texto = INFORME) {
  const { leerQuiteca, filaCruda } = cargar()
  const inf: Informe = { datos: {}, avisos: [], resultados: {}, sueltos: [], revision: [] }
  leerQuiteca(texto, inf)
  return { inf, fila: filaCruda(inf) }
}

describe('lector de informes de Quiteca', () => {
  it('lee la fecha de análisis (arriba de la tabla de resultados)', () => {
    expect(leer().inf.datos['Fecha Análisis']).toBe('24-09-2026')
  })

  it('lee la fecha del informe, escrita con letras al pie', () => {
    expect(leer().inf.datos['Fecha Informe']).toBe('25-09-2026')
  })

  it('lee el N° de muestra de «Identificación de la Muestra» y lo manda como «N° Muestra»', () => {
    const { inf, fila } = leer()
    expect(inf.datos['N° Muestra']).toBe('85849')
    expect(fila['N° Muestra']).toBe('85849')
  })

  it('lee el OT del campo «N° Solicitud»', () => {
    expect(leer().inf.datos['OT']).toBe('OT-QUI0022')
  })

  it('sigue leyendo lo que ya leía', () => {
    const { datos } = leer().inf
    expect(datos['N° Solicitud']).toBe('2026-1883-PC')
    expect(datos['Fecha Muestreo']).toBe('22-09-2026')
    expect(datos['Fecha entrada']).toBe('24-09-2026')
    expect(datos['Hora Muestreo']).toBe('14:30')
    expect(datos['Ship To']).toBe('Dole Planta San Fernando')
  })

  it('manda al backend las dos fechas y el OT con los nombres que el mapeo espera', () => {
    const { fila } = leer()
    expect(fila['Fecha Informe']).toBe('2026-09-25')
    expect(fila['Fecha Análisis']).toBe('2026-09-24')
    expect(fila['N° Solicitud']).toBe('OT-QUI0022')
    expect(fila['Informe']).toBe('2026-1883-PC')
  })

  it('un informe antiguo con el correlativo interno de Quiteca NO produce un OT', () => {
    const antiguo = INFORME.replace('OT-QUI0022', '26080414255597')
    expect(leer(antiguo).inf.datos['OT']).toBeNull()
    expect(leer(antiguo).fila['N° Solicitud']).toBeNull()
  })

  it('si el informe no trae una de las fechas, queda vacía sin romper la lectura', () => {
    const sinFechas = INFORME.replace(/Fecha de Análisis 24-09-2026/, '').replace(/Fecha Informe : .*/, '')
    const { inf } = leer(sinFechas)
    expect(inf.datos['Fecha Análisis']).toBeNull()
    expect(inf.datos['Fecha Informe']).toBeNull()
    expect(inf.datos['Fecha Muestreo']).toBe('22-09-2026')
  })

  it('la fecha del informe también se entiende en números', () => {
    expect(leer(INFORME.replace('25 de septiembre de 2026', '25-09-2026')).inf.datos['Fecha Informe']).toBe('25-09-2026')
  })
})

describe('fecha con letras', () => {
  it('entiende los meses, con o sin tilde y con «de» opcional', () => {
    const { aFechaLarga } = cargar()
    expect(aFechaLarga('1 de enero de 2026')).toBe('01-01-2026')
    expect(aFechaLarga('30 DE SEPTIEMBRE DE 2026')).toBe('30-09-2026')
    expect(aFechaLarga('7 de setiembre 2026')).toBe('07-09-2026')
    expect(aFechaLarga('12 de diciembre de 2025')).toBe('12-12-2025')
    expect(aFechaLarga('hoy')).toBeNull()
    expect(aFechaLarga('5 de mesfalso de 2026')).toBeNull()
  })
})
