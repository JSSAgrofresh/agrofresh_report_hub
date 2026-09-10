/**
 * Verificaciones diarias del laboratorio .
 *
 * Estos tipos son el espejo de los modelos de `backend/app/verificaciones.py`.
 * Los `*Input` son lo que se manda al guardar; el resto trae además lo que
 * calculó el servidor (volúmenes, promedios, veredictos) y el contexto del
 * catálogo, para que la tabla se pueda pintar sin volver a cruzar nada.
 */

/** Lo que dice una verificación. `''` es "no se midió", que no es lo mismo
 * que "no aceptable": un día a medio llenar no es un día con un problema. */
export type Resultado = 'Aceptable' | 'No aceptable' | ''

/** El veredicto del día completo. Si no se midió nada, "Sin datos". */
export type ResultadoDia = 'Aceptable' | 'No aceptable' | 'Sin datos'

/** Las respuestas de sí/no del formulario. `''` es "todavía sin responder". */
export type Respuesta = 'Sí' | 'No' | 'N.A.' | ''

export const SECCIONES = [
  'micropipetas',
  'balanza',
  'temperatura',
  'gases',
  'inyector',
  'detector',
] as const

export type Seccion = (typeof SECCIONES)[number]

export const NOMBRE_SECCION: Record<Seccion, string> = {
  micropipetas: 'Micropipetas',
  balanza: 'Balanza',
  temperatura: 'Temperatura',
  gases: 'Gases',
  inyector: 'Inyector',
  detector: 'Detector y método',
}

// --- Catálogos ---------------------------------------------------------------

export interface Micropipeta {
  id: number
  nombre: string
  codigo: string
  /** Una micropipeta se verifica a varios volúmenes, y cada volumen tiene su
   * propia tolerancia: por eso el catálogo tiene una fila por par. */
  volumen_nominal: number
  tolerancia: number
  orden: number
  activo: boolean
}

export type MicropipetaInput = Omit<Micropipeta, 'id'>

export interface PesaPatron {
  id: number
  nombre: string
  codigo: string
  /** En miligramos, siempre. */
  valor_nominal: number
  tolerancia: number
  orden: number
  activo: boolean
}

export type PesaPatronInput = Omit<PesaPatron, 'id'>

export interface PuntoTemperatura {
  id: number
  nombre: string
  codigo: string
  minimo: number
  maximo: number
  orden: number
  activo: boolean
}

export type PuntoTemperaturaInput = Omit<PuntoTemperatura, 'id'>

export interface Gas {
  id: number
  nombre: string
  codigo: string
  orden: number
  activo: boolean
}

export type GasInput = Omit<Gas, 'id'>

/** Los criterios que no son de un equipo sino del sistema entero. Las claves
 * las conoce el cálculo por nombre, así que no se crean ni se borran. */
export interface Parametro {
  clave: string
  valor: number
  descripcion: string
  unidad: string
  orden: number
}

export interface FactorZ {
  temperatura: number
  factor: number
}

export interface ConfigVerificaciones {
  micropipetas: Micropipeta[]
  pesas: PesaPatron[]
  puntos_temperatura: PuntoTemperatura[]
  gases: Gas[]
  parametros: Parametro[]
  tabla_z: FactorZ[]
}

// --- Mediciones --------------------------------------------------------------

export interface MicropipetaMedicionInput {
  micropipeta_id: number
  analista: string
  peso_1: number | null
  peso_2: number | null
  peso_3: number | null
  observacion: string
}

export interface MicropipetaMedicion extends MicropipetaMedicionInput {
  nombre: string
  volumen_nominal: number
  tolerancia: number
  volumen_medio: number | null
  desviacion: number | null
  error_pct: number | null
  resultado: Resultado
}

export interface BalanzaMedicionInput {
  pesa_id: number
  analista: string
  lectura_1: number | null
  lectura_2: number | null
  lectura_3: number | null
  observacion: string
}

export interface BalanzaMedicion extends BalanzaMedicionInput {
  nombre: string
  valor_nominal: number
  tolerancia: number
  promedio: number | null
  desviacion: number | null
  resultado: Resultado
}

export interface TemperaturaMedicionInput {
  punto_id: number
  analista: string
  lectura: number | null
  observacion: string
}

export interface TemperaturaMedicion extends TemperaturaMedicionInput {
  nombre: string
  minimo: number
  maximo: number
  resultado: Resultado
}

export interface GasMedicionInput {
  gas_id: number
  analista: string
  codigo_cilindro: string
  presion_contenido: number | null
  presion_trabajo: number | null
  observacion: string
}

export interface GasMedicion extends GasMedicionInput {
  nombre: string
  resultado: Resultado
}

export interface InyectorInput {
  analista: string
  limpieza_aguja: Respuesta
  aguja_danada: Respuesta
  aguja_reemplazada: Respuesta
  cambio_septa: Respuesta
  observaciones: string
  metodo_nombre: string
  observacion: string
}

export interface Inyector extends InyectorInput {
  resultado: Resultado
}

export interface DetectorInput {
  analista: string
  voltaje_perla: number | null
  metodo_nombre: string
  output_detector: number | null
  observacion: string
}

export interface Detector extends DetectorInput {
  metodo_correcto: string
  resultado_voltaje: Resultado
  resultado_metodo: Resultado
  resultado_output: Resultado
  resultado: Resultado
}

// --- El día ------------------------------------------------------------------

export interface RegistroInput {
  temperatura_agua: number | null
  fugas_visibles: Respuesta
  fugas_observacion: string
  observaciones: string
  revisado_por: string
  analista: string
  termometro_1: number | null
  termometro_2: number | null
  observacion_edicion: string
  micropipetas: MicropipetaMedicionInput[]
  balanza: BalanzaMedicionInput[]
  temperaturas: TemperaturaMedicionInput[]
  gases: GasMedicionInput[]
  inyector: InyectorInput
  detector: DetectorInput
}

export interface Registro {
  fecha: string
  temperatura_agua: number | null
  factor_z: number | null
  fugas_visibles: Respuesta
  fugas_observacion: string
  resultado_fugas: Resultado
  observaciones: string
  revisado_por: string
  analista: string
  termometro_1: number | null
  termometro_2: number | null
  editado_por: string | null
  editado_en: string | null
  observacion_edicion: string
  creado_por: string
  actualizado_en: string | null
  micropipetas: MicropipetaMedicion[]
  balanza: BalanzaMedicion[]
  temperaturas: TemperaturaMedicion[]
  gases: GasMedicion[]
  inyector: Inyector
  detector: Detector
  resultados_seccion: Record<Seccion, Resultado>
  resultado: ResultadoDia
}

/** Una fila del resumen diario: el día y cómo salió cada sección. */
export interface ResumenDia extends Record<Seccion, Resultado> {
  fecha: string
  resultado: ResultadoDia
  observaciones: string
  revisado_por: string
}
