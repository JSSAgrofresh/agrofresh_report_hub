import type { Usuario } from '../types'

/**
 * Almacén de usuarios en localStorage: no hay backend ni base de datos
 * todavía, pero el CRUD y el login deben funcionar de punta a punta.
 */

const KEY = 'agrofresh.usuarios'

export const CORREO_MAESTRO = 'jorge.sandoval@agrofresh.com'

const SEED: Usuario[] = [
  { id: 'u-1', email: CORREO_MAESTRO, nombre: 'Jorge Sandoval', tipoAcceso: 'admin_general' },
  {
    id: 'u-2',
    email: 'psalazar@agrofresh.com',
    nombre: 'Patricia Salazar',
    tipoAcceso: 'admin_area',
    area: 'cromatografia',
  },
  {
    id: 'u-3',
    email: 'rpoblete@agrofresh.com',
    nombre: 'Rodrigo Poblete',
    tipoAcceso: 'admin_area',
    area: 'postcosecha',
  },
  {
    id: 'u-4',
    email: 'cliente.demo@ejemplo.com',
    nombre: 'Cliente Demo',
    tipoAcceso: 'cliente',
    area: 'cromatografia',
    clienteNombre: 'Empresa Demo Ltda.',
  },
]

function leer(): Usuario[] {
  const raw = window.localStorage.getItem(KEY)
  if (!raw) {
    window.localStorage.setItem(KEY, JSON.stringify(SEED))
    return SEED
  }
  try {
    return JSON.parse(raw) as Usuario[]
  } catch {
    return SEED
  }
}

function guardar(usuarios: Usuario[]): void {
  window.localStorage.setItem(KEY, JSON.stringify(usuarios))
}

export function listarUsuarios(): Usuario[] {
  return leer()
}

export function buscarUsuarioPorEmail(email: string): Usuario | undefined {
  const buscado = email.trim().toLowerCase()
  return leer().find((u) => u.email.toLowerCase() === buscado)
}

export function crearUsuario(datos: Omit<Usuario, 'id'>): Usuario {
  const usuarios = leer()
  const email = datos.email.trim().toLowerCase()
  if (usuarios.some((u) => u.email.toLowerCase() === email)) {
    throw new Error('Ya existe un usuario con ese correo.')
  }
  const nuevo: Usuario = { ...datos, email: datos.email.trim(), id: `u-${Date.now()}` }
  guardar([...usuarios, nuevo])
  return nuevo
}

export function actualizarUsuario(id: string, datos: Partial<Omit<Usuario, 'id'>>): Usuario {
  const usuarios = leer()
  const idx = usuarios.findIndex((u) => u.id === id)
  if (idx === -1) throw new Error('Usuario no encontrado.')

  const actual = usuarios[idx]
  if (actual.email === CORREO_MAESTRO && datos.tipoAcceso && datos.tipoAcceso !== 'admin_general') {
    throw new Error('El usuario maestro no puede perder el acceso de administrador general.')
  }
  if (datos.email && datos.email.trim().toLowerCase() !== actual.email.toLowerCase()) {
    const nuevoEmail = datos.email.trim().toLowerCase()
    if (usuarios.some((u) => u.id !== id && u.email.toLowerCase() === nuevoEmail)) {
      throw new Error('Ya existe un usuario con ese correo.')
    }
  }

  const actualizado: Usuario = { ...actual, ...datos, email: datos.email?.trim() ?? actual.email }
  const copia = [...usuarios]
  copia[idx] = actualizado
  guardar(copia)
  return actualizado
}

export function eliminarUsuario(id: string): void {
  const usuarios = leer()
  const objetivo = usuarios.find((u) => u.id === id)
  if (objetivo?.email === CORREO_MAESTRO) {
    throw new Error('El usuario maestro no se puede eliminar.')
  }
  guardar(usuarios.filter((u) => u.id !== id))
}
