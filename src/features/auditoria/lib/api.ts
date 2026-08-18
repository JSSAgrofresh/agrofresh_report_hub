import { httpClient } from '@/services/http/client'
import type {
  CorregirGrupoInput,
  EstadoStaging,
  InfoTabla,
  PaginaTabla,
  ResultadoAuditoria,
  ResultadoCorreccion,
} from './tipos'

export function listarTablas() {
  return httpClient.get<InfoTabla[]>('/auditoria/tablas')
}

export function verTabla(nombre: string, pagina: number, tamano: number) {
  return httpClient.get<PaginaTabla>(`/auditoria/tabla/${nombre}?pagina=${pagina}&tamano=${tamano}`)
}

export function auditar() {
  return httpClient.get<ResultadoAuditoria>('/auditoria/inconsistencias')
}

export function estadoStaging() {
  return httpClient.get<EstadoStaging>('/auditoria/staging/estado')
}

export function crearStaging() {
  return httpClient.post<EstadoStaging>('/auditoria/staging/crear', {})
}

export function descartarStaging() {
  return httpClient.post<EstadoStaging>('/auditoria/staging/descartar', {})
}

export function corregirGrupo(datos: CorregirGrupoInput) {
  return httpClient.post<ResultadoCorreccion>('/auditoria/corregir', datos)
}

export function promover() {
  return httpClient.post<{ ok: boolean; respaldo: string }>('/auditoria/promover', {})
}
