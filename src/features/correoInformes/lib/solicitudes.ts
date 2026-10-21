import type { EstadoSolicitud, SolicitudIngreso } from './api'

export type FiltroSolicitudes = EstadoSolicitud | 'todas'

function sinTildes(t: string): string {
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/** Las solicitudes de un estado (o todas) que contienen el texto buscado, sin importar tildes ni mayúsculas. */
export function filtrarSolicitudes(solicitudes: SolicitudIngreso[], filtro: FiltroSolicitudes, texto: string): SolicitudIngreso[] {
  const q = sinTildes(texto.trim())
  return solicitudes.filter((s) => {
    if (filtro !== 'todas' && s.estado !== filtro) return false
    if (!q) return true
    return sinTildes([s.ot, s.laboratorio, s.sold_to, s.ship_to, s.especie, s.nro_informe].filter(Boolean).join(' ')).includes(q)
  })
}
