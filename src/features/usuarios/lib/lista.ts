import { CATEGORIAS, seleccionDesdeCuenta } from '../catalogoPermisos'
import { modulosPredeterminados, reportesPredeterminados, vistaDeCliente } from '../permisos'
import type { TipoAcceso, Usuario } from '../types'

/** Los filtros de la lista de usuarios: «Todos» y un grupo por tipo de cuenta. */
export type GrupoUsuarios = 'todos' | TipoAcceso

export const GRUPOS_USUARIOS: { id: GrupoUsuarios; texto: string }[] = [
  { id: 'todos', texto: 'Todos' },
  { id: 'admin_general', texto: 'Admin general' },
  { id: 'gerencia', texto: 'Gerencia' },
  { id: 'admin_area', texto: 'Admin de área' },
  { id: 'analista', texto: 'Analistas' },
  { id: 'muestreador', texto: 'Muestreadores' },
  { id: 'cliente', texto: 'Clientes' },
]

const plano = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Cuántas cuentas tiene cada grupo (los números de los botones de filtro). */
export function contarPorGrupo(usuarios: Usuario[]): Record<GrupoUsuarios, number> {
  const out = { todos: usuarios.length, admin_general: 0, gerencia: 0, admin_area: 0, analista: 0, muestreador: 0, cliente: 0 } as Record<GrupoUsuarios, number>
  for (const u of usuarios) out[u.tipoAcceso]++
  return out
}

/** Filtra por grupo y por texto (nombre, correo, cliente o sucursal; sin importar mayúsculas ni tildes: cada palabra debe aparecer). */
export function filtrarUsuarios(usuarios: Usuario[], grupo: GrupoUsuarios, texto: string): Usuario[] {
  const palabras = plano(texto).split(/\s+/).filter(Boolean)
  return usuarios.filter((u) => {
    if (grupo !== 'todos' && u.tipoAcceso !== grupo) return false
    if (palabras.length === 0) return true
    const heno = plano([u.nombre, u.email, u.clienteNombre, u.plantaNombre].filter(Boolean).join(' '))
    return palabras.every((p) => heno.includes(p))
  })
}

/** «Jorge Sandoval» → «JS». */
export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  return ((partes[0][0] ?? '') + (partes.length > 1 ? (partes[partes.length - 1][0] ?? '') : '')).toUpperCase()
}

/** Resumen corto de lo que ve una cuenta, para la columna «Qué ve»: nombres de módulo (o de lo que ve un cliente). */
export function resumenAccesos(u: Usuario): string[] {
  if (u.tipoAcceso === 'admin_general') return ['Todo el sistema']
  if (u.tipoAcceso === 'gerencia' && u.modulos == null) return ['Todo, solo lectura']
  if (u.tipoAcceso === 'cliente') {
    const v = vistaDeCliente(u)
    return [v.report && 'Report', v.storage && 'Storage', v.accutab && 'Accu-Tab'].filter((x): x is string => !!x)
  }
  const sel = new Set(seleccionDesdeCuenta(u, modulosPredeterminados(u), reportesPredeterminados(u)))
  return CATEGORIAS.flatMap((c) => c.permisos).filter((p) => !p.padre && sel.has(p.id)).map((p) => p.nombre)
}
