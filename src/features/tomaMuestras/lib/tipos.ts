export const LABORATORIOS = ['QUITECA', 'AGROFRESH', 'ALS', 'DIAGNOFRUIT'] as const
export type Laboratorio = (typeof LABORATORIOS)[number]

export interface Solicitud {
  archivo: string
  numero_solicitud: string
  fecha_solicitud: string
  laboratorio: string
  solicitante: string
  sold_to: string
  ship_to: string | null
  especie: string | null
  variedad: string | null
  linea_proceso: string | null
  csg: string | null
  lote: string | null
  posicion_muestreo: string | null
  numero_camara: string | null
  numero_orden: string | null
  kilos_procesados: number | null
  producto_utilizado: string | null
  tipo_muestra: string | null
  fecha_muestreo: string | null
  hora_muestreo: string | null
  nombre_muestreador: string | null
  generado_por: string
  email_solicitante: string | null
  email_laboratorio: string | null
  observacion: string | null
  /** Campos propios del laboratorio elegido (etiqueta -> valor). */
  campos_laboratorio: Record<string, string>
  /** Códigos de los analitos marcados como solicitados (ej. ["FDL", "PYR"]). */
  analitos_solicitados: string[]
  creado_en: string
}

export type SolicitudInput = Omit<Solicitud, 'archivo' | 'numero_solicitud' | 'fecha_solicitud' | 'creado_en'>

/** Metadatos de un campo general del formulario (§3): el conjunto de
 * claves es fijo, pero etiqueta/tipo/requerido/activo/orden los define el
 * administrador desde el mantenedor de Toma de muestras. */
export interface CampoConfig {
  clave: string
  etiqueta: string
  tipo: 'text' | 'number' | 'date' | 'time' | 'email' | 'textarea' | 'select'
  requerido: boolean
  activo: boolean
  orden: number
}

/** Opción simple de un mantenedor (tipos de aplicación, líneas de proceso). */
export interface OpcionConfig {
  id: number
  nombre: string
  activo: boolean
  orden: number
}

export type OpcionInput = Omit<OpcionConfig, 'id'>

/** Un análisis disponible para un laboratorio. `dosis_aplicable` distingue
 * los analitos de cromatografía (QUITECA/AGROFRESH), que llevan una dosis
 * aplicada asociada, de los de resultado directo (DIAGNOFRUIT/ALS). */
export interface AnalitoConfig {
  id: number
  laboratorio: string
  categoria: string
  codigo: string
  nombre: string
  unidad: string | null
  tipo: 'numero' | 'texto'
  dosis_aplicable: boolean
  requerido: boolean
  activo: boolean
  orden: number
  tipo_aplicacion: string
}

export type AnalitoInput = Omit<AnalitoConfig, 'id'>

/** Laboratorio disponible para elegir en la solicitud (mantenedor). */
export interface LaboratorioConfig {
  id: number
  codigo: string
  nombre: string
  descripcion: string | null
  activo: boolean
  orden: number
}

export type LaboratorioInput = Omit<LaboratorioConfig, 'id'>

/** Categoría que agrupa analitos dentro de un laboratorio. */
export interface CategoriaAnaliticaConfig {
  id: number
  laboratorio: string
  nombre: string
  activo: boolean
  orden: number
}

export type CategoriaAnaliticaInput = Omit<CategoriaAnaliticaConfig, 'id'>

/** Producto disponible para "Producto Utilizado" según laboratorio +
 * tipo de aplicación (vacío en tipo_aplicacion = aplica a cualquiera). */
export interface ProductoConfig {
  id: number
  nombre: string
  codigo: string | null
  laboratorio: string
  tipo_aplicacion: string
  activo: boolean
  orden: number
}

export type ProductoInput = Omit<ProductoConfig, 'id'>

/** Campo adicional que aparece según el Tipo de Aplicación elegido.
 * `ambito` = "comun" (siempre visible) o el nombre exacto de un tipo de
 * aplicación (ej. "Actimist"), configurado en el mantenedor. */
export interface CampoTipoAplicacionConfig {
  id: number
  ambito: string
  clave: string
  etiqueta: string
  tipo: 'text' | 'number' | 'date' | 'time'
  requerido: boolean
  activo: boolean
  orden: number
}

export type CampoTipoAplicacionInput = Omit<CampoTipoAplicacionConfig, 'id'>

/** Un destinatario de resultados, tal como quedó configurado en
 * Laboratorios → Resultado a clientes para un Ship To. Nueva solicitud lo
 * muestra de solo lectura -no se edita desde acá-. */
export interface ContactoResultado {
  nombre: string
  email: string
  tipo: 'resultado_cliente' | 'resultado_interno'
  tipo_copia: 'cc' | 'bcc'
}
