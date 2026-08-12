import type { AuthUser } from '../types'

/**
 * PENDIENTE: esto es un stub mientras se define el backend (queda pendiente,
 * se retoma la conversación más adelante). No valida contraseñas de verdad —
 * solo sostiene el flujo de login/sesión del shell para poder construir y
 * probar el resto de la interfaz. Nada de esto debe considerarse seguro.
 */

const USUARIO_MAESTRO: AuthUser = {
  email: 'jorge.sandoval@agrofresh.com',
  nombre: 'Jorge Sandoval',
  rol: 'aprobacion',
}

export async function login(email: string, password: string): Promise<AuthUser> {
  if (!password) {
    throw new Error('Ingresa tu contraseña.')
  }
  if (email.trim().toLowerCase() !== USUARIO_MAESTRO.email) {
    throw new Error('Usuario no reconocido.')
  }
  return USUARIO_MAESTRO
}

export async function logout(): Promise<void> {}
