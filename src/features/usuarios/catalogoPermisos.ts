import type { AreaId } from '@/constants/areas'
import type { TipoAcceso, Usuario } from './types'

/**
 * Todo lo que el administrador general puede darle a una cuenta, ordenado por categoría.
 * **Sin migración**: lo elegido viaja en las listas que la cuenta ya tenía —`modulos` (módulos, puertas de
 * AgroFresh Lab y «mini funciones») y `reportes` (secciones de Report)—. Espejo de `app/permisos_funciones.py`.
 *
 * Un permiso puede colgar de otro (`padre`): el hijo solo tiene sentido con el padre. Los hijos marcados
 * `extra` son funciones sueltas que NO se dan solas al marcar al padre (hay que asignarlas a propósito).
 */
export interface Permiso {
  id: string
  nombre: string
  descripcion: string
  padre?: string
  extra?: boolean
  /** Cuentas que ya lo tienen por su tipo de cuenta (se muestra marcado y sin poder quitarse). */
  incluidoPor?: (tipo: TipoAcceso, area?: AreaId) => boolean
}

export interface Categoria {
  id: string
  nombre: string
  descripcion: string
  permisos: Permiso[]
}

export const ID_REPORTE = (r: 'laboratorio' | 'postventa') => `reporte:${r}`
const PREFIJO_REPORTE = 'reporte:'

export const CATEGORIAS: Categoria[] = [
  {
    id: 'datacore',
    nombre: 'Data Core',
    descripcion: 'Preparación y homogenización de los datos del sistema.',
    permisos: [
      { id: 'ingesta', nombre: 'Ingesta de Datos', descripcion: 'Carga, homogeneización y confirmación de resultados en la base de datos.' },
      { id: 'trace', nombre: 'Trace', descripcion: 'Trazabilidad de registros pH/ORP de equipos Accu-Tab e informes PDF.' },
      { id: 'converter', nombre: 'Converter', descripcion: 'Conversión y homogenización de informes de laboratorio contra el catálogo oficial.' },
    ],
  },
  {
    id: 'resultados',
    nombre: 'Resultados y auditoría',
    descripcion: 'Consultar resultados y revisar el cumplimiento.',
    permisos: [
      { id: 'reports', nombre: 'Report', descripcion: 'Control de residuos: límites residuales en tiempo real desde la base de datos.' },
      { id: ID_REPORTE('laboratorio'), padre: 'reports', nombre: 'Reporte de laboratorio', descripcion: 'Consulta y gráficos de Cromatografía.' },
      { id: ID_REPORTE('postventa'), padre: 'reports', nombre: 'Postventa', descripcion: 'Histórico e informes de Trace.' },
      { id: 'auditoria_interna', nombre: 'Auditoría Interna', descripcion: 'Solicitudes emitidas vs. informes recibidos, carpetas de auditoría, límites de control e indicadores de entrega.' },
    ],
  },
  {
    id: 'lab',
    nombre: 'AgroFresh Lab',
    descripcion: 'El laboratorio propio: muestras, controles diarios e informes.',
    permisos: [
      { id: 'agrofresh_lab', nombre: 'AgroFresh Lab', descripcion: 'Ingreso de muestras, cruce con el resultado del GC y emisión de informes.' },
      { id: 'lab_ingreso', padre: 'agrofresh_lab', nombre: 'Ingreso al laboratorio', descripcion: 'Recibir la muestra, cruzarla con su solicitud y subir el resultado del GC.' },
      { id: 'lab_verificaciones', padre: 'agrofresh_lab', nombre: 'Verificaciones diarias', descripcion: 'Control diario de equipos (REG-03) y su histórico.' },
      {
        id: 'verif_firmar', padre: 'lab_verificaciones', extra: true, nombre: 'Firmar la revisión del día',
        descripcion: 'Dejar su firma en un día de verificaciones ya revisado.',
        incluidoPor: (tipo, area) => tipo === 'admin_area' && area === 'cromatografia',
      },
      { id: 'lab_criterios', padre: 'lab_verificaciones', extra: true, nombre: 'Modificar los criterios', descripcion: 'Cambiar tolerancias, parámetros, equipos y catálogos en la pantalla Criterios del control diario. Sin esto solo los ve.' },
      { id: 'lab_envio', padre: 'agrofresh_lab', nombre: 'Envío de informes', descripcion: 'Enviar los PDF del laboratorio a la lista de distribución del cliente.' },
    ],
  },
  {
    id: 'solicitudes',
    nombre: 'Toma de muestras',
    descripcion: 'Solicitudes de análisis a los laboratorios.',
    permisos: [
      { id: 'toma_muestras', nombre: 'Toma de solicitudes', descripcion: 'Listado, creación y detalle de solicitudes de análisis.' },
      {
        id: 'toma_reanalisis', padre: 'toma_muestras', extra: true, nombre: 'Crear reanálisis',
        descripcion: 'Pedir un reanálisis de una muestra ya analizada.',
        incluidoPor: (tipo) => tipo === 'admin_area',
      },
    ],
  },
  {
    id: 'archivos',
    nombre: 'Archivos',
    descripcion: 'Documentos del servidor y de la nube.',
    permisos: [{ id: 'storage', nombre: 'Storage', descripcion: 'Archivos guardados en el servidor y en la nube: explorar, subir y descargar.' }],
  },
]

/** Lo que solo puede hacer el administrador general: se muestra bloqueado y nunca se reparte. */
export const RESERVADOS: { nombre: string; descripcion: string }[] = [
  { nombre: 'Usuarios y permisos', descripcion: 'Crear cuentas, repartir permisos y reiniciar contraseñas.' },
  { nombre: 'Listados', descripcion: 'Sold To, Ship To, especies y variedades oficiales.' },
  { nombre: 'Laboratorios y contactos', descripcion: 'Laboratorios, plantillas de correo y contactos de solicitud.' },
  { nombre: 'Notificaciones', descripcion: 'Avisos y quién recibe cada tipo de notificación.' },
  { nombre: 'Administración General', descripcion: 'Correcciones, listas de distribución, funciones de Report, panel de inicio y avisos a clientes.' },
  { nombre: 'Configuración de muestreo', descripcion: 'Opciones y tipos del formulario de solicitudes.' },
  { nombre: 'Acciones del administrador principal', descripcion: 'Pasar Envío de informes a producción, quitar informes y eliminar solicitudes.' },
]

const TODOS: Permiso[] = CATEGORIAS.flatMap((c) => c.permisos)
export const IDS_PERMISOS: string[] = TODOS.map((p) => p.id)
const LAB_SECCIONES_IDS = ['lab_ingreso', 'lab_verificaciones', 'lab_envio']

export const esPermisoReporte = (id: string): boolean => id.startsWith(PREFIJO_REPORTE)

function hijosDe(id: string): Permiso[] {
  return TODOS.filter((p) => p.padre === id)
}

function descendientes(id: string): string[] {
  return hijosDe(id).flatMap((h) => [h.id, ...descendientes(h.id)])
}

function ancestros(id: string): string[] {
  const padre = TODOS.find((p) => p.id === id)?.padre
  return padre ? [padre, ...ancestros(padre)] : []
}

/** Marca o desmarca un permiso respetando la jerarquía: quitar al padre quita a todos sus hijos; marcar a un
 * hijo marca a sus padres; marcar al padre da también los hijos «normales» (no las funciones `extra`). */
export function alternarPermiso(seleccion: string[], id: string): string[] {
  const actual = new Set(seleccion)
  if (actual.has(id)) {
    actual.delete(id)
    descendientes(id).forEach((d) => actual.delete(d))
  } else {
    actual.add(id)
    ancestros(id).forEach((a) => actual.add(a))
    hijosDe(id).filter((h) => !h.extra).forEach((h) => actual.add(h.id))
  }
  return IDS_PERMISOS.filter((p) => actual.has(p))
}

/** «Marcar todo» / «Quitar todo» de una categoría. */
export function marcarCategoria(seleccion: string[], categoriaId: string, marcar: boolean): string[] {
  const ids = CATEGORIAS.find((c) => c.id === categoriaId)?.permisos.map((p) => p.id) ?? []
  const actual = new Set(seleccion)
  ids.forEach((id) => (marcar ? actual.add(id) : actual.delete(id)))
  return IDS_PERMISOS.filter((p) => actual.has(p))
}

export function incluidoPorTipo(permiso: Permiso, tipo: TipoAcceso, area?: AreaId): boolean {
  return permiso.incluidoPor?.(tipo, area) ?? false
}

type CuentaPermisos = Pick<Usuario, 'tipoAcceso' | 'area' | 'modulos' | 'reportes'>

/** Lo que la cuenta tiene hoy, en la lista única que usa el selector. `modulosBase`/`reportesBase` son los de la
 * plantilla de su tipo (`modulosPredeterminados`/`reportesPredeterminados`) para las cuentas sin lista propia. */
export function seleccionDesdeCuenta(
  cuenta: CuentaPermisos,
  modulosBase: string[],
  reportesBase: Array<'laboratorio' | 'postventa'>,
): string[] {
  const modulos = cuenta.modulos ?? modulosBase
  const sel = new Set(modulos.filter((m) => IDS_PERMISOS.includes(m)))
  if (sel.has('agrofresh_lab') && !LAB_SECCIONES_IDS.some((s) => sel.has(s))) {
    LAB_SECCIONES_IDS.forEach((s) => sel.add(s)) // ninguna elegida = las tres, como siempre
  }
  if (sel.has('reports')) (cuenta.reportes ?? reportesBase).forEach((r) => sel.add(ID_REPORTE(r)))
  return IDS_PERMISOS.filter((p) => sel.has(p))
}

export function validarSeleccion(seleccion: string[]): string | null {
  if (seleccion.includes('reports') && !seleccion.some(esPermisoReporte)) {
    return 'Elige al menos una sección de Report o quita el módulo Report.'
  }
  if (seleccion.includes('agrofresh_lab') && !LAB_SECCIONES_IDS.some((s) => seleccion.includes(s))) {
    return 'Elige al menos una sección de AgroFresh Lab o quita el módulo.'
  }
  return null
}

/** De la lista del selector a lo que se guarda. Con las tres puertas de AgroFresh Lab marcadas no se guarda
 * ninguna (la cuenta sigue viendo todo, como siempre); si falta alguna, se guardan las elegidas. */
export function cuentaDesdeSeleccion(seleccion: string[]): { modulos: string[]; reportes?: Array<'laboratorio' | 'postventa'> } {
  const sel = new Set(seleccion)
  const todasLab = LAB_SECCIONES_IDS.every((s) => sel.has(s))
  const modulos = IDS_PERMISOS.filter((id) => {
    if (!sel.has(id) || esPermisoReporte(id)) return false
    if (todasLab && LAB_SECCIONES_IDS.includes(id)) return false
    return true
  })
  const reportes = (['laboratorio', 'postventa'] as const).filter((r) => sel.has(ID_REPORTE(r)))
  return { modulos, reportes: sel.has('reports') ? [...reportes] : undefined }
}

/** Lo que se muestra marcado (sin poder cambiarlo) para quien lo ve todo: el administrador general tiene todo;
 * gerencia todo lo de lectura, menos Auditoría interna y las funciones sueltas (que son de escritura). */
export function seleccionTotal(tipo: 'admin_general' | 'gerencia'): string[] {
  if (tipo === 'admin_general') return [...IDS_PERMISOS]
  return TODOS.filter((p) => p.id !== 'auditoria_interna' && !p.extra).map((p) => p.id)
}
