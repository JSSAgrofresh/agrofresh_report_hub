export interface ResultadoAnalito {
  analito: string
  codigo: string | null
  area: number | null
  amount: number | null
  /** Tiempo de retención en minutos. Solo lo usa la vista de detalle; el
   * cruce y el informe no lo miran. */
  rettime?: number | null
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
}

/** Una corrida del GC trae, además de las muestras de cliente, la curva de
 * calibración, blancos y controles de limpieza. El cruce los descarta —no son
 * de nadie—, pero al revisar la corrida son justamente lo que se mira. */
export interface MuestraGCDetalle extends MuestraGC {
  es_muestra: boolean
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
}

export interface FilaCruce {
  campos: Record<string, string>
  analitos_solicitados: string[]
  resultados_por_codigo: Record<string, number | null>
  codigo_vial?: string | null
  fecha_inyeccion?: string | null
  /** Fecha en que la muestra física llegó al laboratorio (ISO
   * "YYYY-MM-DD"): no viene ni de la solicitud ni del GC, se elige a mano
   * en la zona de cruce. */
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
}

export interface FilaSubida {
  nro_solicitud_original: string
  codigo_vial: string | null
  estado: 'creada' | 'ya_existia' | 'error'
  folio: string | null
  mensaje: string | null
}
