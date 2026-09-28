import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HistorialCargas } from './HistorialCargas'
import type { CargaDatos } from '@/features/ingest'

const { listarCargas, deshacerCarga } = vi.hoisted(() => ({
  listarCargas: vi.fn(),
  deshacerCarga: vi.fn(),
}))

vi.mock('@/features/ingest', () => ({ listarCargas, deshacerCarga }))

const CARGA: CargaDatos = {
  id: 12,
  origen: 'converter',
  archivo: '2026-1879-PC.pdf',
  filas: 1,
  creado_por: 'Jorge Sandoval',
  creado_en: '2026-09-25T14:32:00Z',
  deshecha_en: null,
  deshecha_por: null,
  solicitudes: 1,
  resultados: 2,
  pendientes: 0,
}

afterEach(() => vi.clearAllMocks())

describe('HistorialCargas', () => {
  it('muestra cada carga con lo que trajo', async () => {
    listarCargas.mockResolvedValue({ disponible: true, cargas: [CARGA] })
    render(<HistorialCargas version={0} onCambio={() => {}} />)
    expect(await screen.findByText('2026-1879-PC.pdf')).toBeInTheDocument()
    expect(screen.getByText('PDF')).toBeInTheDocument()
    expect(screen.getByText(/Jorge Sandoval/)).toBeInTheDocument()
    expect(screen.getByText('resultados', { exact: false })).toBeInTheDocument()
  })

  it('deshacer pide confirmación, deshace y avisa para releer', async () => {
    listarCargas.mockResolvedValue({ disponible: true, cargas: [CARGA] })
    deshacerCarga.mockResolvedValue({
      carga_id: 12,
      solicitudes: 1,
      resultados: 2,
      productos: 0,
      pendientes: 0,
    })
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onCambio = vi.fn()
    render(<HistorialCargas version={0} onCambio={onCambio} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Deshacer' }))
    expect(confirmar.mock.calls[0][0]).toContain('1 informe, 2 resultados')
    await waitFor(() => expect(deshacerCarga).toHaveBeenCalledWith(12))
    expect(
      await screen.findByText('Carga deshecha: se borraron 1 informe y 2 resultados.'),
    ).toBeInTheDocument()
    expect(onCambio).toHaveBeenCalled()
  })

  it('si no se confirma, no deshace', async () => {
    listarCargas.mockResolvedValue({ disponible: true, cargas: [CARGA] })
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<HistorialCargas version={0} onCambio={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Deshacer' }))
    expect(deshacerCarga).not.toHaveBeenCalled()
  })

  it('una carga deshecha no ofrece deshacer de nuevo', async () => {
    listarCargas.mockResolvedValue({
      disponible: true,
      cargas: [
        {
          ...CARGA,
          deshecha_en: '2026-09-25T15:00:00Z',
          deshecha_por: 'Jorge Sandoval',
          solicitudes: 0,
        },
      ],
    })
    render(<HistorialCargas version={0} onCambio={() => {}} />)
    expect(await screen.findByText(/Deshecha/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Deshacer' })).not.toBeInTheDocument()
  })

  it('sin la migración lo dice, en vez de fallar', async () => {
    listarCargas.mockResolvedValue({ disponible: false, cargas: [] })
    render(<HistorialCargas version={0} onCambio={() => {}} />)
    expect(await screen.findByText(/migración/)).toBeInTheDocument()
  })

  it('vuelve a leer cuando cambia la versión', async () => {
    listarCargas.mockResolvedValue({ disponible: true, cargas: [] })
    const { rerender } = render(<HistorialCargas version={0} onCambio={() => {}} />)
    await waitFor(() => expect(listarCargas).toHaveBeenCalledTimes(1))
    rerender(<HistorialCargas version={1} onCambio={() => {}} />)
    await waitFor(() => expect(listarCargas).toHaveBeenCalledTimes(2))
  })

  it('una carga que ya no dejó nada en la base no ofrece deshacer', async () => {
    listarCargas.mockResolvedValue({
      disponible: true,
      cargas: [{ ...CARGA, solicitudes: 0, resultados: 0, pendientes: 0 }],
    })
    render(<HistorialCargas version={0} onCambio={() => {}} />)
    expect(await screen.findByText('Nada de esta carga quedó en la base')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Deshacer' })).not.toBeInTheDocument()
  })
})
