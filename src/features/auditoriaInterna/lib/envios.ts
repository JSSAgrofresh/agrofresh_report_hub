import type { EnvioInforme } from './tipos'

/** Lo que se ve en la auditoría de envíos: todo o un solo tipo. «Fallidos» son los que no salieron (reales o de prueba). */
export type VistaEnvios = 'todos' | 'real' | 'prueba' | 'manual' | 'fallido'

export const VISTAS_ENVIOS: { id: VistaEnvios; etiqueta: string }[] = [
  { id: 'todos', etiqueta: 'Todos' },
  { id: 'real', etiqueta: 'Enviados a clientes' },
  { id: 'prueba', etiqueta: 'De prueba' },
  { id: 'manual', etiqueta: 'Marcados a mano' },
  { id: 'fallido', etiqueta: 'Fallidos' },
]

export function cumpleVista(e: EnvioInforme, vista: VistaEnvios): boolean {
  if (vista === 'todos') return true
  if (vista === 'fallido') return !e.exitoso
  return e.tipo === vista
}

export function contarVistas(envios: EnvioInforme[]): Record<VistaEnvios, number> {
  const cuenta: Record<VistaEnvios, number> = { todos: envios.length, real: 0, prueba: 0, manual: 0, fallido: 0 }
  for (const e of envios) {
    cuenta[e.tipo] += 1
    if (!e.exitoso) cuenta.fallido += 1
  }
  return cuenta
}

const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Busca cada palabra (sin tildes ni mayúsculas) en solicitud, informe, cliente, planta, laboratorio, destinatarios y quién lo envió. */
export function filtrarEnvios(envios: EnvioInforme[], vista: VistaEnvios, texto: string): EnvioInforme[] {
  const palabras = sinTildes(texto).split(/\s+/).filter(Boolean)
  return envios.filter((e) => {
    if (!cumpleVista(e, vista)) return false
    if (palabras.length === 0) return true
    const pajar = sinTildes(
      [e.solicitud, e.informe, e.sold_to, e.ship_to, e.laboratorio, e.especie, e.enviado_por, e.origen, e.error, e.exitoso ? 'enviado' : 'fallo falló', ...e.pedido_a, ...e.enviado_a]
        .filter(Boolean)
        .join(' '),
    )
    return palabras.every((p) => pajar.includes(p))
  })
}
