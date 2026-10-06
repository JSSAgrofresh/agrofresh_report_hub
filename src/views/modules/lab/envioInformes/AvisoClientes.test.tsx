import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AvisoClientes } from './AvisoClientes'

const api = vi.hoisted(() => ({ obtenerAvisoClientes: vi.fn(), enviarPruebaAviso: vi.fn() }))
vi.mock('@/features/envioInformes', () => api)

const aviso = {
  asunto: '[AgroFresh] Envío automático de informes de análisis',
  texto: 'Estimados clientes:',
  html: '<p>Estimados clientes:</p>',
  destinatarios_prueba: ['psalazar@agrofresh.com', 'jorge.sandoval@agrofresh.com'],
}

describe('AvisoClientes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.obtenerAvisoClientes.mockResolvedValue(aviso)
  })

  it('muestra el asunto y a quién saldría la prueba, sin enviar nada al abrir', async () => {
    render(<AvisoClientes />)
    expect(await screen.findByText(aviso.asunto)).toBeTruthy()
    expect(screen.getByTitle('Vista previa del aviso a clientes')).toBeTruthy()
    expect(screen.getByText(/solo a psalazar@agrofresh.com y jorge.sandoval@agrofresh.com/)).toBeTruthy()
    expect(api.enviarPruebaAviso).not.toHaveBeenCalled()
  })

  it('«Probar el aviso» llama al envío de prueba y muestra el resultado', async () => {
    api.enviarPruebaAviso.mockResolvedValue({ ok: 'Prueba enviada a Paz y Jorge. No salió nada a clientes.', to: [] })
    render(<AvisoClientes />)
    fireEvent.click(await screen.findByRole('button', { name: 'Probar el aviso' }))
    await waitFor(() => expect(api.enviarPruebaAviso).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/No salió nada a clientes/)).toBeTruthy()
  })
})
