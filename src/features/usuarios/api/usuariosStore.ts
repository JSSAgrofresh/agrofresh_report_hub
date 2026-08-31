import { httpClient } from '@/services/http/client'
import type { Usuario } from '../types'

/**
 * Padrón de usuarios. Vive en la tabla `usuario` del backend, no en
 * localStorage: cuando estaba en el navegador, editar el nombre de una cuenta
 * solo cambiaba la copia del administrador y su dueña seguía viendo el nombre
 * anterior al iniciar sesión.
 *
 * Todo lo que cambia el padrón exige ser administrador general, y eso lo
 * verifica el backend: acá no hay ninguna comprobación que sirva de defensa.
 */

export const CORREO_MAESTRO = 'jorge.sandoval@agrofresh.com'

/** Una cuenta recién creada, con la contraseña de un solo uso que hay que
 * dictarle a su dueño. Se muestra UNA vez y no se guarda en claro en ninguna
 * parte: si se pierde, se genera otra. */
export interface UsuarioCreado {
  usuario: Usuario
  passwordTemporal: string
}

export function listarUsuarios(): Promise<Usuario[]> {
  return httpClient.get<Usuario[]>('/usuarios')
}

export function crearUsuario(datos: Omit<Usuario, 'id'>): Promise<UsuarioCreado> {
  return httpClient.post<UsuarioCreado>('/usuarios', { ...datos, email: datos.email.trim() })
}

export function actualizarUsuario(id: string, datos: Omit<Usuario, 'id'>): Promise<Usuario> {
  return httpClient.put<Usuario>(`/usuarios/${encodeURIComponent(id)}`, {
    ...datos,
    email: datos.email.trim(),
  })
}

/** Nueva contraseña temporal para alguien que olvidó la suya. Cierra además
 * todas sus sesiones abiertas. */
export function regenerarPassword(id: string): Promise<UsuarioCreado> {
  return httpClient.post<UsuarioCreado>(`/usuarios/${encodeURIComponent(id)}/password-temporal`, {})
}

export function eliminarUsuario(id: string): Promise<void> {
  return httpClient.delete<void>(`/usuarios/${encodeURIComponent(id)}`)
}
