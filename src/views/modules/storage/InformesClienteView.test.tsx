import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const listarInformesCliente = vi.fn()
vi.mock('@/features/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/storage')>()),
  listarInformesCliente: (r?: string) => listarInformesCliente(r),
  descargarInformeCliente: vi.fn(),
  verInformeCliente: vi.fn(),
}))

import { InformesClienteView } from './InformesClienteView'

const carpeta = (nombre: string, ruta: string) => ({ nombre, ruta, tipo: 'carpeta', tamano_bytes: null, modificado: '' })
const archivo = (nombre: string, ruta: string) => ({ nombre, ruta, tipo: 'archivo', tamano_bytes: 10, modificado: '' })

describe('InformesClienteView', () => {
  beforeEach(() => {
    listarInformesCliente.mockReset()
    listarInformesCliente.mockImplementation((ruta?: string) =>
      Promise.resolve({
        ruta: ruta ?? '',
        entradas: !ruta
          ? [carpeta('DOLE CODEGUA', 'DOLE CODEGUA')]
          : ruta === 'DOLE CODEGUA'
            ? [carpeta('2026-10-13', 'DOLE CODEGUA/2026-10-13')]
            : [archivo('informe-1.pdf', 'DOLE CODEGUA/2026-10-13/informe-1.pdf')],
      }),
    )
  })

  it('entra solo a la carpeta de su Ship To y muestra las fechas en formato chileno', async () => {
    render(<InformesClienteView />)
    expect(await screen.findByText(/13-10-2026/)).toBeTruthy()
    expect(listarInformesCliente).toHaveBeenCalledWith('DOLE CODEGUA')
  })

  it('al abrir la fecha muestra el PDF con Ver y Descargar', async () => {
    render(<InformesClienteView />)
    fireEvent.click(await screen.findByRole('button', { name: /13-10-2026/ }))
    await waitFor(() => expect(screen.getByText('informe-1.pdf')).toBeTruthy())
    expect(screen.getByRole('button', { name: 'Ver' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Descargar' })).toBeTruthy()
  })
})
