import { httpClient } from '@/services/http/client'
import type {
  DetalleGC,
  FilaCruce,
  FilaSubida,
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

export function descargarExcelCruce(filas: FilaCruce[]) {
  return httpClient.postArchivo('/emitir/cromatografia/excel', filas)
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
