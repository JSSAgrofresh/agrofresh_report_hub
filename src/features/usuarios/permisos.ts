import { MODULOS } from '@/constants/modules'
import type { ModuloInfo } from '@/constants/modules'
import { AREAS } from '@/constants/areas'
import type { Usuario } from './types'

export function esAdminGeneral(usuario: Usuario): boolean {
  return usuario.tipoAcceso === 'admin_general'
}

export function esGerencia(usuario: Usuario): boolean {
  return usuario.tipoAcceso === 'gerencia'
}

/** Gerencia y admin general tienen acceso visual a todo, pero gerencia es solo lectura. */
export function tieneAccesoTotal(usuario: Usuario): boolean {
  return esAdminGeneral(usuario) || esGerencia(usuario)
}

export function esSoloLectura(usuario: Usuario): boolean {
  return esGerencia(usuario)
}

export function puedeAdministrarUsuarios(usuario: Usuario): boolean {
  return esAdminGeneral(usuario)
}

export const MODULO_TOMA_MUESTRAS = 'toma_muestras'

export type ReporteId = 'laboratorio' | 'postventa'

export function modulosPredeterminados(usuario: Pick<Usuario, 'tipoAcceso' | 'area'>): string[] {
  if (usuario.tipoAcceso === 'admin_general' || usuario.tipoAcceso === 'gerencia') {
    return [...MODULOS.map((m) => m.id), MODULO_TOMA_MUESTRAS]
  }
  if (usuario.tipoAcceso === 'admin_area' && usuario.area === 'cromatografia') {
    return ['converter', 'reports', 'storage', 'agrofresh_lab', MODULO_TOMA_MUESTRAS]
  }
  if (usuario.tipoAcceso === 'admin_area' && usuario.area === 'postventa') {
    return ['trace', 'reports']
  }
  if (usuario.tipoAcceso === 'admin_area' && usuario.area === 'ryd') {
    return ['reports', 'agrofresh_lab']
  }
  if (usuario.tipoAcceso === 'admin_area' && usuario.area === 'toma_muestras') {
    return [MODULO_TOMA_MUESTRAS]
  }
  if (usuario.tipoAcceso === 'analista') return ['agrofresh_lab']
  if (usuario.tipoAcceso === 'muestreador') return [MODULO_TOMA_MUESTRAS]
  return []
}

export function reportesPredeterminados(
  usuario: Pick<Usuario, 'tipoAcceso' | 'area'>,
): ReporteId[] {
  if (usuario.tipoAcceso === 'admin_general' || usuario.tipoAcceso === 'gerencia')
    return ['laboratorio', 'postventa']
  if (usuario.tipoAcceso === 'admin_area' && usuario.area === 'cromatografia')
    return ['laboratorio']
  if (usuario.tipoAcceso === 'admin_area' && usuario.area === 'postventa') return ['postventa']
  if (usuario.tipoAcceso === 'admin_area' && usuario.area === 'ryd') return ['laboratorio']
  return []
}

/** Módulos que el usuario puede ver en "Funciones": todos para admin general
 * y gerencia, solo los de su área para admin de área, ninguno para cliente. */
export function modulosPermitidos(usuario: Usuario): ModuloInfo[] {
  if (esAdminGeneral(usuario) || esGerencia(usuario)) return MODULOS
  const idsPermitidos = usuario.modulos ?? modulosPredeterminados(usuario)
  return MODULOS.filter((m) => idsPermitidos.includes(m.id))
}

export function puedeVerModulo(usuario: Usuario, moduloId: string): boolean {
  return modulosPermitidos(usuario).some((m) => m.id === moduloId)
}

export function puedeVerReporte(usuario: Usuario, reporte: ReporteId): boolean {
  if (!puedeVerModulo(usuario, 'reports')) return false
  if (tieneAccesoTotal(usuario)) return true
  return (usuario.reportes ?? reportesPredeterminados(usuario)).includes(reporte)
}

/** Acceso a la categoría "Toma de muestras": el admin general, gerencia
 * (siempre ven todo) y el rol dedicado `muestreador`. */
export function puedeVerTomaMuestras(usuario: Usuario): boolean {
  if (tieneAccesoTotal(usuario)) return true
  return (usuario.modulos ?? modulosPredeterminados(usuario)).includes(MODULO_TOMA_MUESTRAS)
}

export function etiquetaAcceso(usuario: Usuario): string {
  if (usuario.tipoAcceso === 'admin_general') return 'Admin general'
  if (usuario.tipoAcceso === 'gerencia') return 'Gerencia'
  if (usuario.tipoAcceso === 'admin_area' && usuario.area)
    return `Admin · ${AREAS[usuario.area].nombre}`
  if (usuario.tipoAcceso === 'cliente' && usuario.area)
    return `Cliente · ${AREAS[usuario.area].nombre}`
  if (usuario.tipoAcceso === 'analista' && usuario.area)
    return `Analista · ${AREAS[usuario.area].nombre}`
  if (usuario.tipoAcceso === 'muestreador') return 'Muestreador'
  return usuario.tipoAcceso
}
