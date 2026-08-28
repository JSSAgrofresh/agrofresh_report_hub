import { buscarUsuarioPorEmail } from '@/features/usuarios'
import type { AuthUser } from '../types'

/**
 * PENDIENTE: esto es un stub mientras se define el backend de sesiones. No
 * valida contraseñas de verdad — solo resuelve el usuario por correo contra
 * el padrón del backend para sostener el flujo de login/sesión del shell.
 * Nada de esto debe considerarse seguro.
 */

export async function login(email: string, password: string): Promise<AuthUser> {
  if (!password) {
    throw new Error('Ingresa tu contraseña.')
  }
  const usuario = await buscarUsuarioPorEmail(email)
  if (!usuario) {
    throw new Error('Usuario no reconocido.')
  }
  return usuario
}

export async function logout(): Promise<void> {}
