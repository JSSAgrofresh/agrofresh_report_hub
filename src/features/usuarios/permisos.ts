import { MODULOS } from '@/constants/modules'
import type { ModuloInfo } from '@/constants/modules'
import { AREAS } from '@/constants/areas'
import type { AreaId } from '@/constants/areas'
import type { Usuario } from './types'

export function esAdminGeneral(usuario: Usuario): boolean {
  return usuario.tipoAcceso === 'admin_general'
}

export function puedeAdministrarUsuarios(usuario: Usuario): boolean {
  return esAdminGeneral(usuario)
}

/** Módulos que el usuario puede ver en "Funciones": todos para admin general,
 * solo los de su área para admin de área, ninguno para cliente. */
export function modulosPermitidos(usuario: Usuario): ModuloInfo[] {
  if (esAdminGeneral(usuario)) return MODULOS
  if (usuario.tipoAcceso === 'admin_area' && usuario.area) {
    const idsPermitidos = AREAS[usuario.area].modulos
    return MODULOS.filter((m) => idsPermitidos.includes(m.id))
  }
  return []
}

export function puedeVerModulo(usuario: Usuario, moduloId: string): boolean {
  return modulosPermitidos(usuario).some((m) => m.id === moduloId)
}

/** Los reportes que viven dentro del módulo Report. */
export type ReporteId = 'laboratorio' | 'postventa' | 'emitir'

/** Cada reporte pertenece a un área. Entrar a Report no alcanza: un admin de
 * Post Venta ve el histórico de Trace, pero NO los datos de laboratorio de
 * Cromatografía, que son de otra área -y al revés-. */
const AREA_DE_REPORTE: Record<ReporteId, AreaId> = {
  laboratorio: 'cromatografia',
  emitir: 'cromatografia',
  postventa: 'postventa',
}

export function puedeVerReporte(usuario: Usuario, reporte: ReporteId): boolean {
  if (!puedeVerModulo(usuario, 'reports')) return false
  if (esAdminGeneral(usuario)) return true
  return usuario.area === AREA_DE_REPORTE[reporte]
}

/** Acceso a la categoría "Toma de muestras": el admin general (siempre ve
 * todo) y el rol dedicado `muestreador`. */
export function puedeVerTomaMuestras(usuario: Usuario): boolean {
  return esAdminGeneral(usuario) || usuario.tipoAcceso === 'muestreador'
}

export function etiquetaAcceso(usuario: Usuario): string {
  if (usuario.tipoAcceso === 'admin_general') return 'Admin general'
  if (usuario.tipoAcceso === 'admin_area' && usuario.area) return `Admin · ${AREAS[usuario.area].nombre}`
  if (usuario.tipoAcceso === 'cliente' && usuario.area) return `Cliente · ${AREAS[usuario.area].nombre}`
  if (usuario.tipoAcceso === 'muestreador') return 'Muestreador'
  return usuario.tipoAcceso
}
