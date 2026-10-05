import { httpClient } from '@/services/http/client'
import type {
  ActividadLab,
  DetalleGC,
  FilaCruce,
  FilaSubida,
  Fortificado,
  InformeConfig,
  Solicitud,
} from './tipos'

/** El archivo del GC entero: muestras de cliente, curvas, blancos y controles,
 * cada vial marcado con `es_muestra`.
 *
 * Es la única lectura del archivo. Antes había otra que devolvía solo los
 * viales cruzables y fallaba cuando no había ninguno: una corrida sin muestras
 * de cliente —una curva de calibración— no se podía ni abrir ni pasar a
 * planilla. Quien cruza filtra por `es_muestra`; la planilla los muestra
 * todos. */
export function parsearGCCompleto(archivo: File) {
  const formData = new FormData()
  formData.append('archivo', archivo)
  return httpClient.upload<DetalleGC>('/emitir/cromatografia/parsear-gc/completo', formData)
}

/** El Excel se arma con los datos ya leídos, no con el .txt de vuelta: el
 * texto del archivo pesa cerca de un megabyte y el backend no lo necesita
 * -solo lo dibuja el visor-. */
export function descargarDetalleGCExcel(detalle: DetalleGC) {
  const { texto: _texto, regiones: _regiones, categorias: _categorias, ...datos } = detalle
  return httpClient.postArchivoConNombre('/emitir/cromatografia/detalle-gc/excel', datos)
}

export function listarSolicitudes() {
  return httpClient.get<Solicitud[]>('/emitir/cromatografia/solicitudes')
}

/** Deja anotado con qué muestra física llegó una solicitud. Se hace al
 * recibirla, no al procesar los resultados: entre una cosa y otra corre el GC
 * y pasa la noche, así que el cruce se guarda en la base. */
export function cruzarConMuestra(archivo: string, codigoMuestra: string | null) {
  return httpClient.put<Solicitud>(
    `/toma-muestras/solicitudes/${encodeURIComponent(archivo)}/muestra`,
    { codigo_muestra: codigoMuestra },
  )
}

/** Anota (o corrige) el segundo peso: el de la muestra extraída, en gramos. */
export function guardarPesoExtraido(archivo: string, peso: number) {
  return httpClient.put<Solicitud>(
    `/toma-muestras/solicitudes/${encodeURIComponent(archivo)}/peso-extraido`,
    { peso },
  )
}

export function descargarExcelCruce(filas: FilaCruce[]) {
  return httpClient.postArchivo('/emitir/cromatografia/excel', filas)
}

export function descargarExcelConMuestra(solicitudes: Solicitud[]) {
  const filas = solicitudes.map((s) => ({
    campos: s.campos,
    analitos_solicitados: s.analitos_solicitados,
    codigo_muestra: s.codigo_muestra ?? null,
    fecha_recepcion: s.fecha_recepcion ?? null,
    hora_recepcion: s.hora_recepcion ?? null,
    peso_muestra_extraido: s.peso_muestra_extraido ?? null,
  }))
  return httpClient.postArchivo('/emitir/cromatografia/excel-con-muestra', filas)
}

export function descargarInformesPDF(filas: FilaCruce[]) {
  return httpClient.postArchivoConNombre('/emitir/cromatografia/informes-pdf', filas)
}

export function obtenerConfiguracionInforme() {
  return httpClient.get<InformeConfig>('/emitir/cromatografia/config-informe')
}

export function guardarConfiguracionInforme(config: InformeConfig) {
  return httpClient.put<InformeConfig>('/emitir/cromatografia/config-informe', config)
}

export function subirCruceABaseDeDatos(filas: FilaCruce[]) {
  return httpClient.post<FilaSubida[]>('/emitir/cromatografia/subir-bd', filas)
}

/** Cruce completo con foto y peso obligatorios.
 * Usa multipart/form-data para enviar la foto junto con los demás campos. */
export async function cruzarCompleto(
  archivo: string,
  codigoMuestra: string,
  pesoMuestra: number,
  unidadPeso: string,
  foto: File,
): Promise<Solicitud> {
  const fd = new FormData()
  fd.append('codigo_muestra', codigoMuestra)
  fd.append('peso_muestra', String(pesoMuestra))
  fd.append('unidad_peso', unidadPeso)
  fd.append('foto', foto)
  return httpClient.upload<Solicitud>(
    `/toma-muestras/solicitudes/${encodeURIComponent(archivo)}/cruzar-completo`,
    fd,
  )
}

/** Corrige un cruce ya hecho (N° de muestra y peso; la foto solo si se manda una nueva). */
export function editarCruce(
  archivo: string,
  datos: { codigoMuestra: string; peso: number; unidad: string; foto?: File | null },
): Promise<Solicitud> {
  const fd = new FormData()
  fd.append('codigo_muestra', datos.codigoMuestra)
  fd.append('peso_muestra', String(datos.peso))
  fd.append('unidad_peso', datos.unidad)
  if (datos.foto) fd.append('foto', datos.foto)
  return httpClient.patchUpload<Solicitud>(`/toma-muestras/solicitudes/${encodeURIComponent(archivo)}/cruce`, fd)
}

/** La foto del cruce como archivo local: un <img src> directo no lleva el token (daría 401). */
export async function obtenerFotoCruce(archivo: string): Promise<Blob> {
  const { blob } = await httpClient.getArchivoConNombre(
    `/toma-muestras/solicitudes/${encodeURIComponent(archivo)}/cruce-foto`,
  )
  return blob
}

/** Historial de actividad del módulo de ingreso al laboratorio. */
export function listarActividadLab(params?: {
  limite?: number
  offset?: number
  archivo?: string
}) {
  const qs = new URLSearchParams()
  if (params?.limite) qs.set('limite', String(params.limite))
  if (params?.offset) qs.set('offset', String(params.offset))
  if (params?.archivo) qs.set('archivo', params.archivo)
  const q = qs.toString()
  return httpClient.get<ActividadLab[]>(`/toma-muestras/actividad${q ? `?${q}` : ''}`)
}


/** Fortificados: no tienen solicitud, solo N°, peso extraído (g) y cuándo ingresaron. */
export function listarFortificados() {
  return httpClient.get<Fortificado[]>('/fortificados')
}

export function crearFortificado(numero: string, peso: number) {
  return httpClient.post<Fortificado>('/fortificados', { numero, peso })
}

export function corregirFortificado(id: number, numero: string, peso: number) {
  return httpClient.put<Fortificado>(`/fortificados/${id}`, { numero, peso })
}

export function borrarFortificado(id: number) {
  return httpClient.delete<void>(`/fortificados/${id}`)
}
