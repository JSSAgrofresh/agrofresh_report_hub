import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const listarInformesCliente = vi.fn()
vi.mock('@/features/storage/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/storage/lib/api')>()),
  listarInformesCliente: (r?: string) => listarInformesCliente(r),
  descargarInformeCliente: vi.fn(),
  abrirInformeCliente: vi.fn(),
  verInformeCliente: vi.fn(),
}))

import { InformesClienteView } from './InformesClienteView'

const carpeta = (nombre: string, ruta: string) => ({ nombre, ruta, tipo: 'carpeta', tamano_bytes: null, modificado: '2026-10-13T10:00:00' })
const archivo = (nombre: string, ruta: string) => ({ nombre, ruta, tipo: 'archivo', tamano_bytes: 10, modificado: '2026-10-13T10:00:00' })

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
    expect((await screen.findAllByText(/13-10-2026/)).length).toBeGreaterThan(0)
    expect(listarInformesCliente).toHaveBeenCalledWith('DOLE CODEGUA')
  })

  it('es de solo lectura: sin subir, crear carpeta ni permisos', async () => {
    render(<InformesClienteView />)
    await screen.findAllByText(/13-10-2026/)
    expect(screen.queryByText(/Subir archivos/)).toBeNull()
    expect(screen.queryByText(/Nueva carpeta/)).toBeNull()
    expect(screen.queryByText(/Permisos/)).toBeNull()
  })

  it('al abrir la fecha muestra el PDF con su descarga', async () => {
    render(<InformesClienteView />)
    await screen.findAllByText(/13-10-2026/)
    fireEvent.click(screen.getAllByRole('button', { name: /13-10-2026/ })[0])
    await waitFor(() => expect(screen.getAllByText('informe-1.pdf').length).toBeGreaterThan(0))
  })
})
