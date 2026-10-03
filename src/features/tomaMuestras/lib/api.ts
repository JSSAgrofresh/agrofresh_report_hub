import { httpClient } from '@/services/http/client'
import { descargarArchivo, guardarBlob } from '@/services/http/descargar'
import type {
  AnalitoConfig,
  AnalitoInput,
  CampoConfig,
  ConfigEnvioAutomatico,
  CampoTipoAplicacionConfig,
  CampoTipoAplicacionInput,
  CategoriaAnaliticaConfig,
  CategoriaAnaliticaInput,
  LaboratorioConfig,
  LaboratorioInput,
  OpcionConfig,
  OpcionInput,
  ContactoResultado,
  ProductoConfig,
  ProductoInput,
  EstadoSolicitudesPrueba,
  InformeSolicitud,
  ReanalisisInput,
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

/** Actualiza una solicitud existente (mismo folio). Resetea `enviada` a
 * false para que el frontend pueda disparar el envío automático tras guardar. */
export function actualizarSolicitud(archivo: string, datos: SolicitudInput) {
  return httpClient.put<Solicitud>(`/toma-muestras/solicitudes/${encodeURIComponent(archivo)}`, datos)
}

export function eliminarSolicitud(archivo: string) {
  return httpClient.delete<{ estado: string }>(
    `/toma-muestras/solicitudes/${encodeURIComponent(archivo)}`,
  )
}

/** Si la cuenta puede crear solicitudes de prueba. */
export function estadoSolicitudesPrueba() {
  return httpClient.get<EstadoSolicitudesPrueba>('/toma-muestras/solicitudes-prueba/estado')
}

/** Crea una solicitud de prueba: folio de la serie OTP- de su laboratorio, marcada
 * `es_prueba`. No se envía sola. */
export function crearSolicitudPrueba(datos: SolicitudInput) {
  return httpClient.post<Solicitud>('/toma-muestras/solicitudes-prueba', datos)
}

export function listarSolicitudesElegiblesReanalisis() {
  return httpClient.get<Solicitud[]>('/toma-muestras/solicitudes-elegibles-reanalisis')
}

export function crearSolicitudReanalisis(archivo: string, datos: ReanalisisInput) {
  return httpClient.post<Solicitud>(
    `/toma-muestras/solicitudes/${encodeURIComponent(archivo)}/reanalisis`,
    datos,
  )
}

/** El Excel es el documento maestro guardado al crear la solicitud (o
 * generado al vuelo, con el mismo formato, para solicitudes legadas). */
export function descargarExcelSolicitud(archivo: string) {
  return descargarArchivo(
    `/toma-muestras/solicitudes/${encodeURIComponent(archivo)}/excel`,
    `${archivo}.xlsx`,
  )
}

export function descargarPdfSolicitud(archivo: string) {
  return descargarArchivo(
    `/toma-muestras/solicitudes/${encodeURIComponent(archivo)}/pdf`,
    `${archivo}.pdf`,
  )
}

/** {archivo: informe} de las solicitudes que ya tienen informe del laboratorio. */
export function listarInformesDeSolicitudes() {
  return httpClient.get<Record<string, InformeSolicitud>>('/toma-muestras/solicitudes-informes')
}

/** El PDF del informe del laboratorio, como blob para el visor. */
export function abrirPdfInformeSolicitud(archivo: string) {
  return httpClient.getArchivoConNombre(`/toma-muestras/solicitudes/${encodeURIComponent(archivo)}/informe/pdf`)
}

export function descargarPdfInformeSolicitud(archivo: string, nombre: string) {
  return descargarArchivo(`/toma-muestras/solicitudes/${encodeURIComponent(archivo)}/informe/pdf`, nombre)
}

/** El PDF como blob, para mostrarlo en pantalla sin guardarlo en disco. */
export function abrirPdfSolicitud(archivo: string) {
  return httpClient.getArchivoConNombre(`/toma-muestras/solicitudes/${encodeURIComponent(archivo)}/pdf`)
}

export function descargarJsonSolicitud(archivo: string) {
  return descargarArchivo(
    `/toma-muestras/solicitudes/${encodeURIComponent(archivo)}/json`,
    `${archivo}.json`,
  )
}

/** Nombres de las fotos de la muestra ya subidas para esta solicitud -no se
 * adjuntan al Excel, solo quedan en R2 junto a él-. */
export function listarFotosSolicitud(archivo: string) {
  return httpClient.get<string[]>(`/toma-muestras/solicitudes/${encodeURIComponent(archivo)}/fotos`)
}

/** Sube una foto tomada con la cámara. El backend rechaza pasar de 5. */
export function subirFotoSolicitud(archivo: string, foto: Blob, nombreArchivo: string) {
  const formData = new FormData()
  formData.append('foto', foto, nombreArchivo)
  return httpClient.upload<string[]>(
    `/toma-muestras/solicitudes/${encodeURIComponent(archivo)}/fotos`,
    formData,
  )
}

export function eliminarFotoSolicitud(archivo: string, nombreFoto: string) {
  return httpClient.delete<string[]>(
    `/toma-muestras/solicitudes/${encodeURIComponent(archivo)}/fotos/${encodeURIComponent(nombreFoto)}`,
  )
}

/** Blob de una foto ya subida, para mostrarla como miniatura. */
export async function obtenerFotoSolicitud(archivo: string, nombreFoto: string): Promise<Blob> {
  const { blob } = await httpClient.getArchivoConNombre(
    `/toma-muestras/solicitudes/${encodeURIComponent(archivo)}/fotos/${encodeURIComponent(nombreFoto)}`,
  )
  return blob
}

/** A quién iría la solicitud según los contactos del laboratorio. */
export function destinatariosDeSolicitud(archivo: string) {
  // `cc`/`bcc`: las copias configuradas en Contacto laboratorio (un backend
  // anterior no las manda).
  return httpClient.get<{ laboratorio: string; destinatarios: string[]; cc?: string[]; bcc?: string[] }>(
    `/toma-muestras/solicitudes/${encodeURIComponent(archivo)}/destinatarios`,
  )
}

/** Contactos configurados para recibir solicitudes de un laboratorio dado.
 * Para usar en el formulario antes de que exista el archivo de la solicitud. */
export function destinatariosParaLaboratorio(
  laboratorio: string,
  contexto: { sold_to?: string; ship_to?: string; especie?: string; tipo_aplicacion?: string } = {},
) {
  // El Tipo Aplicación decide la lista de distribución (Actimist tiene la suya).
  const params = new URLSearchParams({
    laboratorio,
    sold_to: contexto.sold_to ?? '',
    ship_to: contexto.ship_to ?? '',
    especie: contexto.especie ?? '',
    tipo_aplicacion: contexto.tipo_aplicacion ?? '',
  })
  return httpClient.get<{ destinatarios: string[]; cc?: string[]; bcc?: string[] }>(
    `/toma-muestras/config/destinatarios-solicitud?${params.toString()}`,
  )
}

/** Envía a los contactos configurados y suma invitados sólo para este envío. */
export function enviarSolicitudPorCorreo(
  archivo: string,
  destinatariosAdicionales: string[] = [],
  soloAEstos = false,
) {
  // `soloAEstos` (solo solicitudes de prueba): va únicamente a esas direcciones,
  // o a quien envía si no hay ninguna; sin lista real ni copias.
  return httpClient.post<{ ok: string }>(
    `/toma-muestras/solicitudes/${encodeURIComponent(archivo)}/enviar`,
    soloAEstos
      ? { destinatarios_adicionales: destinatariosAdicionales, solo_a_estos: true }
      : { destinatarios_adicionales: destinatariosAdicionales },
  )
}

/** Configuración de "Resultado a clientes" vigente para una combinación
 * (sold_to, ship_to, especie) — de solo lectura, Nueva solicitud la muestra. */
export function resultadosDeShipTo(
  laboratorio: string,
  shipTo: string,
  soldTo: string = '',
  especie: string = '',
  tipoAplicacion: string = '',
) {
  const qs = new URLSearchParams({ laboratorio, ship_to: shipTo, sold_to: soldTo, especie, tipo_aplicacion: tipoAplicacion })
  return httpClient.get<ContactoResultado[]>(`/toma-muestras/config/resultados-ship-to?${qs.toString()}`)
}

/** Excel horizontal con una fila por solicitud. Si se indican archivos,
 * exporta exactamente las filas visibles después de aplicar filtros. */
export function descargarTodasLasSolicitudes(archivos?: string[]) {
  const params = new URLSearchParams()
  archivos?.forEach((archivo) => params.append('archivo', archivo))
  const query = params.toString() ? `?${params.toString()}` : ''
  return descargarArchivo(
    `/toma-muestras/solicitudes/exportar-todo${query}`,
    'Solicitudes.xlsx',
  )
}

// --- Configuración: envío automático al guardar --------------------------

export function obtenerEnvioAutomatico() {
  return httpClient.get<ConfigEnvioAutomatico>('/toma-muestras/config/envio-automatico')
}

/** Sin `tipo` cambia la regla general; con `tipo`, la de ese tipo de aplicación
 * (`heredar` la quita y vuelve a regir la general). */
export function actualizarEnvioAutomatico(
  activo: boolean,
  password: string,
  opciones: { tipo?: string; heredar?: boolean } = {},
) {
  return httpClient.put<ConfigEnvioAutomatico>('/toma-muestras/config/envio-automatico', {
    activo,
    password,
    ...opciones,
  })
}

/** Los PDF de varias solicitudes en un solo .zip. */
export async function descargarPdfsZip(archivos: string[]) {
  const { blob, nombre } = await httpClient.postArchivoConNombre('/toma-muestras/solicitudes/pdf-zip', {
    archivos,
  })
  guardarBlob(blob, nombre ?? 'Solicitudes_PDF.zip')
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
  return httpClient.get<CampoTipoAplicacionConfig[]>(
    `/toma-muestras/config/campos-tipo-aplicacion${query}`,
  )
}

export function crearCampoTipoAplicacion(datos: CampoTipoAplicacionInput) {
  return httpClient.post<CampoTipoAplicacionConfig>(
    '/toma-muestras/config/campos-tipo-aplicacion',
    datos,
  )
}

export function actualizarCampoTipoAplicacion(id: number, datos: CampoTipoAplicacionInput) {
  return httpClient.put<CampoTipoAplicacionConfig>(
    `/toma-muestras/config/campos-tipo-aplicacion/${id}`,
    datos,
  )
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
  return httpClient.get<CategoriaAnaliticaConfig[]>(
    `/toma-muestras/config/categorias-analiticas${query}`,
  )
}

export function crearCategoriaAnalitica(datos: CategoriaAnaliticaInput) {
  return httpClient.post<CategoriaAnaliticaConfig>(
    '/toma-muestras/config/categorias-analiticas',
    datos,
  )
}

export function actualizarCategoriaAnalitica(id: number, datos: CategoriaAnaliticaInput) {
  return httpClient.put<CategoriaAnaliticaConfig>(
    `/toma-muestras/config/categorias-analiticas/${id}`,
    datos,
  )
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
