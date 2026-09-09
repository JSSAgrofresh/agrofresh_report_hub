export interface ResultadoAnalito {
  analito: string
  codigo: string | null
  area: number | null
  amount: number | null
  /** Tiempo de retención en minutos. Solo lo usa la vista de detalle; el
   * cruce y el informe no lo miran. */
  rettime?: number | null
  /** Cómo integró el equipo ese pico ("BBA", "MM"…). "MM" es integración
   * manual: alguien lo ajustó a mano, y eso tiene que quedar a la vista. */
  tipo?: string
  /** El factor con que ese pico pasó de área a concentración. */
  amt_area?: number | null
  grp?: string
}

export interface MuestraGC {
  codigo: string
  seq_line: number | null
  fecha_inyeccion: string | null
  resultados: ResultadoAnalito[]
}

export interface Solicitud {
  archivo: string
  campos: Record<string, string>
  analitos_solicitados: string[]
  /** Con qué muestra física quedó cruzada, o `null` si todavía no llega. Es
   * el mismo código que después trae el archivo del GC, así que al subir los
   * resultados cada vial encuentra su solicitud sin emparejar nada a mano. */
  codigo_muestra?: string | null
  /** Cuándo llegó la muestra física al mesón, en fecha ("YYYY-MM-DD") y hora
   * ("HH:MM") locales. No se pregunta en ningún formulario: el backend lo
   * llena con el instante exacto en que se hizo el cruce. */
  fecha_recepcion?: string | null
  hora_recepcion?: string | null
}

/** Una corrida del GC trae, además de las muestras de cliente, la curva de
 * calibración, blancos y controles de limpieza. El cruce los descarta —no son
 * de nadie—, pero al revisar la corrida son justamente lo que se mira. */
export interface MuestraGCDetalle extends MuestraGC {
  es_muestra: boolean
  /** Posición del carrusel donde iba el vial. Sale de la tabla de la
   * secuencia del archivo del GC y viaja de vuelta al backend al pedir el
   * Excel: es lo que permite volver al vial físico. */
  ubicacion?: string | null
  /** La ficha que el equipo escribe arriba de la inyección y la línea que le
   * toca en la tabla de la secuencia, con las etiquetas del equipo tal cual
   * ("Sample Type", "Method Name", "Data File"…). */
  datos?: Record<string, string>
  secuencia?: Record<string, string>
  /** La suma de concentraciones del vial, como la reporta el equipo. */
  totales?: number | null
  /** "Negative results set to zero", "Calibrated compound(s) not found"… Sin
   * esto, un cero forzado y un "no se detectó nada" se ven igual. */
  advertencias?: string[]
  recalibrado?: boolean
}

/** Un nivel de la curva del método: con esto el equipo convierte área en
 * concentración. Sin la curva, ningún resultado se puede recalcular. */
export interface FilaCurvaGC {
  compuesto: string
  rettime?: number | null
  senal?: string
  nivel?: number | null
  amount?: number | null
  area?: number | null
  factor_respuesta?: number | null
  ref?: string
  istd?: string
}

/** Una inyección de la curva, o una de las filas con que el equipo la cierra
 * (Mean, S.D., RSD, 95% CI). El RSD es el criterio de aceptación. */
export interface FilaEstadisticaGC {
  compuesto: string
  senal?: string
  corrida?: number | null
  estadistico?: string
  tipo?: string
  rettime?: number | null
  amount?: number | null
  area?: number | null
  alto?: number | null
  ancho?: number | null
  simetria?: number | null
}

export interface FilaResumenGC {
  corrida?: number | null
  ubicacion?: string
  inyeccion?: number | null
  vial?: string
  cantidad?: number | null
  multiplicador?: number | null
  archivo?: string
  es_punto_de_curva?: boolean
  compuestos_detectados?: number | null
}

export interface EventoBitacoraGC {
  modulo: string
  mensaje: string
  fecha: string
}

export interface CambioMetodoGC {
  operador: string
  fecha: string
  cambio: string
}

/** Un tramo del archivo que es todo de la misma categoría, con las líneas
 * numeradas desde 1 como en un editor. La pantalla dibuja un bloque por
 * región y no una fila por línea: son ~190 nodos en vez de ~9.500. */
export interface RegionGC {
  inicio: number
  fin: number
  categoria: string
}

export interface CategoriaGC {
  id: string
  nombre: string
  /** A qué hoja del Excel va a parar, o null si el equipo la escribe pero el
   * sistema no la ocupa. */
  hoja: string | null
}

/** Con qué se midió: instrumento, columna y parámetros de la secuencia. Es
 * lo que respalda un resultado si alguien lo cuestiona. Viene como lista y no
 * como objeto porque el orden importa: es el del archivo. */
export interface CampoCabeceraGC {
  seccion: string
  campo: string
  valor: string
}

export interface DetalleGC {
  cabecera: CampoCabeceraGC[]
  muestras: MuestraGCDetalle[]
  /** Con qué condiciones se midió: horno, inyector, columna, detector. */
  metodo?: CampoCabeceraGC[]
  auditoria?: CambioMetodoGC[]
  curva?: FilaCurvaGC[]
  estadistica?: FilaEstadisticaGC[]
  resumen?: FilaResumenGC[]
  bitacora?: EventoBitacoraGC[]
  /** El archivo tal como salió del equipo, y de qué es cada tramo. Es lo que
   * dibuja el visor; no vuelve al backend al pedir el Excel. */
  texto?: string
  regiones?: RegionGC[]
  categorias?: CategoriaGC[]
}

export interface FilaCruce {
  campos: Record<string, string>
  analitos_solicitados: string[]
  resultados_por_codigo: Record<string, number | null>
  codigo_vial?: string | null
  fecha_inyeccion?: string | null
  /** Fecha en que la muestra física llegó al laboratorio (ISO
   * "YYYY-MM-DD"). Sale del cruce de cada solicitud, no se elige a mano. */
  fecha_recepcion?: string | null
}

/** Datos del informe que no vienen del cruce solicitud+GC (quién analiza,
 * quién aprueba) y que quedan seteados en la app hasta que alguien los
 * cambie -por ejemplo, cuando la jefa de Cromatografía sale de vacaciones y
 * firma otra persona-. */
export interface InformeConfig {
  analizado_por_nombre: string
  analizado_por_cargo: string
  aprobado_por_nombre: string
  aprobado_por_cargo: string
  /** Apagado, el informe sale con una sola firma: la de aprobación, abajo a
   * la derecha. No siempre hay analista que firme. */
  incluir_analista: boolean
  /** False mientras falte correr la migración 0022 en el servidor. El check
   * no se puede guardar todavía, y hay que decirlo en vez de aceptarlo y
   * revertirlo sin explicación. */
  incluir_analista_disponible?: boolean
}

export interface FilaSubida {
  nro_solicitud_original: string
  codigo_vial: string | null
  estado: 'creada' | 'ya_existia' | 'error'
  folio: string | null
  mensaje: string | null
}
