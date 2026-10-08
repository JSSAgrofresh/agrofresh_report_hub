/**
 * El Converter busca el Sold To / Ship To en el listado del TIPO DE SERVICIO del informe:
 * Actimist y Ecofog tienen el suyo; Línea de proceso y RYD usan el de siempre.
 * Corre la lógica pura de public/modules/converter.html con un informe real de Quiteca (Ecofog).
 */
import { describe, expect, it } from 'vitest'
import html from '../../../../public/modules/converter.html?raw'

const inicio = html.indexOf('/* Lógica del conversor')
const fin = html.indexOf('/* ============ interfaz')

interface Revision { campo: string; estado: string }
interface Informe {
  datos: Record<string, unknown>
  laboratorio: string
  revision: Revision[]
  avisos: string[]
}
interface Lector {
  analizar: (texto: string, nombre: string) => Informe
  revisarCatalogo: (inf: Informe) => void
  servicioDe: (inf: { datos: Record<string, unknown> }) => string
  LISTADOS: { plantasPorCliente: Record<string, string[]>; servicios: Record<string, unknown> }
  CAT: { catalogo: Record<string, string[]>; alias: Record<string, unknown>; variedad_especie: Record<string, string[]> }
}

function cargar(): Lector {
  expect(inicio).toBeGreaterThan(0)
  expect(fin).toBeGreaterThan(inicio)
  // Lo que la interfaz define después del bloque y revisarCatalogo consulta al llamarse.
  const interfaz = 'const APRENDIDAS = {}; const claveAprendida = () => "x"; const contextoDe = () => "";'
  const fuente = interfaz + '\n' + html.slice(inicio, fin)
  return new Function(
    `${fuente}\nreturn { analizar, revisarCatalogo, servicioDe, LISTADOS, CAT }`,
  )() as Lector
}

const SOLD = 'EXPORTADORA ERFRUT LTDA'
const SHIP = 'FRIGORIFICO CHIMBARONGO'

const QUITECA_ECOFOG = `INFORME DE ANALISIS
Informe N° 2026-1907-PC
Identificación del Cliente :
Cliente : AGROFRESH CHILE COMERCIAL LIMITADA. RUT : 76.411.711-5
Dirección : Manuel Montt, 4060 Bodega 54 y 55, Barrio Ind. KM90 Comuna : Rancagua
Empacador : EXPORTADORA ERFRUT LTDA
Lugar de muestreo : FRIGORIFICO CHIMBARONGO
Identificación de la Muestra N°85972 Fecha de Recepción : 06-10-2026 14:08
N° Solicitud : OT-QUI0048 Fecha de Muestreo : 02-10-2026 Hora : 13:30
Muestreador : Diego Inostroza Fecha solicitud : 05-10-2026
Especie : manzana Variedad : Granny Smith
Tipo Aplicación : Ecofog Cód. productor :
Línea : Kg procesados :
Lote : N° cámara : 5B ac
Posición muestreo : Compuesta Análisis : Específico
Dosis : FDL : IMZ : PYR : TBZ : AZOX : DPA : TEBU :
90grs/Ton
Producto : N° Orden : 800354800 Código del Packing :
Obs.: Apertura de camara
Resultados de la Muestra N°85972 Fecha de Análisis 06-10-2026
Resultado Desv.Est L.D.
Método Activo mg/Kg mg/Kg mg/Kg
IT-04 Difenilamina 1,88 0,01 0,06
---- ---- ----
---- ---- ----
---- ---- ----
---- ---- ----
Interpretación de Abreviaturas
Desv.Est : Desviación estándar de los duplicados
L.D. : Límite de Detección
N.D. : No Detectado
Los resultados se refieren solo a la muestra analizada, la cual ha sido proporcionada por el cliente.
Fecha Informe : 7 de octubre de 2026
Laboratorio Químico Quiteca Ltda.
Pedro Fontova 4756 - Conchali - Santiago Fono: +56 227390161 - www.quiteca.cl
Fin del informe Página 1 de 1`

/** Un lector con los listados cargados: el de Línea de proceso (sin la planta de Ecofog) y el de Ecofog. */
function conListados(ecofogCargado = true) {
  const l = cargar()
  l.CAT.catalogo = { sold_to: [SOLD, 'DOLE CHILE S.A.'], ship_to: ['OTRA PLANTA'], especie: ['Manzana'], variedad: ['Granny Smith'] }
  l.LISTADOS.plantasPorCliente = { [SOLD]: ['OTRA PLANTA'] }
  l.LISTADOS.servicios = ecofogCargado
    ? {
        ecofog: { cargado: true, sold_to: [SOLD], plantasPorCliente: { [SOLD]: [SHIP] } },
        actimist: { cargado: true, sold_to: ['DOLE CHILE S.A.'], plantasPorCliente: { 'DOLE CHILE S.A.': ['DOLE LONTUE'] } },
      }
    : {}
  return l
}

const estadoDe = (inf: Informe, campo: string) => inf.revision.find((r) => r.campo === campo)?.estado

describe('Quiteca: el Tipo Aplicación del informe nuevo', () => {
  it('lee «Tipo Aplicación : Ecofog» (el informe nuevo ya no trae «Tratamiento»)', () => {
    const inf = conListados().analizar(QUITECA_ECOFOG, 'Informe 2026-1907-PC.pdf')
    expect(inf.laboratorio).toBe('Quiteca')
    expect(inf.datos['Tipo Aplicación']).toBe('Ecofog')
  })

  it('el informe antiguo, con «Tratamiento», sigue leyéndose igual', () => {
    const viejo = QUITECA_ECOFOG.replace('Tipo Aplicación : Ecofog Cód. productor :', 'Tratamiento : FOGGER Línea de Proceso :')
    const inf = conListados().analizar(viejo, 'antiguo.pdf')
    expect(inf.datos['Tipo Aplicación']).toBe('FOGGER')
    expect(inf.datos['Tipo de servicio']).toBe('Actimist')
  })
})

describe('el listado según el servicio del informe', () => {
  it('Ecofog: el Ship To se valida contra el listado de Ecofog (y no existe en el de Línea de proceso)', () => {
    const inf = conListados().analizar(QUITECA_ECOFOG, 'Informe 2026-1907-PC.pdf')
    expect(estadoDe(inf, 'Sold To')).toBe('ok')
    expect(estadoDe(inf, 'Ship To')).toBe('ok')
    expect(inf.datos['Ship To']).toBe(SHIP)
  })

  it('el mismo informe como Línea de proceso queda fuera de catálogo: ahí esa planta no existe', () => {
    const lp = QUITECA_ECOFOG.replace('Tipo Aplicación : Ecofog', 'Tipo Aplicación : Línea de proceso')
    const inf = conListados().analizar(lp, 'Informe.pdf')
    expect(estadoDe(inf, 'Ship To')).toBe('fuera')
  })

  it('si el listado del servicio no se pudo leer, NO se cae en el de Línea de proceso', () => {
    const l = conListados(false)
    // aunque Línea de proceso tuviera esa planta, el informe es de Ecofog: no debe calzar con ella
    l.LISTADOS.plantasPorCliente = { [SOLD]: [SHIP] }
    l.CAT.catalogo.ship_to = [SHIP]
    const inf = l.analizar(QUITECA_ECOFOG, 'Informe.pdf')
    expect(estadoDe(inf, 'Ship To')).toBe('fuera')
    expect(estadoDe(inf, 'Sold To')).toBe('fuera')
  })

  it('Actimist usa el suyo, distinto del de Ecofog', () => {
    const act = QUITECA_ECOFOG.replace('Tipo Aplicación : Ecofog', 'Tipo Aplicación : Actimist')
    const inf = conListados().analizar(act, 'Informe.pdf')
    expect(estadoDe(inf, 'Sold To')).toBe('fuera')   // ERFRUT no está en el listado de Actimist de este caso
  })

  it('cómo se reconoce el servicio', () => {
    const { servicioDe } = cargar()
    const de = (t: string) => servicioDe({ datos: { 'Tipo Aplicación': t } })
    expect(de('Ecofog')).toBe('ecofog')
    expect(de(' ACTIMIST ')).toBe('actimist')
    expect(de('Línea de proceso')).toBe('')
    expect(de('RYD')).toBe('')            // RYD usa el listado de Línea de proceso
    expect(de('')).toBe('')
    expect(servicioDe({ datos: {} })).toBe('')
  })
})
