/**
 * ALS (Microbiología) y Diagnofruit con el texto de PDF REALES (octubre 2026, carpeta «MIRA ESTO»):
 * nueve informes de ALS de agua (FSMA) y los reportes 253521/253522 de Diagnofruit. Los textos de
 * abajo son recortes de `pdftotext -layout` de esos archivos.
 *
 * Lo que fijan: el OT sale de la Identificación Muestra aunque ALS lo parta en dos líneas
 * («OT-» / «ALS0007» u «OT- ALS0010»); «<1» se queda como texto; las fechas se leen de donde ALS
 * las escribe (y se avisa cuando se contradicen); un PDF de Diagnofruit con dos muestras queda
 * como dos informes (253522-DIAG0007 y 253522-DIAG0008), y la fecha de recepción mes/día se corrige.
 */
import { describe, expect, it } from 'vitest'
import html from '../../../../public/modules/converter.html?raw'

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
  detectar: (texto: string) => string | null
  analizarVarios: (texto: string, nombre: string) => Informe[]
  completarDesdeSolicitud: (inf: Informe) => Promise<void>
  setFetch: (f: (url: string) => Promise<unknown>) => void
  LISTADOS: Record<string, unknown>
}
function cargar(): Lector {
  // Lo que la interfaz define después del bloque y revisarCatalogo consulta al llamarse.
  const interfaz = 'let fetch = null; const API_BASE = ""; const autorizacion = () => ({});' +
    'const APRENDIDAS = {}; const claveAprendida = () => "x"; const contextoDe = () => "";'
  const fuente = interfaz + '\n' + html.slice(inicio, fin) + '\n' + html.slice(inicioFila, finFila)
  return new Function(
    `${fuente}\nreturn { detectar, analizarVarios, completarDesdeSolicitud, LISTADOS, setFetch: (f) => { fetch = f } }`,
  )() as Lector
}
const L = cargar()
const uno = (t: string, n = 'x.pdf') => L.analizarVarios(t, n)[0]

const ALS_0412 = `                                                                                  LABORATORIO MICROBIOLOGÍA
                                                                                                              SANTIAGO
                                                                      INFORME DE ANALISIS Nº 496561
Solicitante                                                                       CENTRAL FRUTICOLA SAN CLEMENTE SPA-RENAICO
Dirección                                                                         Los Militares 5001, Oficina 1101, Santiago., COMUNA Las Condes
Contacto
Solicitud Muestreo/Análisis                                           Sol. de Cliente 05-10-2026
Tipo de Muestras                                                      Aguas
Nº de Muestras                                                        1
Tº de Ingreso (°C)                                                    5.8°C
Fecha y Entidad de Muestreo                                           30-09-26 10:53 / Muestra proporcionada por el solicitante. Los resultados se aplican a la muestra
                                                                      como fue recibida.
Fecha y Hora de Ingreso                                               05-10-26 16:11
Fecha y Hora de Inicio                                                06-10-26 09:30
Fecha y Hora de Termino                                               07-10-26 10:00
Identificación Muestra (NI)                                22610 0413 Agua de proceso // Linea de Proceso Manzanas Gala // Pozo Vaciado // Patricio Gamboa / Sin
                                                                      código de Productor // N° Solicitud: OT-ALS0012
Muestreo
Fecha                           30-09-2026
Horario                         10:53:00 hrs.
Lugar de muestreo               Cliente
                                                         22610 0413 (Agua de proceso // Linea de Proceso Manzanas Gala // Pozo Vaciado //
                                                               Patricio Gamboa / Sin código de Productor // N° Solicitud: OT-ALS0012)
              Ensayos                                     Resultado      Unidad       Metodología de ensayo         Hora Inicio   Hora Termino
Coliformes Totales                                                                    CQ-MIC-059-D EPA 1604
                                              -                  <1    UFC/ 100 mL (Acreditación INN; Acreditación 06-10-26 09:30 07-10-26 10:00
                                                                                                A2LA)
Escherichia Coli                                                                      CQ-MIC-059-D EPA 1604
                                              -                  <1    UFC/ 100 mL (Acreditación INN; Acreditación 06-10-26 09:30 07-10-26 10:00
                                                                                                A2LA)
WHOS(*) World Health Organization Standard

`

const ALS_0415 = `                                                                                  LABORATORIO MICROBIOLOGÍA
                                                                                                              SANTIAGO
                                                                      INFORME DE ANALISIS Nº 496563
Solicitante                                                                       CENTRAL FRUTICOLA SAN CLEMENTE SPA-RENAICO
Dirección                                                                         Los Militares 5001, Oficina 1101, Santiago., COMUNA Las Condes
Contacto
Solicitud Muestreo/Análisis                                           Sol. de Cliente 05-10-2026
Tipo de Muestras                                                      Agua de proceso alimenticio
Nº de Muestras                                                        1
Tº de Ingreso (°C)                                                    5.6°C
Fecha y Entidad de Muestreo                                           30-10-26 10:40 / Muestra proporcionada por el solicitante. Los resultados se aplican a la muestra
                                                                      como fue recibida.
Fecha y Hora de Ingreso                                               05-10-26 16:22
Fecha y Hora de Inicio                                                06-10-26 09:30
Fecha y Hora de Termino                                               07-10-26 10:00
Identificación Muestra (NI)                                22610 0415 Agua // Linea de Proceso Manzana // Pozo Vaciado // Patricio Gamboa // N° Solicitud: OT-ALS0014
Muestreo
Fecha                           30-10-2026
Horario                         10:40:00 hrs.
Lugar de muestreo               Cliente
                                                         22610 0415 (Agua // Linea de Proceso Manzana // Pozo Vaciado // Patricio Gamboa
                                                                                    // N° Solicitud: OT-ALS0014)
              Ensayos                                     Resultado    Unidad        Metodología de ensayo         Hora Inicio   Hora Termino
Coliformes Totales                                                                   CQ-MIC-059-D EPA 1604
                                              -                  <1   UFC/ 100 mL (Acreditación INN; Acreditación 06-10-26 09:30 07-10-26 10:00
                                                                                               A2LA)
Escherichia Coli                                                                     CQ-MIC-059-D EPA 1604
                                              -                  <1   UFC/ 100 mL (Acreditación INN; Acreditación 06-10-26 09:30 07-10-26 10:00
                                                                                               A2LA)
WHOS(*) World Health Organization Standard

`

const ALS_0010 = `                                                                                  LABORATORIO MICROBIOLOGÍA
                                                                                                              SANTIAGO
                                                                      INFORME DE ANALISIS Nº 496250
Solicitante                                                                       GESEX MULTIFRUTA-FATIMA
Dirección                                                                         Los Militares 5001, Oficina 1101, Santiago., COMUNA Las Condes
Contacto
Solicitud Muestreo/Análisis                                           Sol. de cliente 02-10-2026
Tipo de Muestras                                                      Aguas
Nº de Muestras                                                        1
Tº de Ingreso (°C)                                                    No Aplica
Fecha y Entidad de Muestreo                                           Muestra proporcionada por el solicitante. Los resultados se aplican a la muestra como fue recibida.
Fecha y Hora de Ingreso                                               02-10-26 11:21
Fecha y Hora de Inicio                                                02-10-26 14:30
Fecha y Hora de Termino                                               03-10-26 15:00
Identificación Muestra (NI)                                22610 0164 Agua // Línea de Proceso // Naranja // Navel // Pozo Vaciado // BArly Fuentes // 118919 // OT-
                                                                      ALS0010
Muestreo
Fecha
Horario
Lugar de muestreo
                                                         22610 0164 (Agua // Línea de Proceso // Naranja // Navel // Pozo Vaciado // BArly
                                                                                 Fuentes // 118919 // OT-ALS0010)
              Ensayos                                     Resultado    Unidad        Metodología de ensayo         Hora Inicio   Hora Termino
Coliformes Totales                                                                   CQ-MIC-059-D EPA 1604
                                              -                  41   UFC/ 100 mL (Acreditación INN; Acreditación 02-10-26 14:30 03-10-26 15:00
                                                                                               A2LA)
Escherichia Coli                                                                     CQ-MIC-059-D EPA 1604
                                              -                  33   UFC/ 100 mL (Acreditación INN; Acreditación 02-10-26 14:30 03-10-26 15:00
                                                                                               A2LA)
WHOS(*) World Health Organization Standard

`

const ALS_0006 = `                                                                                  LABORATORIO MICROBIOLOGÍA
                                                                                                              SANTIAGO
                                                                      INFORME DE ANALISIS Nº 496252
Solicitante                                                                       GESEX MULTIFRUTA-FATIMA
Dirección                                                                         Los Militares 5001, Oficina 1101, Santiago., COMUNA Las Condes
Contacto
Solicitud Muestreo/Análisis                                           Sol. de cliente 02-10-2026
Tipo de Muestras                                                      Aguas
Nº de Muestras                                                        1
Tº de Ingreso (°C)                                                    No Aplica
Fecha y Entidad de Muestreo                                           Muestra proporcionada por el solicitante. Los resultados se aplican a la muestra como fue recibida.
Fecha y Hora de Ingreso                                               02-10-26 11:21
Fecha y Hora de Inicio                                                02-10-26 14:30
Fecha y Hora de Termino                                               03-10-26 15:00
Identificación Muestra (NI)                                22610 0166 Agua // Línea de Proceso // Naranja // Lane Late // Catherine Cornejo // OT-ALS0006
Muestreo
Fecha
Horario
Lugar de muestreo
                                                         22610 0166 (Agua // Línea de Proceso // Naranja // Lane Late // Catherine Cornejo
                                                                                            // OT-ALS0006)
              Ensayos                                     Resultado    Unidad        Metodología de ensayo         Hora Inicio   Hora Termino
Coliformes Totales                                                                   CQ-MIC-059-D EPA 1604
                                              -                  49   UFC/ 100 mL (Acreditación INN; Acreditación 02-10-26 14:30 03-10-26 15:00
                                                                                               A2LA)
Escherichia Coli                                                                     CQ-MIC-059-D EPA 1604
                                              -                  15   UFC/ 100 mL (Acreditación INN; Acreditación 02-10-26 14:30 03-10-26 15:00
                                                                                               A2LA)
WHOS(*) World Health Organization Standard

`

const DIAG = `                                                      REPORTE DE RESULTADOS
                                                                                                                                     LABORATORIOS DIAGNOFRUIT - CHILE
                                                                                                                                    Sede SUCRE #1521, ÑUÑOA, SANTIAGO
Reporte número:               253522                                                                   Fecha de Informe:                      8/10/2026
                                                                                                       Fecha de muestreo:                     1/10/2026
Cliente:                      Agrofresh
                                                                                                       Fecha de recepción:                    10/1/2026
Tipo de muestra:              AGUA                                                                     Fecha de ejecución:                    2/10/2026
Predio/planta:                Greenex Planta Codegua
Nombre de muestra:            M1 - DIAG0007
Especie:                      AGUA                                                                     Variedad:            No Aplica
Localidad:                    Codegua                                                                  U. prod:             N/A
Análisis realizado:           CUANTIFICACIÓN MOLECULAR DE MICROORGANISMOS
                                                                                    RESULTADOS
                   Cuantificación de microorganismos
                   Patógeno                                   Resultado                                Unidad                           Limite de Detección
                   Levaduras                                    BLD                                    UFC/mL                               1 UFC/mL
                   Botrytis                                      5.2                                  conidia/mL                           1 conidia/mL
                   Alternaria                                   BLD                                   conidia/mL                          0,8 conidia/mL
                   Geotrichum                                   BLD                                esporas/mL                              1 esporas/mL
                   Penicillium                                  BLD                                   conidia/mL                           1 conidia/mL
                                                               Carozos                                             Kiwi
                                          Nivel    Botrytis    Alternaria Geotrichum Penicillium
                                        Optimo      < 20         < 50       < 10        < 50                Valores no definidos
                                       Moderado 20 - 200        50-300     10 -50      50-300
                                       Peligroso    >200         >300        >50        >300
Metodología: Amplificación de fragmentos de DNA específicos por qPCR. Para levaduras, detección y cuantificación mediante CompactDry
Límite de detección (BLD): Indicado para cada patógeno
correo: info@diagnofruit.cl
web: www.diagnofruit.cl
                                                                                      Página 1 de 3
                                                      REPORTE DE RESULTADOS
                                                                                                                                     LABORATORIOS DIAGNOFRUIT - CHILE
                                                                                                                                    Sede SUCRE #1521, ÑUÑOA, SANTIAGO
Reporte número:               253522                                                                   Fecha de Informe:                      8/10/2026
                                                                                                       Fecha de muestreo:                     1/10/2026
Cliente:                      Agrofresh
                                                                                                       Fecha de recepción:                    10/1/2026
Tipo de muestra:              AGUA                                                                     Fecha de ejecución:                    2/10/2026
Predio/planta:                Greenex Planta Codegua
Nombre de muestra:            M2 - DIAG0008
Especie:                      AGUA                                                                     Variedad:            No Aplica
Localidad:                    Codegua                                                                  U. prod:             N/A
Análisis realizado:           CUANTIFICACIÓN MOLECULAR DE MICROORGANISMOS
                                                                                    RESULTADOS
                   Cuantificación de microorganismos
                   Patógeno                                   Resultado                                Unidad                           Limite de Detección
                   Levaduras                                    BLD                                    UFC/mL                               1 UFC/mL
                   Botrytis                                     BLD                                   conidia/mL                           1 conidia/mL
                   Alternaria                                   BLD                                   conidia/mL                          0,8 conidia/mL
                   Geotrichum                                    7.2                               esporas/mL                              1 esporas/mL
                   Penicillium                                  BLD                                   conidia/mL                           1 conidia/mL
                                                               Carozos                                             Kiwi
                                          Nivel    Botrytis    Alternaria Geotrichum Penicillium
                                        Optimo      < 20         < 50       < 10        < 50                Valores no definidos
                                       Moderado 20 - 200        50-300     10 -50      50-300
                                       Peligroso    >200         >300        >50        >300
Metodología: Amplificación de fragmentos de DNA específicos por qPCR. Para levaduras, detección y cuantificación mediante CompactDry
Límite de detección (BLD): Indicado para cada patógeno
correo: info@diagnofruit.cl
web: www.diagnofruit.cl
                                                                                      Página 2 de 3
                                                   REPORTE DE RESULTADOS
                                                                                                     LABORATORIOS DIAGNOFRUIT - CHILE
                                                                                                    Sede SUCRE #1521, ÑUÑOA, SANTIAGO
Reporte número:               253522                                         Fecha de Informe:            8/10/2026
                                                                             Fecha de muestreo:           1/10/2026
Cliente:                      Agrofresh
                                                                             Fecha de recepción:          1/10/2026
Tipo de muestra:              AGUA                                           Fecha de ejecución:          2/10/2026
Predio/planta:                Greenex Planta Codegua
Nombre de muestra:            ------------------
Especie:                      AGUA                                           Variedad:      No Aplica
Localidad:                    Codegua                                        U. prod:       N/A
Análisis realizado:           CUANTIFICACIÓN MOLECULAR DE MICROORGANISMOS
                   OBSERVACIONES ADICIONALES
           Sin observaciones adicionales
correo: info@diagnofruit.cl
web: www.diagnofruit.cl
                                                             Página 3 de 3
`

describe('ALS Microbiología (informes reales)', () => {
  it('se reconoce y lee el informe, el OT, las fechas y los resultados', () => {
    expect(L.detectar(ALS_0412)).toBe('ALS (Corthon)')
    const inf = uno(ALS_0412)
    expect(inf.datos).toMatchObject({
      Laboratorio: 'ALS (Corthon)',
      'N° Solicitud': '496561',
      OT: 'OT-ALS0012',
      'Fecha entrada': '05-10-2026',
      'Hora Recepción': '16:11',
      'Fecha Análisis': '06-10-2026',
      'Fecha Muestreo': '30-09-2026',
      'Hora Muestreo': '10:53',
      'Tipo Muestra': 'Agua',
    })
    // «<1» no es un valor medido: se guarda tal cual, como texto
    expect(inf.resultados).toEqual({ 'Coliformes Totales UFC/100mL': '<1', 'E. Coli UFC/100mL': '<1' })
    // Especie y Tipo de servicio no los trae el informe: se completan desde la solicitud (OT-ALS0012)
    expect(inf.avisos).toEqual(['Sin dato para: Especie, Tipo de servicio'])
  })

  it('el OT partido en dos líneas («OT- ALS0010») se lee igual y los resultados numéricos van como número', () => {
    const inf = uno(ALS_0010)
    expect(inf.datos['OT']).toBe('OT-ALS0010')
    expect(inf.datos['N° Solicitud']).toBe('496250')
    expect(inf.resultados).toEqual({ 'Coliformes Totales UFC/100mL': '41', 'E. Coli UFC/100mL': '33' })
  })

  it('sin fecha de muestreo en el informe, queda vacía para completarla desde la solicitud', () => {
    const inf = uno(ALS_0006)
    expect(inf.datos['OT']).toBe('OT-ALS0006')
    expect(inf.datos['Fecha Muestreo']).toBeUndefined()
    expect(inf.datos['Fecha entrada']).toBe('02-10-2026')
  })

  it('lee la fecha tal como la imprimió ALS aunque sea errónea (30-10 en vez de 30-09): la solicitud la contrasta', () => {
    const inf = uno(ALS_0415)
    expect(inf.datos['OT']).toBe('OT-ALS0014')
    expect(inf.datos['Fecha Muestreo']).toBe('30-10-2026')
  })

  it('si el bloque Muestreo y «Fecha y Entidad de Muestreo» se contradicen, avisa y usa el bloque', () => {
    const t = ALS_0412.replace('30-09-26 10:53', '30-08-26 10:53')
    const inf = uno(t)
    expect(inf.datos['Fecha Muestreo']).toBe('30-09-2026')
    expect(inf.avisos.join(' ')).toMatch(/dos fechas de muestreo.*30-09-2026.*30-08-2026/)
  })

  it('no confunde el Solicitante de ALS con el Sold To oficial: lo deja como pista en la observación', () => {
    const inf = uno(ALS_0412)
    expect(inf.datos['Observación']).toContain('Solicitante según ALS: CENTRAL FRUTICOLA SAN CLEMENTE SPA-RENAICO')
  })
})

describe('Diagnofruit (reporte real con dos muestras)', () => {
  const infs = L.analizarVarios(DIAG, '253522 - Agrofresh.pdf')

  it('una página por muestra: dos informes, sin la página de observaciones', () => {
    expect(infs).toHaveLength(2)
    expect(infs.map((i) => i.datos['N° Solicitud'])).toEqual(['253522-DIAG0007', '253522-DIAG0008'])
    expect(infs.map((i) => i.datos['OT'])).toEqual(['OT-DIAG0007', 'OT-DIAG0008'])
    expect(infs.every((i) => i.parteDe === '253522 - Agrofresh.pdf')).toBe(true)
  })

  it('cada muestra trae SUS resultados (no los de la otra, ni la tabla de niveles)', () => {
    expect(infs[0].resultados).toEqual({
      'Levaduras UFC/mL': 'BLD', 'Botrytis conidia/mL': '5,2', 'Alternaria conidia/mL': 'BLD',
      'Geotrichum esporas/mL': 'BLD', 'Penicillium conidia/mL': 'BLD',
    })
    expect(infs[1].resultados['Botrytis conidia/mL']).toBe('BLD')
    expect(infs[1].resultados['Geotrichum esporas/mL']).toBe('7,2')
  })

  it('la fecha de recepción escrita mes/día se corrige (no puede ser antes del muestreo)', () => {
    expect(infs[0].datos['Fecha Muestreo']).toBe('01-10-2026')
    expect(infs[0].datos['Fecha entrada']).toBe('01-10-2026')
    expect(infs[1].datos['Fecha entrada']).toBe('01-10-2026')
  })

  it('un PDF con una sola muestra sigue siendo un informe, con el N° del reporte', () => {
    const una = DIAG.split(/(?=REPORTE DE RESULTADOS)/)
    const solo = una[0] + una[una.length - 1]
    const r = L.analizarVarios(solo, 'una.pdf')
    expect(r).toHaveLength(1)
    expect(r[0].datos['N° Solicitud']).toBe('253522')
  })
})

describe('completar desde la solicitud (ALS y Diagnofruit)', () => {
  const solicitud = (campos: Record<string, string>) => ({
    ok: true, status: 200,
    json: async () => ({ campos, analitos_solicitados: ['ECOLI100', 'COLIF100'], fecha_recepcion: null }),
  })

  it('ALS: Sold To, Ship To y especie salen de la solicitud, y el servicio de su Tipo Aplicación', async () => {
    const inf = uno(ALS_0412)
    let url = ''
    L.setFetch(async (u) => { url = u; return solicitud({
      'Sold To (Nombre)': 'AGRICOLA SAN CLEMENTE LIMITADA', 'Ship To (Nombre)': 'EXPORTADORA SAN CLEMENTE RENAICO',
      Especie: 'Manzana', Variedad: 'Gala', 'Tipo Aplicación': 'Línea de proceso', 'Fecha Muestreo': '30-09-2026',
    }) })
    await L.completarDesdeSolicitud(inf)
    expect(url).toBe('/emitir/cromatografia/solicitud-ot/OT-ALS0012')
    expect(inf.datos).toMatchObject({
      'Sold To': 'AGRICOLA SAN CLEMENTE LIMITADA',     // manda la solicitud, no el «CENTRAL FRUTICOLA…» de ALS
      'Ship To': 'EXPORTADORA SAN CLEMENTE RENAICO',
      Especie: 'Manzana', Variedad: 'Gala', 'Tipo de servicio': 'Linea de Proceso',
    })
    expect(inf.datos['Observación']).toContain('Informe ALS N° 496561 · Solicitud OT-ALS0012')
    // ya no falta nada obligatorio
    expect(inf.avisos.join(' ')).not.toContain('Sin dato para')
  })

  it('Diagnofruit: Actimist en la solicitud → servicio Actimist; avisa si la fecha de muestreo no calza', async () => {
    const inf = L.analizarVarios(DIAG, '253522 - Agrofresh.pdf')[0]
    L.setFetch(async () => solicitud({
      'Sold To (Nombre)': 'GREENEX', 'Ship To (Nombre)': 'GREENEX PLANTA CODEGUA', Especie: 'Manzana',
      'Tipo Aplicación': 'Actimist', 'Fecha Muestreo': '02-10-2026',
    }))
    await L.completarDesdeSolicitud(inf)
    expect(inf.datos['Sold To']).toBe('GREENEX')
    expect(inf.datos['Especie']).toBe('Manzana')       // no «AGUA»
    expect(inf.datos['Tipo de servicio']).toBe('Actimist')
    expect(inf.avisos.join(' ')).toMatch(/Fecha Muestreo: el informe dice «01-10-2026» y la solicitud «02-10-2026»/)
  })

  it('sin la solicitud en el sistema (404) avisa y deja a mano el Sold To / Ship To', async () => {
    const inf = uno(ALS_0010)
    L.setFetch(async () => ({ ok: false, status: 404, json: async () => ({}) }))
    await L.completarDesdeSolicitud(inf)
    expect(inf.avisos.join(' ')).toMatch(/No se encontró la solicitud OT-ALS0010/)
  })
})

/**
 * El Converter NO lee `pdftotext -layout`: pdf.js entrega fragmentos y `armarLineas` los une dejando UN SOLO espacio
 * entre ellos (`replace(/\s+/g, ' ')`). Los lectores tienen que funcionar con ese texto, no solo con el de arriba
 * (el primer informe de ALS subido de verdad quedó sin resultados porque el lector pedía 2+ espacios).
 */
const comoPdfJs = (t: string) =>
  t.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n')

describe('lectura con el texto que arma pdf.js (espacios colapsados)', () => {
  it.each([
    ['ALS_0412', ALS_0412], ['ALS_0415', ALS_0415], ['ALS_0010', ALS_0010], ['ALS_0006', ALS_0006],
  ])('%s: lee los mismos resultados y datos que con el texto en columnas', (_n, texto) => {
    const base = uno(texto)
    const real = uno(comoPdfJs(texto))
    expect(Object.keys(base.resultados).length).toBeGreaterThan(0)
    expect(real.resultados).toEqual(base.resultados)
    expect(real.datos).toEqual(base.datos)
  })

  it('Diagnofruit: cada muestra trae sus resultados', () => {
    const base = L.analizarVarios(DIAG, 'd.pdf')
    const real = L.analizarVarios(comoPdfJs(DIAG), 'd.pdf')
    expect(real).toHaveLength(base.length)
    real.forEach((inf, i) => {
      expect(inf.resultados).toEqual(base[i].resultados)
      expect(inf.datos).toEqual(base[i].datos)
    })
  })
})
