import { httpClient } from '@/services/http/client'
import { descargarArchivo } from '@/services/http/descargar'
import type {
  CorregirGrupoInput,
  CorregirValoresInput,
  EntradaHistorial,
  EstadoStaging,
  InfoTabla,
  PaginaTabla,
  ResultadoAuditoria,
  ResultadoCorreccion,
  ResultadoDeshacer,
  ValoresColumna,
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

export function corregirValores(datos: CorregirValoresInput) {
  return httpClient.post<ResultadoCorreccion>('/auditoria/corregir-valores', datos)
}

export function historialStaging() {
  return httpClient.get<EntradaHistorial[]>('/auditoria/staging/historial')
}

export function deshacer(historialId: number) {
  return httpClient.post<ResultadoDeshacer>('/auditoria/deshacer', { historial_id: historialId })
}

export function valoresColumna(tabla: string, campo: string) {
  return httpClient.get<ValoresColumna>(`/auditoria/columna/${tabla}/${campo}`)
}

export function promover() {
  return httpClient.post<{ ok: boolean; respaldo: string }>('/auditoria/promover', {})
}

/** Descarga la base completa en Excel. Va por `descargarArchivo` y no por un
 * enlace directo porque la API exige sesión, y un `<a href>` no puede llevar
 * el token. */
export function descargarExportacion() {
  return descargarArchivo('/auditoria/exportar', 'Base_de_datos.xlsx')
}
