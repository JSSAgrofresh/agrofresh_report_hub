/** Escala en que un laboratorio informa un resultado (ppm, mg/kg, …). Antes
 * era texto libre dentro de cada analito; ahora es un mantenedor propio para
 * que el administrador pueda agregar escalas sin tocar código. */
export interface Unidad {
  id: number
  simbolo: string
  nombre: string
  activo: boolean
  orden: number
}

export type UnidadInput = Omit<Unidad, 'id'>

/** A quién se le escribe de un laboratorio. Solicitudes y resultados
 * comparten entidad y se distinguen por `tipo`. */
export type TipoContacto = 'solicitud' | 'resultado_cliente' | 'resultado_interno'

export const TIPOS_CONTACTO: { valor: TipoContacto; etiqueta: string; descripcion: string }[] = [
  {
    valor: 'solicitud',
    etiqueta: 'Solicitudes',
    descripcion: 'Reciben la solicitud de muestreo cuando se emite.',
  },
  {
    valor: 'resultado_cliente',
    etiqueta: 'Resultados · Cliente',
    descripcion: 'El laboratorio envía los resultados a estos correos del cliente.',
  },
  {
    valor: 'resultado_interno',
    etiqueta: 'Resultados · Interno',
    descripcion: 'Copia de los resultados que llega a AgroFresh.',
  },
]

export interface Contacto {
  id: number
  laboratorio: string
  nombre: string
  email: string
  cargo: string
  tipo: TipoContacto
  activo: boolean
  orden: number
}

export type ContactoInput = Omit<Contacto, 'id'>

export interface TemplateMail {
  laboratorio: string
  asunto: string
  cuerpo: string
  variables: string[]
}

export type TemplateMailInput = Pick<TemplateMail, 'asunto' | 'cuerpo'>

/** Cómo se piden los analitos de un análisis. */
export type ModoAnalisis = 'seleccionable' | 'completo'

export const MODOS_ANALISIS: { valor: ModoAnalisis; etiqueta: string; descripcion: string }[] = [
  {
    valor: 'seleccionable',
    etiqueta: 'Seleccionable',
    descripcion: 'Al pedir el análisis se elige cuáles de estos analitos se solicitan.',
  },
  {
    valor: 'completo',
    etiqueta: 'Panel completo',
    descripcion: 'El análisis siempre incluye todos sus analitos, no se eligen por separado.',
  },
]

/** Un analito dentro de un análisis. La unidad vive acá y no en el analito
 * porque el mismo analito puede informarse en ppm en un análisis y en mg/kg
 * en otro. */
export interface AnalitoDeAnalisis {
  analito_id: number
  unidad: string
  preseleccionado: boolean
}

export interface Analisis {
  id: number
  laboratorio: string
  nombre: string
  observaciones: string
  modo: ModoAnalisis
  analitos: AnalitoDeAnalisis[]
  activo: boolean
  orden: number
}

export type AnalisisInput = Omit<Analisis, 'id'>

/** Fila de la grilla de tarjetas: el laboratorio con sus contadores ya
 * calculados en el backend, para no cruzar cuatro listas en el navegador. */
export interface ResumenLaboratorio {
  codigo: string
  nombre: string
  descripcion: string | null
  activo: boolean
  orden: number
  n_analisis: number
  n_contactos: number
  n_analitos: number
}
