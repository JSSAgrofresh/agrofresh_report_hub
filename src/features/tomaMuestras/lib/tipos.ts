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
  csg_productor: string | null
  csg_packing: string | null
  lote: string | null
  posicion_muestreo: string | null
  numero_camara: string | null
  numero_orden: string | null
  kilos_procesados: number | null
  producto_utilizado: string | null
  /** Lo que se eligió de verdad; `producto_utilizado` dice MIXTO si son 2 o más
   * (o más de 2 en las solicitudes anteriores, sin `mixto_desde_2`). */
  productos_lista?: string[]
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
  /** Una solicitud se puede editar y enviar solo mientras esto sea false.
   * Una vez enviada por correo queda de solo lectura. */
  enviada: boolean
  enviado_en: string | null
  /** Reanálisis (migración 0038) */
  tipo_solicitud: 'CONVENCIONAL' | 'REANALISIS'
  solicitud_original_archivo: string | null
  motivo_reanalisis: string | null
  /** Solicitud de prueba: folio de su propia serie (OTP-DIAG0001), nunca se
   * envía sola y su correo dice "(PRUEBA)". Ausente = false. */
  es_prueba?: boolean
  /** Creada con la regla nueva: dice MIXTO desde 2 productos. Ausente = la regla
   * de antes (MIXTO desde 3); lo ya emitido no se reescribe. */
  mixto_desde_2?: boolean
  /** Los resultados no tienen a nadie del cliente en Para (para su Sold To,
   * Ship To y especie): rige el respaldo, solo Jorge y Claudia. Lo calcula el
   * backend con los contactos de hoy; no se guarda. */
  sin_lista_distribucion?: boolean | null
  /** El informe del laboratorio, si ya llegó (lo agrega la pantalla desde
   * `/toma-muestras/solicitudes-informes`; null/ausente = sin informe). */
  informe?: InformeSolicitud | null
}

/** El informe de una solicitud: el PDF subido por Converter con su OT y/o los
 * resultados en Report que traen el OT. */
export interface InformeSolicitud {
  nro_informe: string | null
  /** Todos los N° de informe (AgroFresh sube uno por vial). */
  numeros: string[]
  /** Hay PDF subido por Converter; si es false, el PDF se busca al abrirlo y puede no estar. */
  pdf_guardado: boolean
  en_report: boolean
}

/** Envío automático al guardar: regla general + una propia por tipo de aplicación. */
export interface ConfigEnvioAutomatico {
  activo: boolean
  por_tipo?: Record<string, boolean>
}

export interface EstadoSolicitudesPrueba {
  /** Solo la cuenta autorizada ve el botón. */
  permitido: boolean
}

/** Entrada para crear una solicitud de reanálisis. */
export interface ReanalisisInput {
  motivo: string
  solicitante: string
  sold_to: string
  ship_to: string | null
  especie: string | null
  variedad: string | null
  linea_proceso: string | null
  csg_productor: string | null
  csg_packing: string | null
  lote: string | null
  posicion_muestreo: string | null
  numero_camara: string | null
  numero_orden: string | null
  kilos_procesados: number | null
  producto_utilizado: string | null
  /** Lo que se eligió de verdad; `producto_utilizado` dice MIXTO si son 2 o más
   * (o más de 2 en las solicitudes anteriores, sin `mixto_desde_2`). */
  productos_lista?: string[]
  tipo_muestra: string | null
  fecha_muestreo: string | null
  hora_muestreo: string | null
  nombre_muestreador: string | null
  generado_por: string
  email_solicitante: string | null
  email_laboratorio: string | null
  observacion: string | null
  campos_laboratorio: Record<string, string>
  analitos_solicitados: string[]
}

export type SolicitudInput = Omit<
  Solicitud,
  | 'archivo'
  | 'numero_solicitud'
  | 'fecha_solicitud'
  | 'creado_en'
  | 'enviada'
  | 'enviado_en'
  | 'tipo_solicitud'
  | 'solicitud_original_archivo'
  | 'motivo_reanalisis'
  | 'es_prueba'
  | 'mixto_desde_2'
>

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
  /** Va en cada folio de este laboratorio: OT-{prefijo}{correlativo}, ej.
   * OT-AGF0001. Vacío mientras nadie lo configure. */
  prefijo_solicitud: string
  activo: boolean
  orden: number
  adjuntos_excel: boolean
  adjuntos_json: boolean
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
  especie: string
}
