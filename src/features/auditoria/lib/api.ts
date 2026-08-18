import { httpClient } from '@/services/http/client'
import type { InfoTabla, PaginaTabla, ResultadoAuditoria } from './tipos'

export function listarTablas() {
  return httpClient.get<InfoTabla[]>('/auditoria/tablas')
}

export function verTabla(nombre: string, pagina: number, tamano: number) {
  return httpClient.get<PaginaTabla>(`/auditoria/tabla/${nombre}?pagina=${pagina}&tamano=${tamano}`)
}

export function auditar() {
  return httpClient.get<ResultadoAuditoria>('/auditoria/inconsistencias')
}
