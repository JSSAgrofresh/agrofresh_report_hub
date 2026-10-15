import type { Notificacion } from '../types'

/** Un aviso escrito a mano en Administración → Notificaciones (no uno del sistema). */
export function esAvisoManual(n: Pick<Notificacion, 'metadata'>): boolean {
  const tipo = n.metadata?.tipo
  return !tipo || tipo === 'anuncio'
}
