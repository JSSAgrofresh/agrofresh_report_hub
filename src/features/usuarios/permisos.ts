import { MODULOS, MODULO_AUDITORIA_INTERNA } from '@/constants/modules'
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
  if (usuario.tipoAcceso === 'admin_general') {
    return [...MODULOS.map((m) => m.id), MODULO_TOMA_MUESTRAS]
  }
  if (usuario.tipoAcceso === 'gerencia') {
    return [...MODULOS.filter((m) => m.id !== MODULO_AUDITORIA_INTERNA).map((m) => m.id), MODULO_TOMA_MUESTRAS]
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

/** Módulos que el usuario puede ver en "Funciones": todos para admin general,
 * todos menos Auditoría interna para gerencia, solo los de su área para admin
 * de área, ninguno para cliente. Auditoría interna solo la ve el admin general
 * y quien él designe (cuentas con el módulo asignado). */
export function modulosPermitidos(usuario: Usuario): ModuloInfo[] {
  if (esAdminGeneral(usuario)) return MODULOS
  if (esGerencia(usuario)) return MODULOS.filter((m) => m.id !== MODULO_AUDITORIA_INTERNA)
  const idsPermitidos = usuario.modulos ?? modulosPredeterminados(usuario)
  return MODULOS.filter((m) => idsPermitidos.includes(m.id))
}

/** Las tres puertas de AgroFresh Lab. El administrador general puede dejar a una cuenta con solo algunas
 * (Usuarios → «Secciones de AgroFresh Lab»). **Sin migración**: las elegidas viajan en la misma lista
 * `modulos` con estos ids; si no hay ninguno en la lista, la cuenta ve las tres, como siempre.
 * Espejo de `app/lab_secciones.py` (mismos casos en `permisos.test.ts` y `tests/test_lab_secciones.py`). */
export const LAB_SECCIONES = [
  { id: 'lab_ingreso', nombre: 'Ingreso al laboratorio', descripcion: 'Recibir la muestra, cruzarla con su solicitud y subir el resultado del GC.' },
  { id: 'lab_verificaciones', nombre: 'Verificaciones diarias', descripcion: 'Control diario de equipos (REG-03) y su histórico.' },
  { id: 'lab_envio', nombre: 'Envío de informes', descripcion: 'Enviar los PDF del laboratorio a la lista de distribución del cliente.' },
] as const

export type LabSeccionId = (typeof LAB_SECCIONES)[number]['id']

export const esSeccionLab = (id: string): boolean => LAB_SECCIONES.some((s) => s.id === id)

export function seccionesLabPermitidas(usuario: Pick<Usuario, 'tipoAcceso' | 'modulos'>): LabSeccionId[] {
  const todas = LAB_SECCIONES.map((s) => s.id)
  if (usuario.tipoAcceso === 'admin_general' || usuario.tipoAcceso === 'gerencia') return todas
  const elegidas = todas.filter((id) => (usuario.modulos ?? []).includes(id))
  return elegidas.length > 0 ? elegidas : todas
}

export function puedeVerSeccionLab(usuario: Pick<Usuario, 'tipoAcceso' | 'modulos'>, seccion: LabSeccionId): boolean {
  return seccionesLabPermitidas(usuario).includes(seccion)
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

/** Solo admin_general y admin_area pueden crear reanálisis. */
export function puedeCrearReanalisis(usuario: Usuario): boolean {
  return usuario.tipoAcceso === 'admin_general' || usuario.tipoAcceso === 'admin_area'
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
