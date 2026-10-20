import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { EnvioInforme } from '@/features/auditoriaInterna'

const api = vi.hoisted(() => ({ listarEnviosInformes: vi.fn() }))
vi.mock('@/features/auditoriaInterna', async (importar) => ({ ...(await importar<typeof import('@/features/auditoriaInterna')>()), ...api }))

import { EnviosInformesView } from './EnviosInformesView'

const envio = (p: Partial<EnvioInforme>): EnvioInforme => ({
  id: 'x', fecha: '2026-10-20T15:00:00Z', tipo: 'real', exitoso: true, error: null, solicitud: 'OT-AGF0075', informe: 'Informe AGF-0075',
  laboratorio: 'AGROFRESH', sold_to: 'DOLE', ship_to: 'DOLE LONTUE', especie: 'Cereza', pedido_a: ['cliente@dole.cl'], enviado_a: ['cliente@dole.cl'],
  enviado_por: 'Paz', origen: 'Envío de informes', ...p,
})

beforeEach(() => {
  api.listarEnviosInformes.mockResolvedValue([
    envio({ id: '1' }),
    envio({ id: '2', tipo: 'prueba', solicitud: 'OT-AGF0080', pedido_a: ['cliente@dole.cl'], enviado_a: ['paz@agrofresh.com'] }),
    envio({ id: '3', tipo: 'manual', solicitud: 'OT-QUI0025', pedido_a: [], enviado_a: [], enviado_por: 'Jorge', origen: 'Converter' }),
    envio({ id: '4', exitoso: false, error: 'Error SMTP', solicitud: 'OT-AGF0090' }),
  ])
})

describe('Informes enviados a clientes', () => {
  it('parte con los envíos reales y deja ver los de prueba y los marcados a mano', async () => {
    render(<EnviosInformesView />)
    await screen.findByText('OT-AGF0075')
    expect(screen.queryByText('OT-AGF0080')).toBeNull()
    expect(screen.queryByText('OT-QUI0025')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /De prueba/ }))
    expect(screen.getByText('OT-AGF0080')).toBeTruthy()
    expect(screen.getByText(/Se habría enviado a: cliente@dole.cl/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Marcados a mano/ }))
    expect(screen.getByText('OT-QUI0025')).toBeTruthy()
    expect(screen.getByText(/sin registro de destinatarios/)).toBeTruthy()
  })

  it('un envío fallido muestra su causa y se encuentra en «Fallidos»', async () => {
    render(<EnviosInformesView />)
    await screen.findByText('OT-AGF0075')
    fireEvent.click(screen.getByRole('button', { name: /Fallidos/ }))
    const fila = screen.getByText('OT-AGF0090').closest('tr') as HTMLElement
    expect(within(fila).getByText(/Falló: Error SMTP/)).toBeTruthy()
  })

  it('el buscador filtra por planta o destinatario', async () => {
    render(<EnviosInformesView />)
    await screen.findByText('OT-AGF0075')
    fireEvent.change(screen.getByLabelText('Buscar envíos'), { target: { value: 'no existe' } })
    expect(screen.getByText('Ningún envío coincide con lo que buscas.')).toBeTruthy()
  })

  it('si falla la carga lo avisa', async () => {
    api.listarEnviosInformes.mockRejectedValueOnce(new Error('No se pudo conectar'))
    render(<EnviosInformesView />)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('No se pudo conectar'))
  })
})
