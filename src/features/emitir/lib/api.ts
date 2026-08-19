import { httpClient } from '@/services/http/client'
import type { FilaCruce, MuestraGC } from './tipos'

export function parsearGC(archivo: File) {
  const formData = new FormData()
  formData.append('archivo', archivo)
  return httpClient.upload<MuestraGC[]>('/emitir/cromatografia/parsear-gc', formData)
}

export function descargarExcelCruce(filas: FilaCruce[]) {
  return httpClient.postArchivo('/emitir/cromatografia/excel', filas)
}
