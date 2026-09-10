/**
 * El mismo cálculo que hace el backend, para que el formulario responda
 * mientras se escribe.
 *
 * Está duplicado a propósito, y la duplicación tiene un dueño claro: manda
 * `backend/app/verificaciones.py`. Lo que se guarda es SIEMPRE lo que
 * recalcula el servidor al recibir el día; esto solo pinta la fila de verde o
 * de rojo antes de guardar. La alternativa —pedirle el veredicto al servidor
 * en cada tecla— haría que escribir tres pesadas fueran tres viajes.
 *
 * Las dos versiones están probadas contra los mismos casos
 * (`tests/test_verificaciones.py` acá al lado de `calculos.test.ts`), así que
 * si una se desvía de la otra, salta.
 */
import type {
  FactorZ,
  Gas,
  Micropipeta,
  Parametro,
  PesaPatron,
  PuntoTemperatura,
  Registro,
  RegistroInput,
  Resultado,
  ResultadoDia,
  Seccion,
} from './tipos'

export const ACEPTABLE = 'Aceptable'
export const NO_ACEPTABLE = 'No aceptable'
export const SIN_DATOS = 'Sin datos'
export const SIN_MEDIR = ''

export const veredicto = (cumple: boolean): Resultado => (cumple ? ACEPTABLE : NO_ACEPTABLE)

/** Factor de corrección Z del agua (µL/mg). La tabla es por grado entero, así
 * que la temperatura se redondea. Fuera de la tabla no se inventa un valor:
 * sin Z no hay volumen, y un volumen inventado decidiría mal. */
export function factorZ(temperatura: number | null, tabla: FactorZ[]): number | null {
  if (temperatura === null || Number.isNaN(temperatura)) return null
  return tabla.find((f) => f.temperatura === Math.round(temperatura))?.factor ?? null
}

const redondear = (n: number, decimales = 4) => Number(n.toFixed(decimales))

export interface CalculoMicropipeta {
  volumen_medio: number | null
  desviacion: number | null
  error_pct: number | null
  resultado: Resultado
}

export function calcularMicropipeta(
  pesos: (number | null)[],
  z: number | null,
  nominal: number,
  tolerancia: number,
): CalculoMicropipeta {
  const validos = pesos.filter((p): p is number => p !== null)
  if (validos.length < 3 || z === null) {
    return { volumen_medio: null, desviacion: null, error_pct: null, resultado: SIN_MEDIR }
  }
  // pesos en gramos → µL: masa_g × 1000 (mg/g) × Z (µL/mg)
  const volumen = (validos.reduce((a, b) => a + b, 0) / 3) * 1000 * z
  const desviacion = Math.abs(volumen - nominal)
  return {
    volumen_medio: redondear(volumen),
    desviacion: redondear(desviacion),
    error_pct: nominal ? redondear(((volumen - nominal) / nominal) * 100) : null,
    resultado: veredicto(desviacion <= tolerancia),
  }
}

export interface CalculoBalanza {
  promedio: number | null
  desviacion: number | null
  resultado: Resultado
}

export function calcularBalanza(
  lecturas: (number | null)[],
  nominal: number,
  tolerancia: number,
): CalculoBalanza {
  const validas = lecturas.filter((l): l is number => l !== null)
  if (validas.length < 3) return { promedio: null, desviacion: null, resultado: SIN_MEDIR }
  // La balanza entrega las lecturas en gramos, mientras que las pesas patrón
  // y sus tolerancias se configuran en miligramos. Convertimos antes de
  // comparar para que promedio, desviación y veredicto estén en la misma unidad.
  const promedio = (validas.reduce((a, b) => a + b, 0) / 3) * 1000
  const desviacion = Math.abs(promedio - nominal)
  return {
    promedio: redondear(promedio),
    desviacion: redondear(desviacion),
    resultado: veredicto(desviacion <= tolerancia),
  }
}

export function calcularTemperatura(
  lectura: number | null,
  minimo: number,
  maximo: number,
): Resultado {
  if (lectura === null) return SIN_MEDIR
  return veredicto(lectura >= minimo && lectura <= maximo)
}

export function calcularGas(
  contenido: number | null,
  trabajo: number | null,
  contenidoMin: number,
  trabajoMin: number,
  trabajoMax: number,
): Resultado {
  // Media medición no alcanza para aprobar un cilindro.
  if (contenido === null || trabajo === null) return SIN_MEDIR
  return veredicto(contenido >= contenidoMin && trabajo >= trabajoMin && trabajo <= trabajoMax)
}

/** Aceptable si se limpió la aguja y, además, está sana o fue reemplazada.
 * Una aguja dañada que sigue puesta no es aceptable. */
export function calcularInyector(
  limpieza: string,
  danada: string,
  reemplazada: string,
): Resultado {
  if (!limpieza) return SIN_MEDIR
  return veredicto(limpieza === 'Sí' && (danada === 'No' || reemplazada === 'Sí'))
}

export interface CalculoDetector {
  resultado_voltaje: Resultado
  resultado_metodo: Resultado
  resultado_output: Resultado
  resultado: Resultado
}

export function calcularDetector(
  voltaje: number | null,
  metodo: string,
  output: number | null,
  voltajeMin: number,
  voltajeMax: number,
  outputMin: number,
  outputMax: number,
): CalculoDetector {
  const rVoltaje: Resultado =
    voltaje === null ? SIN_MEDIR : veredicto(voltaje >= voltajeMin && voltaje <= voltajeMax)
  const rMetodo: Resultado = !metodo ? SIN_MEDIR : ACEPTABLE
  const rOutput: Resultado =
    output === null ? SIN_MEDIR : veredicto(output >= outputMin && output <= outputMax)
  return {
    resultado_voltaje: rVoltaje,
    resultado_metodo: rMetodo,
    resultado_output: rOutput,
    resultado: resumir([rVoltaje, rMetodo, rOutput]),
  }
}

export function calcularFugas(respuesta: string): Resultado {
  if (!respuesta) return SIN_MEDIR
  return veredicto(respuesta === 'No')
}

/** Un «No aceptable» manda sobre todo lo demás; si no se midió nada, la
 * sección queda sin resultado, no aprobada por omisión. */
export function resumir(resultados: Resultado[]): Resultado {
  if (resultados.includes(NO_ACEPTABLE)) return NO_ACEPTABLE
  if (resultados.includes(ACEPTABLE)) return ACEPTABLE
  return SIN_MEDIR
}

export function resultadoDelDia(porSeccion: Resultado[]): ResultadoDia {
  const resumen = resumir(porSeccion)
  return resumen === SIN_MEDIR ? SIN_DATOS : resumen
}

/** Un parámetro que no esté en la tabla no debe romper la pantalla: cae al
 * valor con que se sembró la migración. */
export function parametro(parametros: Parametro[], clave: string, porDefecto: number): number {
  return parametros.find((p) => p.clave === clave)?.valor ?? porDefecto
}

// --- Vista previa del día entero ---------------------------------------------

export interface VistaPrevia {
  factor_z: number | null
  micropipetas: Map<number, CalculoMicropipeta>
  balanza: Map<number, CalculoBalanza>
  temperaturas: Map<number, Resultado>
  gases: Map<number, Resultado>
  resultado_fugas: Resultado
  inyector: Resultado
  detector: CalculoDetector
  secciones: Record<Seccion, Resultado>
  resultado: ResultadoDia
}

interface CatalogosVistaPrevia {
  micropipetas: Micropipeta[]
  pesas: PesaPatron[]
  puntos_temperatura: PuntoTemperatura[]
  gases: Gas[]
  parametros: Parametro[]
  tabla_z: FactorZ[]
}

/**
 * Recalcula el día entero desde lo que hay en el formulario. Es lo que
 * alimenta los colores de cada fila y el veredicto de arriba, y se vuelve a
 * correr en cada tecla: por eso trabaja con Maps y no vuelve a buscar en los
 * catálogos dentro de cada fila.
 */
export function calcularDia(
  borrador: RegistroInput,
  catalogos: CatalogosVistaPrevia,
): VistaPrevia {
  const z = factorZ(borrador.temperatura_agua, catalogos.tabla_z)
  const porId = <T extends { id: number }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]))
  const equipos = porId(catalogos.micropipetas)
  const pesas = porId(catalogos.pesas)
  const puntos = porId(catalogos.puntos_temperatura)

  const micropipetas = new Map<number, CalculoMicropipeta>()
  for (const m of borrador.micropipetas) {
    const equipo = equipos.get(m.micropipeta_id)
    if (!equipo) continue
    micropipetas.set(
      m.micropipeta_id,
      calcularMicropipeta([m.peso_1, m.peso_2, m.peso_3], z, equipo.volumen_nominal, equipo.tolerancia),
    )
  }

  const balanza = new Map<number, CalculoBalanza>()
  for (const b of borrador.balanza) {
    const pesa = pesas.get(b.pesa_id)
    if (!pesa) continue
    balanza.set(
      b.pesa_id,
      calcularBalanza([b.lectura_1, b.lectura_2, b.lectura_3], pesa.valor_nominal, pesa.tolerancia),
    )
  }

  const temperaturas = new Map<number, Resultado>()
  for (const t of borrador.temperaturas) {
    const punto = puntos.get(t.punto_id)
    if (!punto) continue
    temperaturas.set(t.punto_id, calcularTemperatura(t.lectura, punto.minimo, punto.maximo))
  }

  const contenidoMin = parametro(catalogos.parametros, 'gas_presion_contenido_min', 200)
  const trabajoMin = parametro(catalogos.parametros, 'gas_presion_trabajo_min', 80)
  const trabajoMax = parametro(catalogos.parametros, 'gas_presion_trabajo_max', 120)
  const gases = new Map<number, Resultado>()
  for (const g of borrador.gases) {
    gases.set(
      g.gas_id,
      calcularGas(g.presion_contenido, g.presion_trabajo, contenidoMin, trabajoMin, trabajoMax),
    )
  }

  const resultadoFugas = calcularFugas(borrador.fugas_visibles)
  const inyector = calcularInyector(
    borrador.inyector.limpieza_aguja,
    borrador.inyector.aguja_danada,
    borrador.inyector.aguja_reemplazada,
  )
  const detector = calcularDetector(
    borrador.detector.voltaje_perla,
    borrador.detector.metodo_nombre,
    borrador.detector.output_detector,
    parametro(catalogos.parametros, 'perla_voltaje_min', 0),
    parametro(catalogos.parametros, 'perla_voltaje_max', 1),
    parametro(catalogos.parametros, 'output_min', 19),
    parametro(catalogos.parametros, 'output_max', 22),
  )

  const secciones: Record<Seccion, Resultado> = {
    micropipetas: resumir([...micropipetas.values()].map((c) => c.resultado)),
    balanza: resumir([...balanza.values()].map((c) => c.resultado)),
    temperatura: resumir([...temperaturas.values()]),
    gases: resumir([...gases.values(), resultadoFugas]),
    inyector,
    detector: detector.resultado,
  }

  return {
    factor_z: z,
    micropipetas,
    balanza,
    temperaturas,
    gases,
    resultado_fugas: resultadoFugas,
    inyector,
    detector,
    secciones,
    resultado: resultadoDelDia(Object.values(secciones)),
  }
}

// --- Del servidor al formulario ----------------------------------------------

/** Un día en blanco, con una fila por cada equipo activo del catálogo. Es lo
 * que se muestra cuando la fecha elegida todavía no tiene nada registrado. */
export function borradorVacio(config: CatalogosVistaPrevia): RegistroInput {
  const activos = <T extends { activo: boolean }>(xs: T[]) => xs.filter((x) => x.activo)
  return {
    temperatura_agua: null,
    fugas_visibles: '',
    fugas_observacion: '',
    observaciones: '',
    revisado_por: '',
    analista: '',
    termometro_1: null,
    termometro_2: null,
    observacion_edicion: '',
    micropipetas: activos(config.micropipetas).map((m) => ({
      micropipeta_id: m.id,
      analista: '',
      peso_1: null,
      peso_2: null,
      peso_3: null,
      observacion: '',
    })),
    balanza: activos(config.pesas).map((p) => ({
      pesa_id: p.id,
      analista: '',
      lectura_1: null,
      lectura_2: null,
      lectura_3: null,
      observacion: '',
    })),
    temperaturas: activos(config.puntos_temperatura).map((p) => ({
      punto_id: p.id,
      analista: '',
      lectura: null,
      observacion: '',
    })),
    gases: activos(config.gases).map((g) => ({
      gas_id: g.id,
      analista: '',
      codigo_cilindro: '',
      presion_contenido: null,
      presion_trabajo: null,
      observacion: '',
    })),
    inyector: {
      analista: '',
      limpieza_aguja: '',
      aguja_danada: '',
      aguja_reemplazada: '',
      cambio_septa: '',
      observaciones: '',
      metodo_nombre: '',
      observacion: '',
    },
    detector: {
      analista: '',
      voltaje_perla: null,
      metodo_nombre: '',
      output_detector: null,
      observacion: '',
    },
  }
}

/**
 * Un registro guardado, vuelto formulario.
 *
 * Se parte del borrador vacío y se rellenan encima las mediciones que existen:
 * así un equipo agregado al catálogo DESPUÉS de ese día aparece igual —vacío,
 * listo para llenar— en vez de faltar en la pantalla.
 */
export function registroABorrador(
  registro: Registro,
  config: CatalogosVistaPrevia,
): RegistroInput {
  const base = borradorVacio(config)
  const mezclar = <T, U>(
    filas: T[],
    guardadas: U[],
    clave: (x: T | U) => number,
    unir: (fila: T, guardada: U) => T,
  ): T[] => {
    const porClave = new Map(guardadas.map((g) => [clave(g), g]))
    const conocidas = new Set(filas.map(clave))
    const mezcladas = filas.map((f) => {
      const guardada = porClave.get(clave(f))
      return guardada ? unir(f, guardada) : f
    })
    // Una medición de un equipo que después se desactivó tiene que seguir
    // viéndose: si no, guardar el día la borraría sin que nadie lo pida.
    const huerfanas = guardadas.filter((g) => !conocidas.has(clave(g)))
    return [...mezcladas, ...(huerfanas as unknown as T[])]
  }

  return {
    ...base,
    temperatura_agua: registro.temperatura_agua,
    fugas_visibles: registro.fugas_visibles,
    fugas_observacion: registro.fugas_observacion ?? '',
    observaciones: registro.observaciones,
    revisado_por: registro.revisado_por,
    analista: registro.analista ?? '',
    termometro_1: registro.termometro_1 ?? null,
    termometro_2: registro.termometro_2 ?? null,
    observacion_edicion: '',
    micropipetas: mezclar(
      base.micropipetas,
      registro.micropipetas,
      (x) => x.micropipeta_id,
      (fila, g) => ({
        micropipeta_id: fila.micropipeta_id,
        analista: g.analista,
        peso_1: g.peso_1,
        peso_2: g.peso_2,
        peso_3: g.peso_3,
        observacion: g.observacion ?? '',
      }),
    ),
    balanza: mezclar(
      base.balanza,
      registro.balanza,
      (x) => x.pesa_id,
      (fila, g) => ({
        pesa_id: fila.pesa_id,
        analista: g.analista,
        lectura_1: g.lectura_1,
        lectura_2: g.lectura_2,
        lectura_3: g.lectura_3,
        observacion: g.observacion ?? '',
      }),
    ),
    temperaturas: mezclar(
      base.temperaturas,
      registro.temperaturas,
      (x) => x.punto_id,
      (fila, g) => ({ punto_id: fila.punto_id, analista: g.analista, lectura: g.lectura, observacion: g.observacion ?? '' }),
    ),
    gases: mezclar(
      base.gases,
      registro.gases,
      (x) => x.gas_id,
      (fila, g) => ({
        gas_id: fila.gas_id,
        analista: g.analista,
        codigo_cilindro: g.codigo_cilindro,
        presion_contenido: g.presion_contenido,
        presion_trabajo: g.presion_trabajo,
        observacion: g.observacion ?? '',
      }),
    ),
    inyector: {
      analista: registro.inyector.analista,
      limpieza_aguja: registro.inyector.limpieza_aguja,
      aguja_danada: registro.inyector.aguja_danada,
      aguja_reemplazada: registro.inyector.aguja_reemplazada,
      cambio_septa: registro.inyector.cambio_septa,
      observaciones: registro.inyector.observaciones,
      metodo_nombre: registro.inyector.metodo_nombre ?? '',
      observacion: registro.inyector.observacion ?? '',
    },
    detector: {
      analista: registro.detector.analista,
      voltaje_perla: registro.detector.voltaje_perla,
      metodo_nombre: registro.detector.metodo_nombre ?? '',
      output_detector: registro.detector.output_detector,
      observacion: registro.detector.observacion ?? '',
    },
  }
}
