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

export function esComercial(usuario: Pick<Usuario, 'tipoAcceso'>): boolean {
  return usuario.tipoAcceso === 'comercial'
}

/** Gerencia y comercial miran pero no modifican nada. */
export function esSoloLectura(usuario: Usuario): boolean {
  return esGerencia(usuario) || esComercial(usuario)
}

/** Lo único que se le puede dar a un comercial: lo que la API acota a sus plantas. Espejo de `MODULOS_COMERCIAL`. */
export const MODULOS_COMERCIAL = ['reports', 'storage', 'auditoria_interna', 'toma_muestras'] as const

/** Marca (viaja en `modulos`, sin migración) que el administrador general le da a ALGUNOS comerciales: ven las plantas
 * de TODOS los clientes en vez de una lista. Espejo de `auth.MODULO_TODAS_LAS_PLANTAS`. Solo vale en un comercial. */
export const MODULO_TODAS_LAS_PLANTAS = 'todas_las_plantas'

export function veTodasLasPlantas(usuario: Pick<Usuario, 'tipoAcceso' | 'modulos'>): boolean {
  return usuario.tipoAcceso === 'comercial' && (usuario.modulos ?? []).includes(MODULO_TODAS_LAS_PLANTAS)
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
 * todos menos el Panel de control interno para gerencia, solo los de su área para admin
 * de área, ninguno para cliente. Panel de control interno solo la ve el admin general
 * y quien él designe (cuentas con el módulo asignado). */
export function modulosPermitidos(usuario: Usuario): ModuloInfo[] {
  if (esAdminGeneral(usuario)) return MODULOS
  // Gerencia: sin lista guardada (cuentas antiguas) ve todo menos Auditoría; con lista, solo lo que se le marcó.
  if (esGerencia(usuario)) {
    // Panel de control interno solo si se le marcó a propósito; la lista antigua (sin guardar) no la incluye.
    return MODULOS.filter((m) =>
      usuario.modulos == null ? m.id !== MODULO_AUDITORIA_INTERNA : usuario.modulos.includes(m.id),
    )
  }
  const idsPermitidos = usuario.modulos ?? modulosPredeterminados(usuario)
  // Un comercial solo tiene Report y/o Storage, aunque la lista guardada trajera más.
  if (esComercial(usuario)) return MODULOS.filter((m) => idsPermitidos.includes(m.id) && (MODULOS_COMERCIAL as readonly string[]).includes(m.id))
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

/** Permiso aparte (no es una puerta): modificar los criterios de las verificaciones diarias. Viaja en `modulos`
 * y no recorta las secciones. Espejo de `puede_editar_criterios` en `app/lab_secciones.py`. */
export const LAB_CRITERIOS = 'lab_criterios'

export const esSeccionLab = (id: string): boolean => id === LAB_CRITERIOS || LAB_SECCIONES.some((s) => s.id === id)

export function puedeEditarCriteriosLab(usuario: Pick<Usuario, 'tipoAcceso' | 'modulos'>): boolean {
  return usuario.tipoAcceso === 'admin_general' || (usuario.modulos ?? []).includes(LAB_CRITERIOS)
}

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
  // «Postventa» de un cliente son sus informes Accu-Tab en el panel; el Report de Post Venta es interno.
  if ((usuario.tipoAcceso === 'cliente' || usuario.tipoAcceso === 'comercial') && reporte === 'postventa') return false
  if (esAdminGeneral(usuario) || (esGerencia(usuario) && usuario.reportes == null)) return true
  return (usuario.reportes ?? reportesPredeterminados(usuario)).includes(reporte)
}

/** Acceso a la categoría "Toma de muestras": el admin general, gerencia
 * (siempre ven todo) y el rol dedicado `muestreador`. */
export function puedeVerTomaMuestras(usuario: Usuario): boolean {
  if (esAdminGeneral(usuario) || (esGerencia(usuario) && usuario.modulos == null)) return true
  return (usuario.modulos ?? modulosPredeterminados(usuario)).includes(MODULO_TOMA_MUESTRAS)
}

/** «Mini funciones» que el administrador general reparte a cuentas concretas (Usuarios → permisos). Sin
 * migración: viajan en `modulos`. Espejo de `app/permisos_funciones.py` (mismos casos en `permisos.test.ts` y
 * `tests/test_permisos_funciones.py`). El administrador general las tiene todas; gerencia y clientes ninguna. */
export type FuncionId =
  | 'lab_criterios'
  | 'verif_firmar'
  | 'toma_reanalisis'
  | 'toma_editar'
  | 'toma_muestra_interna'
  | 'vista_cliente'

export function tieneFuncion(usuario: Pick<Usuario, 'tipoAcceso' | 'modulos'>, funcion: FuncionId): boolean {
  if (usuario.tipoAcceso === 'admin_general') return true
  if (usuario.tipoAcceso === 'cliente' || usuario.tipoAcceso === 'comercial') return false
  // Gerencia no lleva funciones de escritura, pero SÍ «Vista de cliente» (solo mirar): se le marca a propósito.
  if (usuario.tipoAcceso === 'gerencia' && funcion !== 'vista_cliente') return false
  return (usuario.modulos ?? []).includes(funcion)
}

/** Ver el portal tal como lo ve un cliente (Análisis e Informes de Laboratorio), para auditar: el administrador
 * general y quien tenga la función `vista_cliente`. Con su propia cuenta ve los datos de todos los clientes. */
export function puedeVerVistaCliente(usuario: Pick<Usuario, 'tipoAcceso' | 'modulos'>): boolean {
  return tieneFuncion(usuario, 'vista_cliente')
}

/** Firmar la revisión de un día de verificaciones: admin general, admin de Cromatografía o quien tenga la función. */
export function puedeFirmarVerificaciones(usuario: Pick<Usuario, 'tipoAcceso' | 'area' | 'modulos'>): boolean {
  return (
    usuario.tipoAcceso === 'admin_general' ||
    (usuario.tipoAcceso === 'admin_area' && usuario.area === 'cromatografia') ||
    tieneFuncion(usuario, 'verif_firmar')
  )
}

/** Crear reanálisis: el admin general y quien tenga la función `toma_reanalisis`, que el administrador general
 * asigna cuenta por cuenta. Ningún tipo de cuenta la trae por sí solo. */
export function puedeCrearReanalisis(usuario: Pick<Usuario, 'tipoAcceso' | 'modulos'>): boolean {
  return tieneFuncion(usuario, 'toma_reanalisis')
}

/** Editar solicitudes ya guardadas: el admin general y quien tenga la función `toma_editar`. Aun así solo vale para los
 * tipos de aplicación que NO se envían solos (el servidor lo exige igual; ver `puedeEditarSolicitud`). */
export function puedeEditarSolicitudes(usuario: Pick<Usuario, 'tipoAcceso' | 'modulos'>): boolean {
  return tieneFuncion(usuario, 'toma_editar')
}

/** Crear muestras internas (pulpa propia de AgroFresh, Ship To MUESTRA INTERNA): el admin general y quien tenga la función
 * `toma_muestra_interna`, que se asigna cuenta por cuenta (hoy, Paz). */
export function puedeCrearMuestraInterna(usuario: Pick<Usuario, 'tipoAcceso' | 'modulos'>): boolean {
  return tieneFuncion(usuario, 'toma_muestra_interna')
}

/** Qué ve una cuenta de cliente. Un cliente no pertenece a un área: el administrador le asigna qué ve. Las cuentas
 * antiguas (sin lista) conservan lo que daba su área: Cromatografía = Report, Post Venta = informes Accu-Tab. */
export interface VistaCliente {
  /** Report de laboratorio (módulo `reports`). */
  report: boolean
  /** Informes Accu-Tab en su panel (`reportes` con `postventa`). */
  accutab: boolean
  /** Sus informes en Storage (módulo `storage`). */
  storage: boolean
}

export function vistaDeCliente(usuario: Pick<Usuario, 'area' | 'modulos' | 'reportes'>): VistaCliente {
  return {
    report: usuario.modulos ? usuario.modulos.includes('reports') : usuario.area !== 'postventa',
    accutab: usuario.reportes ? usuario.reportes.includes('postventa') : usuario.area === 'postventa',
    storage: (usuario.modulos ?? []).includes('storage'),
  }
}

export function etiquetaAcceso(usuario: Usuario): string {
  if (usuario.tipoAcceso === 'admin_general') return 'Admin general'
  if (usuario.tipoAcceso === 'gerencia') return 'Gerencia'
  if (usuario.tipoAcceso === 'comercial') return 'Comercial'
  if (usuario.tipoAcceso === 'admin_area' && usuario.area)
    return `Admin · ${AREAS[usuario.area].nombre}`
  if (usuario.tipoAcceso === 'cliente') {
    const v = vistaDeCliente(usuario)
    const ve = [v.report && 'Report', v.storage && 'Storage', v.accutab && 'Accu-Tab'].filter(Boolean)
    return ve.length > 0 ? `Cliente · ${ve.join(' + ')}` : 'Cliente'
  }
  if (usuario.tipoAcceso === 'analista' && usuario.area)
    return `Analista · ${AREAS[usuario.area].nombre}`
  if (usuario.tipoAcceso === 'muestreador') return 'Muestreador'
  return usuario.tipoAcceso
}
