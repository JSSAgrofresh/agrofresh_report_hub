/**
 * Las diapositivas de la presentación (`public/deck/index.html`), en orden.
 * Espejo de `DIAPOSITIVAS` en `backend/app/presentacion.py` y de `ORDER` dentro de la presentación:
 * si se agrega una, se agrega en los tres (hay una prueba que los compara).
 */
export interface Diapositiva {
  id: string
  nombre: string
  detalle: string
}

export const DIAPOSITIVAS: readonly Diapositiva[] = [
  { id: 'portada', nombre: 'Portada', detalle: 'Report Hub por dentro' },
  { id: 'indice', nombre: 'Índice', detalle: 'Qué vamos a recorrer' },
  { id: 'viaje', nombre: 'Report Hub', detalle: 'El viaje de un análisis, con simulación' },
  { id: 'sistemas', nombre: 'Los sistemas', detalle: 'Vercel, Cloudflare, Gmail y GitHub' },
  { id: 'motor', nombre: 'Por dentro', detalle: 'Los ocho engranajes del cerebro' },
  { id: 'historia', nombre: 'Cómo se construyó', detalle: 'Doce semanas, hitos y cifras' },
  { id: 'publicar', nombre: 'Cómo se actualiza', detalle: 'De la idea a producción' },
  { id: 'aporte', nombre: 'Qué nos aporta', detalle: 'Lo que cambia para AgroFresh' },
]

export function indiceDe(id: string | undefined): number {
  return DIAPOSITIVAS.findIndex((d) => d.id === id)
}

export function diapositivaDe(id: string | undefined): Diapositiva | undefined {
  return DIAPOSITIVAS[indiceDe(id)]
}

export function siguienteDe(id: string | undefined): Diapositiva | undefined {
  const i = indiceDe(id)
  return i >= 0 ? DIAPOSITIVAS[i + 1] : undefined
}

export function anteriorDe(id: string | undefined): Diapositiva | undefined {
  const i = indiceDe(id)
  return i > 0 ? DIAPOSITIVAS[i - 1] : undefined
}

/** Los ocho pasos de la simulación de «Report Hub». */
export const PASOS_SIMULACION = [
  'Los técnicos digitan una solicitud',
  'El laboratorio externo analiza y responde',
  'Tú decides: aceptar o rechazar',
  'Llega una muestra al laboratorio AgroFresh',
  'La jefa de cromatografía envía el informe',
  'Las verificaciones del laboratorio',
  'Los clientes entran y descargan',
  'Todo el equipo mira el panel en vivo',
] as const

/** Los íconos del mapa, en el orden de la presentación (clave = id del nodo dentro del mundo). */
export const NODOS = [
  { k: 'T', nombre: 'Técnicos' },
  { k: 'N', nombre: 'Analistas de cromatografía' },
  { k: 'J', nombre: 'Jefa de cromatografía' },
  { k: 'V', nombre: 'Verificaciones' },
  { k: 'U', nombre: 'Equipo AgroFresh' },
  { k: 'G', nombre: 'Administrador general' },
  { k: 'B', nombre: 'Backend' },
  { k: 'C', nombre: 'Correo' },
  { k: 'D', nombre: 'Base de datos' },
  { k: 'F', nombre: 'Archivos' },
  { k: 'P', nombre: 'Pantalla' },
  { k: 'Q', nombre: 'Quiteca' },
  { k: 'L', nombre: 'ALS' },
  { k: 'H', nombre: 'Diagnofruit' },
  { k: 'K', nombre: 'Clientes' },
] as const

/** Los ocho engranajes de «Por dentro». */
export const ENGRANAJES = [
  { k: 'ingesta', nombre: 'Cargar resultados' },
  { k: 'homog', nombre: 'Ordenar nombres' },
  { k: 'correo', nombre: 'Enviar y recibir' },
  { k: 'toma', nombre: 'Pedir un análisis' },
  { k: 'verif', nombre: 'Verificar equipos' },
  { k: 'report', nombre: 'Mostrar resultados' },
  { k: 'panel', nombre: 'Controlar la gestión' },
  { k: 'usuarios', nombre: 'Cuentas y permisos' },
] as const
