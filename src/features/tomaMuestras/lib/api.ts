import { httpClient } from '@/services/http/client'
import type {
  AnalitoConfig,
  AnalitoInput,
  CampoConfig,
  CampoTipoAplicacionConfig,
  CampoTipoAplicacionInput,
  CategoriaAnaliticaConfig,
  CategoriaAnaliticaInput,
  LaboratorioConfig,
  LaboratorioInput,
  OpcionConfig,
  OpcionInput,
  ProductoConfig,
  ProductoInput,
  Solicitud,
  SolicitudInput,
} from './tipos'

export function enviarCorreoPrueba(destinatario: string) {
  return httpClient.post<{ ok: string }>('/correo/prueba', { destinatario })
}

export function listarSolicitudes() {
  return httpClient.get<Solicitud[]>('/toma-muestras/solicitudes')
}

export function obtenerSolicitud(archivo: string) {
  return httpClient.get<Solicitud>(`/toma-muestras/solicitudes/${encodeURIComponent(archivo)}`)
}

export function crearSolicitud(datos: SolicitudInput) {
  return httpClient.post<Solicitud>('/toma-muestras/solicitudes', datos)
}

export function eliminarSolicitud(archivo: string) {
  return httpClient.delete<{ estado: string }>(`/toma-muestras/solicitudes/${encodeURIComponent(archivo)}`)
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

/** El Excel es el documento maestro guardado al crear la solicitud (o
 * generado al vuelo, con el mismo formato, para solicitudes legadas). */
export function urlDescargaExcel(archivo: string) {
  return `${API_BASE_URL}/toma-muestras/solicitudes/${encodeURIComponent(archivo)}/excel`
}

export function urlDescargaPdf(archivo: string) {
  return `${API_BASE_URL}/toma-muestras/solicitudes/${encodeURIComponent(archivo)}/pdf`
}

export function enviarSolicitudPorCorreo(archivo: string, destinatario: string) {
  return httpClient.post<{ ok: string }>(
    `/toma-muestras/solicitudes/${encodeURIComponent(archivo)}/enviar`,
    { destinatario },
  )
}

/** Un único Excel con todas las solicitudes (una fila por solicitud). */
export function urlExportarTodasLasSolicitudes() {
  return `${API_BASE_URL}/toma-muestras/solicitudes/exportar-todo`
}

// --- Configuración: campos generales -------------------------------------

export function listarCamposConfig() {
  return httpClient.get<CampoConfig[]>('/toma-muestras/config/campos')
}

export function guardarCamposConfig(campos: CampoConfig[]) {
  return httpClient.put<CampoConfig[]>('/toma-muestras/config/campos', campos)
}

// --- Configuración: tipos de aplicación -----------------------------------

export function listarTiposAplicacion() {
  return httpClient.get<OpcionConfig[]>('/toma-muestras/config/tipos-aplicacion')
}

export function crearTipoAplicacion(datos: OpcionInput) {
  return httpClient.post<OpcionConfig>('/toma-muestras/config/tipos-aplicacion', datos)
}

export function actualizarTipoAplicacion(id: number, datos: OpcionInput) {
  return httpClient.put<OpcionConfig>(`/toma-muestras/config/tipos-aplicacion/${id}`, datos)
}

export function eliminarTipoAplicacion(id: number) {
  return httpClient.delete<{ estado: string }>(`/toma-muestras/config/tipos-aplicacion/${id}`)
}

// --- Configuración: líneas de proceso --------------------------------------

export function listarLineasProceso() {
  return httpClient.get<OpcionConfig[]>('/toma-muestras/config/lineas-proceso')
}

export function crearLineaProceso(datos: OpcionInput) {
  return httpClient.post<OpcionConfig>('/toma-muestras/config/lineas-proceso', datos)
}

export function actualizarLineaProceso(id: number, datos: OpcionInput) {
  return httpClient.put<OpcionConfig>(`/toma-muestras/config/lineas-proceso/${id}`, datos)
}

export function eliminarLineaProceso(id: number) {
  return httpClient.delete<{ estado: string }>(`/toma-muestras/config/lineas-proceso/${id}`)
}

// --- Configuración: analitos por laboratorio -------------------------------

export function listarAnalitosConfig(laboratorio?: string, tipoAplicacion?: string) {
  const params = new URLSearchParams()
  if (laboratorio) params.set('laboratorio', laboratorio)
  if (tipoAplicacion) params.set('tipo_aplicacion', tipoAplicacion)
  const query = params.toString() ? `?${params.toString()}` : ''
  return httpClient.get<AnalitoConfig[]>(`/toma-muestras/config/analitos${query}`)
}

export function crearAnalitoConfig(datos: AnalitoInput) {
  return httpClient.post<AnalitoConfig>('/toma-muestras/config/analitos', datos)
}

export function actualizarAnalitoConfig(id: number, datos: AnalitoInput) {
  return httpClient.put<AnalitoConfig>(`/toma-muestras/config/analitos/${id}`, datos)
}

export function eliminarAnalitoConfig(id: number) {
  return httpClient.delete<{ estado: string }>(`/toma-muestras/config/analitos/${id}`)
}

// --- Configuración: campos por tipo de aplicación --------------------------

export function listarCamposTipoAplicacion(ambito?: string) {
  const query = ambito ? `?ambito=${encodeURIComponent(ambito)}` : ''
  return httpClient.get<CampoTipoAplicacionConfig[]>(`/toma-muestras/config/campos-tipo-aplicacion${query}`)
}

export function crearCampoTipoAplicacion(datos: CampoTipoAplicacionInput) {
  return httpClient.post<CampoTipoAplicacionConfig>('/toma-muestras/config/campos-tipo-aplicacion', datos)
}

export function actualizarCampoTipoAplicacion(id: number, datos: CampoTipoAplicacionInput) {
  return httpClient.put<CampoTipoAplicacionConfig>(`/toma-muestras/config/campos-tipo-aplicacion/${id}`, datos)
}

export function eliminarCampoTipoAplicacion(id: number) {
  return httpClient.delete<{ estado: string }>(`/toma-muestras/config/campos-tipo-aplicacion/${id}`)
}

// --- Configuración: laboratorios --------------------------------------------

export function listarLaboratoriosConfig() {
  return httpClient.get<LaboratorioConfig[]>('/toma-muestras/config/laboratorios')
}

export function crearLaboratorioConfig(datos: LaboratorioInput) {
  return httpClient.post<LaboratorioConfig>('/toma-muestras/config/laboratorios', datos)
}

export function actualizarLaboratorioConfig(id: number, datos: LaboratorioInput) {
  return httpClient.put<LaboratorioConfig>(`/toma-muestras/config/laboratorios/${id}`, datos)
}

export function eliminarLaboratorioConfig(id: number) {
  return httpClient.delete<{ estado: string }>(`/toma-muestras/config/laboratorios/${id}`)
}

// --- Configuración: categorías analíticas -----------------------------------

export function listarCategoriasAnaliticas(laboratorio?: string) {
  const query = laboratorio ? `?laboratorio=${encodeURIComponent(laboratorio)}` : ''
  return httpClient.get<CategoriaAnaliticaConfig[]>(`/toma-muestras/config/categorias-analiticas${query}`)
}

export function crearCategoriaAnalitica(datos: CategoriaAnaliticaInput) {
  return httpClient.post<CategoriaAnaliticaConfig>('/toma-muestras/config/categorias-analiticas', datos)
}

export function actualizarCategoriaAnalitica(id: number, datos: CategoriaAnaliticaInput) {
  return httpClient.put<CategoriaAnaliticaConfig>(`/toma-muestras/config/categorias-analiticas/${id}`, datos)
}

export function eliminarCategoriaAnalitica(id: number) {
  return httpClient.delete<{ estado: string }>(`/toma-muestras/config/categorias-analiticas/${id}`)
}

// --- Configuración: productos ------------------------------------------------

export function listarProductosConfig(laboratorio?: string, tipoAplicacion?: string) {
  const params = new URLSearchParams()
  if (laboratorio) params.set('laboratorio', laboratorio)
  if (tipoAplicacion) params.set('tipo_aplicacion', tipoAplicacion)
  const query = params.toString() ? `?${params.toString()}` : ''
  return httpClient.get<ProductoConfig[]>(`/toma-muestras/config/productos${query}`)
}

export function crearProductoConfig(datos: ProductoInput) {
  return httpClient.post<ProductoConfig>('/toma-muestras/config/productos', datos)
}

export function actualizarProductoConfig(id: number, datos: ProductoInput) {
  return httpClient.put<ProductoConfig>(`/toma-muestras/config/productos/${id}`, datos)
}

export function eliminarProductoConfig(id: number) {
  return httpClient.delete<{ estado: string }>(`/toma-muestras/config/productos/${id}`)
}
