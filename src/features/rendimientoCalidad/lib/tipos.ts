export type Bloque = 'residuales' | 'fsma' | 'fito'
export type Servicio = 'linea' | 'actimist' | 'ecofog'

/** Una celda ya sumada por el servidor: informes de ese cliente, planta, semana (lunes), análisis y servicio. */
export interface FilaRendimiento {
  sold_to: string
  ship_to: string
  /** Lunes de la semana de muestreo, AAAA-MM-DD. */
  semana: string
  bloque: Bloque
  servicio: Servicio
  cumple: number
  no_cumple: number
}

export interface RespuestaRendimiento {
  filas: FilaRendimiento[]
  /** Informes que no se pudieron juzgar (especie sin tabla de límites, sin analitos con límite…), por análisis. */
  sin_criterio: Record<Bloque, number>
  fuera: { sin_fecha: number; otro_laboratorio: number }
  moderado_cumple: boolean
}

export interface Conteo {
  cumple: number
  noCumple: number
}

/** Un análisis: el total y, para Residuales (la pantalla solo lo desglosa ahí), Línea de proceso, Actimist y Ecofog. */
export interface CeldaBloque {
  linea: Conteo
  actimist: Conteo
  ecofog: Conteo
  total: Conteo
}

export type Bloques = Record<Bloque, CeldaBloque>

export interface FilaPlanta {
  soldTo: string
  shipTo: string
  bloques: Bloques
  /** % No cumple general (promedio de los análisis con informes), o `null` si no hay ninguno. */
  general: number | null
}

export interface FilaSemana {
  /** Lunes de la semana, AAAA-MM-DD. */
  semana: string
  bloques: Bloques
  general: number | null
}

// ── Detalle de una planta (el modal que se abre al hacer clic en una fila) ──
export type EstadoAnalito = 'dentro' | 'sobre' | 'bajo' | 'sin_limite' | 'sin_medida'
export type NivelFito = 'optimo' | 'moderado' | 'peligroso'

export interface AnalitoResidual {
  codigo: string
  nombre: string
  unidad: string
  valor: number | null
  /** «<» o «>» cuando el laboratorio dio un límite y no un valor. */
  signo: string
  min: number | null
  max: number | null
  estado: EstadoAnalito
  /** Cuánto se pasa: positivo sobre el máximo, negativo bajo el mínimo, 0 dentro. */
  desvio: number
}

export interface AnalitoFsma {
  codigo: string
  nombre: string
  unidad: string | null
  valor: number | string | null
  detecto: boolean | null
}

export interface AnalitoFito {
  codigo: string
  nombre: string
  unidad: string | null
  valor: number | null
  signo: string
  optimo_hasta: number
  peligroso_desde: number
  nivel: NivelFito | null
}

interface InformeBase {
  id: number
  informe: string | null
  ot: string | null
  laboratorio: string
  servicio: Servicio
  especie: string | null
  variedad: string | null
  fecha: string
  semana: string
  /** `null` = no se pudo juzgar. */
  cumple: boolean | null
}

export type InformeDetalle =
  | (InformeBase & { bloque: 'residuales'; analitos: AnalitoResidual[] })
  | (InformeBase & { bloque: 'fsma'; analitos: AnalitoFsma[] })
  | (InformeBase & { bloque: 'fito'; analitos: AnalitoFito[] })

export interface RespuestaDetalle {
  informes: InformeDetalle[]
}
