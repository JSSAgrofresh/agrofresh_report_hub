import { httpClient } from '@/services/http/client'
import type { ArchivoStorage } from './tipos'

export function listarArchivos() {
  return httpClient.get<ArchivoStorage[]>('/storage/archivos')
}

export function subirArchivos(archivos: File[]) {
  const formData = new FormData()
  archivos.forEach((a) => formData.append('archivos', a))
  return httpClient.upload<ArchivoStorage[]>('/storage/subir', formData)
}

export function eliminarArchivo(nombre: string) {
  return httpClient.delete<{ estado: string }>(`/storage/archivos/${encodeURIComponent(nombre)}`)
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

export function urlDescarga(nombre: string) {
  return `${API_BASE_URL}/storage/archivos/${encodeURIComponent(nombre)}/descargar`
}
