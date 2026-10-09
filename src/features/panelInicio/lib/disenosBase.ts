import type { Pieza } from './grilla'

/** El panel «de siempre», como diseño: sirve de punto de partida («Empezar con el panel de siempre»). */
export const BASE_INTERNO: Pieza[] = [
  { id: 'modulo:ingesta', x: 0, y: 0, w: 3, h: 3 },
  { id: 'modulo:trace', x: 3, y: 0, w: 3, h: 3 },
  { id: 'modulo:converter', x: 6, y: 0, w: 3, h: 3 },
  { id: 'modulo:reports', x: 9, y: 0, w: 3, h: 3 },
  { id: 'modulo:agrofresh_lab', x: 0, y: 3, w: 3, h: 3 },
  { id: 'modulo:auditoria_interna', x: 3, y: 3, w: 3, h: 3 },
  { id: 'modulo:storage', x: 6, y: 3, w: 3, h: 3 },
  { id: 'kpi:solicitudes', x: 0, y: 6, w: 3, h: 2 },
  { id: 'kpi:semana', x: 3, y: 6, w: 3, h: 2 },
  { id: 'kpi:converter', x: 6, y: 6, w: 3, h: 2 },
  { id: 'kpi:verificacion', x: 9, y: 6, w: 3, h: 2 },
  { id: 'panel:usuarios_activos', x: 0, y: 8, w: 4, h: 5 },
  { id: 'panel:converter', x: 4, y: 8, w: 4, h: 5 },
  { id: 'panel:trace', x: 8, y: 8, w: 4, h: 5 },
  { id: 'panel:solicitudes', x: 0, y: 13, w: 6, h: 5 },
  { id: 'panel:verificaciones', x: 6, y: 13, w: 6, h: 5 },
]

export const BASE_CLIENTE_CROMATOGRAFIA: Pieza[] = [
  { id: 'cliente:encabezado', x: 0, y: 0, w: 12, h: 3 },
  { id: 'cliente:reporte', x: 0, y: 3, w: 12, h: 12 },
]

export const BASE_CLIENTE_POSTVENTA: Pieza[] = [
  { id: 'cliente:encabezado', x: 0, y: 0, w: 12, h: 3 },
  { id: 'cliente:accutab', x: 0, y: 3, w: 12, h: 8 },
]

export function baseParaClave(clave: string): Pieza[] {
  if (clave.startsWith('tipo:cliente:postventa')) return BASE_CLIENTE_POSTVENTA
  if (clave.startsWith('tipo:cliente')) return BASE_CLIENTE_CROMATOGRAFIA
  return BASE_INTERNO
}
