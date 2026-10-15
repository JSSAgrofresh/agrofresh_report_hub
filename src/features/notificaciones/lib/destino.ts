import type { Notificacion, TipoCuentaDestino } from '../types'

/** Tipos de cuenta a los que se puede dirigir un aviso. Los clientes no están: no tienen campana. */
export const TIPOS_CUENTA: { id: TipoCuentaDestino; label: string }[] = [
  { id: 'admin_general', label: 'Administradores generales' },
  { id: 'gerencia', label: 'Gerencia' },
  { id: 'admin_area', label: 'Administradores de área' },
  { id: 'analista', label: 'Analistas' },
  { id: 'muestreador', label: 'Muestreadores' },
]

export const TODOS_LOS_TIPOS: TipoCuentaDestino[] = TIPOS_CUENTA.map((t) => t.id)

/**
 * A qué tipos de cuenta va un aviso. Los nuevos lo traen elegido; los antiguos
 * solo tenían `audiencia`, que se traduce a lo más parecido.
 */
export function destinoDe(
  n: Pick<Notificacion, 'audiencia' | 'metadata'>,
): TipoCuentaDestino[] {
  const elegidos = n.metadata?.tipos_destino
  if (elegidos) return elegidos
  if (n.audiencia === 'admin_general') return ['admin_general']
  if (n.audiencia === 'cromatografia') return ['admin_general', 'admin_area', 'analista']
  return [...TODOS_LOS_TIPOS]
}

/** El destino en una frase corta, para la tabla. */
export function resumenDestino(tipos: TipoCuentaDestino[]): string {
  if (TODOS_LOS_TIPOS.every((t) => tipos.includes(t))) return 'Todos los usuarios internos'
  return TIPOS_CUENTA.filter((t) => tipos.includes(t.id)).map((t) => t.label).join(', ')
}
