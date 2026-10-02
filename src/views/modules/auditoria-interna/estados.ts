import type { EstadoSolicitud } from '@/features/auditoriaInterna'

/**
 * Un color por estado, el MISMO en todas las pantallas (barra de avance,
 * gráficos, pastillas): el color sigue a la entidad, nunca a su posición.
 * Validados con el validador de paletas (CVD deutan ΔE 10,3): teal/naranjo/gris.
 * `tinta` es la versión oscura para texto sobre el fondo tenue de la pastilla.
 */
export const ESTADOS: Record<
  EstadoSolicitud,
  { texto: string; corto: string; color: string; tinta: string; fondo: string; descripcion: string }
> = {
  concretada: {
    texto: 'Informes Recibidos',
    corto: 'Concretada',
    color: '#1b7f5c',
    tinta: '#14664a',
    fondo: 'rgba(27, 127, 92, 0.12)',
    descripcion: 'PDF guardado y resultados en Report',
  },
  sin_report: {
    texto: 'PDF sin Report',
    corto: 'PDF sin Report',
    color: '#c2410c',
    tinta: '#9a3412',
    fondo: 'rgba(194, 65, 12, 0.11)',
    descripcion: 'Tiene PDF, sus resultados aún no están en Report',
  },
  pendiente: {
    texto: 'Solicitudes enviadas',
    corto: 'Pendiente',
    color: '#8b978f',
    tinta: '#4b5750',
    fondo: 'rgba(139, 151, 143, 0.16)',
    descripcion: 'Aún sin informe',
  },
}

export const ORDEN_ESTADOS: EstadoSolicitud[] = ['concretada', 'sin_report', 'pendiente']

/** Los estados que muestran las donas y la cifra de arriba: Informes Recibidos y
 * Solicitudes enviadas. «PDF sin Report» no se muestra aparte: se suma a las
 * solicitudes enviadas (aún sin informe concretado), así el total no cambia. */
export const ESTADOS_DONA: EstadoSolicitud[] = ['concretada', 'pendiente']
