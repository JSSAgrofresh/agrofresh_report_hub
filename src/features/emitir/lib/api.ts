import { httpClient } from '@/services/http/client'
import type {
  FilaCruce,
  FilaSubida,
  InformeConfig,
  MuestraGC,
  MuestraGCDetalle,
  Solicitud,
} from './tipos'

export function parsearGC(archivo: File) {
  const formData = new FormData()
  formData.append('archivo', archivo)
  return httpClient.upload<MuestraGC[]>('/emitir/cromatografia/parsear-gc', formData)
}

/** El archivo del GC entero —muestras, curvas, blancos y controles— para la
 * vista de detalle. Va aparte de `parsearGC` a propósito: ese devuelve solo lo
 * cruzable, y mezclarlos haría que el escáner de viales pudiera encontrar un
 * blanco. */
export function parsearGCCompleto(archivo: File) {
  const formData = new FormData()
  formData.append('archivo', archivo)
  return httpClient.upload<MuestraGCDetalle[]>('/emitir/cromatografia/parsear-gc/completo', formData)
}

export function descargarDetalleGCExcel(muestras: MuestraGCDetalle[]) {
  return httpClient.postArchivoConNombre('/emitir/cromatografia/detalle-gc/excel', { muestras })
}

export function listarSolicitudes() {
  return httpClient.get<Solicitud[]>('/emitir/cromatografia/solicitudes')
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
