import { describe, expect, it } from 'vitest'
import { contarVistas, cumpleVista, filtrarEnvios } from './envios'
import type { EnvioInforme } from './tipos'

const envio = (p: Partial<EnvioInforme>): EnvioInforme => ({
  id: 'x', fecha: '2026-10-20T12:00:00Z', tipo: 'real', exitoso: true, error: null, solicitud: 'OT-AGF0075', informe: 'Informe AGF-0075',
  laboratorio: 'AGROFRESH', sold_to: 'DOLE', ship_to: 'DOLE LONTUÉ', especie: 'Cereza', pedido_a: ['cliente@dole.cl'], enviado_a: ['cliente@dole.cl'],
  enviado_por: 'Paz', origen: 'Envío de informes', ...p,
})

const ENVIOS = [
  envio({ id: '1' }),
  envio({ id: '2', tipo: 'prueba', enviado_a: ['paz@agrofresh.com'] }),
  envio({ id: '3', tipo: 'manual', solicitud: 'OT-QUI0025', ship_to: 'DOLE CODEGUA', pedido_a: [], enviado_a: [], enviado_por: 'Jorge', origen: 'Converter' }),
  envio({ id: '4', exitoso: false, error: 'Error SMTP' }),
]

describe('auditoría de envíos', () => {
  it('cuenta cada vista; un fallido también cuenta en su tipo', () => {
    expect(contarVistas(ENVIOS)).toEqual({ todos: 4, real: 2, prueba: 1, manual: 1, fallido: 1 })
  })

  it('cada vista deja solo lo suyo', () => {
    expect(ENVIOS.filter((e) => cumpleVista(e, 'prueba')).map((e) => e.id)).toEqual(['2'])
    expect(ENVIOS.filter((e) => cumpleVista(e, 'fallido')).map((e) => e.id)).toEqual(['4'])
    expect(ENVIOS.filter((e) => cumpleVista(e, 'todos'))).toHaveLength(4)
  })

  it('busca sin tildes ni mayúsculas en la planta, la solicitud, los destinatarios y quien lo envió', () => {
    expect(filtrarEnvios(ENVIOS, 'todos', 'lontue').map((e) => e.id)).toEqual(['1', '2', '4'])
    expect(filtrarEnvios(ENVIOS, 'todos', 'qui0025').map((e) => e.id)).toEqual(['3'])
    expect(filtrarEnvios(ENVIOS, 'todos', 'PAZ@agrofresh').map((e) => e.id)).toEqual(['2'])
    expect(filtrarEnvios(ENVIOS, 'todos', 'jorge converter').map((e) => e.id)).toEqual(['3'])
  })

  it('la vista y el texto se combinan', () => {
    expect(filtrarEnvios(ENVIOS, 'real', 'dole').map((e) => e.id)).toEqual(['1', '4'])
    expect(filtrarEnvios(ENVIOS, 'real', 'no existe')).toEqual([])
  })
})
