import { httpClient, HttpError } from '@/services/http/client'
import type { Usuario } from '../types'

/**
 * Padrón de usuarios. Vive en el backend (`solicitudes/_config/usuarios.json`),
 * no en localStorage: cuando estaba en el navegador, editar el nombre de una
 * cuenta solo cambiaba la copia del administrador y su dueña seguía viendo el
 * nombre anterior al iniciar sesión.
 *
 * El login sigue siendo un stub sin validación de contraseña (ver
 * `features/auth/api/authApi.ts`); esto solo mantiene las cuentas y permisos.
 */

export const CORREO_MAESTRO = 'jorge.sandoval@agrofresh.com'

export function listarUsuarios(): Promise<Usuario[]> {
  return httpClient.get<Usuario[]>('/usuarios')
}

export async function buscarUsuarioPorEmail(email: string): Promise<Usuario | undefined> {
  try {
    return await httpClient.get<Usuario>(`/usuarios/por-email/${encodeURIComponent(email.trim())}`)
  } catch (err) {
    // Un correo desconocido no es un fallo del sistema: el llamador decide
    // qué mensaje mostrar. Cualquier otro error sí se propaga.
    if (err instanceof HttpError && err.status === 404) return undefined
    throw err
  }
}

export function crearUsuario(datos: Omit<Usuario, 'id'>): Promise<Usuario> {
  return httpClient.post<Usuario>('/usuarios', { ...datos, email: datos.email.trim() })
}

export function actualizarUsuario(
  id: string,
  datos: Omit<Usuario, 'id'>,
): Promise<Usuario> {
  return httpClient.put<Usuario>(`/usuarios/${encodeURIComponent(id)}`, {
    ...datos,
    email: datos.email.trim(),
  })
}

export function eliminarUsuario(id: string): Promise<void> {
  return httpClient.delete<void>(`/usuarios/${encodeURIComponent(id)}`)
}
