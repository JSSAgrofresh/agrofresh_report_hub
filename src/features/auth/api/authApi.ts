import { buscarUsuarioPorEmail } from '@/features/usuarios'
import type { AuthUser } from '../types'

/**
 * PENDIENTE: esto es un stub mientras se define el backend (queda pendiente,
 * se retoma la conversación más adelante). No valida contraseñas de verdad —
 * solo busca el usuario por correo en el almacén local para sostener el
 * flujo de login/sesión del shell. Nada de esto debe considerarse seguro.
 */

export async function login(email: string, password: string): Promise<AuthUser> {
  if (!password) {
    throw new Error('Ingresa tu contraseña.')
  }
  const usuario = buscarUsuarioPorEmail(email)
  if (!usuario) {
    throw new Error('Usuario no reconocido.')
  }
  return usuario
}

export async function logout(): Promise<void> {}
