import { httpClient } from '@/services/http/client'

export type ClaveServicioReport = 'linea_proceso' | 'actimist' | 'ecofog' | 'ryd'

export interface ServicioReport {
  clave: ClaveServicioReport
  etiqueta: string
  activo: boolean
}

export interface GraficosInformes {
  /** Report muestra la línea de tiempo y la serie de tiempo de ALS y Diagnofruit; apagado, solo la tabla. */
  activo: boolean
  cambiado_por: string | null
  cambiado_en: string | null
}

export type TemaCliente = 'basico' | 'sobrio'

export interface EstadoTemaCliente {
  /** Estilo del dashboard que ven hoy los clientes y comerciales. */
  valor: TemaCliente
  cambiado_por: string | null
  cambiado_en: string | null
}

/** Estilo de una cuenta: los dos del portal o el marco interno de siempre (barra lateral; solo comerciales). */
export type TemaCuenta = 'basico' | 'sobrio' | 'clasico'
export type TipoConPortal = 'cliente' | 'comercial'

export interface CuentaConPortal {
  id: string
  nombre: string
  email: string
  tipo: TipoConPortal
  cliente: string | null
  planta: string | null
  /** El estilo que ve hoy esta cuenta. */
  tema: TemaCuenta
  /** Tiene una regla propia (no hereda de su tipo ni del predeterminado). */
  propio: boolean
}

export interface EstadoTemasCuenta {
  /** El estilo dejado para cada tipo de cuenta; `null` = el predeterminado. */
  tipos: Record<TipoConPortal, TemaCuenta | null>
  cuentas: CuentaConPortal[]
  cambiado_por: string | null
  cambiado_en: string | null
}

export interface EstadoFunciones {
  tema_cliente?: EstadoTemaCliente
  temas_cuenta?: EstadoTemasCuenta
  graficos_informes?: GraficosInformes
  report: {
    servicios: ServicioReport[]
    cambiado_por: string | null
    cambiado_en: string | null
  }
  /** Falta correr la migración 0055 en el servidor: Report muestra todo hasta entonces. */
  migracion_pendiente: boolean
}

export function obtenerFunciones() {
  return httpClient.get<EstadoFunciones>('/funciones')
}

/** Solo el administrador principal, con su contraseña, para encender o apagar. */
export function cambiarServicioReport(servicio: ClaveServicioReport, activo: boolean, password: string) {
  return httpClient.put<EstadoFunciones>('/funciones/report', { servicio, activo, password })
}

/** Los gráficos de ALS y Diagnofruit en Report. Solo el administrador principal, con su contraseña. */
export function cambiarGraficosInformes(activo: boolean, password: string) {
  return httpClient.put<EstadoFunciones>('/funciones/graficos-informes', { activo, password })
}

/** El estilo del dashboard de clientes. Solo el administrador principal, con su contraseña. */
export function cambiarTemaCliente(tema: TemaCliente, password: string) {
  return httpClient.put<EstadoFunciones>('/funciones/tema-cliente', { tema, password })
}

/** Un estilo para un TIPO de cuenta o para UNA cuenta; `tema: null` quita la regla. Solo el administrador principal, con su contraseña. */
export function cambiarTemaCuenta(
  destino: { tipo: TipoConPortal } | { usuario_id: string },
  tema: TemaCuenta | null,
  password: string,
) {
  return httpClient.put<EstadoFunciones>('/funciones/tema-cuenta', { ...destino, tema, password })
}
