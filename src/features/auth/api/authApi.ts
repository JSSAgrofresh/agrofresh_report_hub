import { httpClient } from '@/services/http/client'
import { guardarToken } from '@/services/http/sesion'
import type { AuthUser } from '../types'

/**
 * Iniciar y cerrar sesión.
 *
 * Esto era un stub: aceptaba cualquier contraseña no vacía y resolvía la
 * cuenta por correo. Ahora la contraseña la verifica el backend contra el
 * hash guardado, y lo que vuelve es un token que autoriza cada llamada
 * posterior. Sin ese token, la API no responde nada.
 */

interface RespuestaLogin {
  token: string
  usuario: AuthUser
}

export async function login(email: string, password: string): Promise<AuthUser> {
  if (!password) throw new Error('Ingresa tu contraseña.')
  const { token, usuario } = await httpClient.post<RespuestaLogin>('/auth/login', {
    email: email.trim(),
    password,
  })
  // El token se guarda ANTES de devolver la cuenta: lo primero que hace la
  // aplicación al recibirla es pedir datos, y esas llamadas ya lo necesitan.
  guardarToken(token)
  return usuario
}

export async function logout(): Promise<void> {
  try {
    // Que el backend borre la sesión, no solo el navegador: si el token
    // siguiera vivo en la tabla, una copia de él seguiría sirviendo.
    await httpClient.post('/auth/logout', {})
  } catch {
    // Backend caído o token ya vencido: cerrar sesión igual. Quedarse dentro
    // porque el servidor no contesta es lo contrario de lo que se pidió.
  } finally {
    guardarToken(null)
  }
}

/** La cuenta vigente según el backend, o `null` si el token ya no sirve. */
export async function cuentaVigente(): Promise<AuthUser> {
  return httpClient.get<AuthUser>('/auth/yo')
}

export async function cambiarPassword(actual: string, nueva: string): Promise<AuthUser> {
  return httpClient.post<AuthUser>('/auth/cambiar-password', {
    password_actual: actual,
    password_nueva: nueva,
  })
}
