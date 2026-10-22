/**
 * Paleta activa de los gráficos. El estilo «sobrio» del portal de clientes usa colores apagados y elegantes
 * (una tinta, un verde salvia y tierras suaves) en lugar de la paleta viva de siempre. `PortalShell` la fija al
 * dibujarse y remonta su contenido al cambiar de estilo, así cada gráfico la lee ya puesta.
 */
export type NombrePaleta = 'basico' | 'sobrio'

let activa: NombrePaleta = 'basico'

export function setPaletaActiva(p: NombrePaleta) {
  activa = p
}

export function esPaletaSobria(): boolean {
  return activa === 'sobrio'
}

/** Verde salvia de acento y tinta del estilo sobrio. */
export const ACENTO_SOBRIO = '#3f6b52'
export const TINTA_SOBRIA = '#1f2937'

/** Ocho tonos categóricos apagados, distinguibles entre sí. */
export const CATEGORICA_SOBRIA = ['#3f6b52', '#1f2937', '#8aa4b8', '#c9a66b', '#b97a6e', '#7f8f86', '#5b7c99', '#d3cdbf']

/** Semáforo suave: bien, atención, mal, neutro. */
export const SEMAFORO_SOBRIO = { bien: '#5f9a76', atencion: '#d4ac4e', mal: '#b5524a', neutro: '#b7bdc4' }

/** Presencia y ausencia: azul = ausencia (no detectado), rojo = presencia (detectado). */
export const VERDES_SOBRIO = { bien: '#4a90d9', atencion: '#8aa4b8', mal: '#e5645b' }
