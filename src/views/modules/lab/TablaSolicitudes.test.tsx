import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Solicitud } from '@/features/emitir'

const descargarPdfsZip = vi.fn().mockResolvedValue(undefined)
vi.mock('@/features/tomaMuestras', () => ({ descargarPdfsZip: (a: string[]) => descargarPdfsZip(a) }))

import { TablaSolicitudes } from './TablaSolicitudes'

function sol(n: number, codigo: string | null): Solicitud {
  return { archivo: `OT-AGF${n}.xlsx`, campos: { 'N° Solicitud': `OT-AGF${n}` }, analitos_solicitados: [], codigo_muestra: codigo }
}

const props = { onVerFicha: vi.fn(), onQuitarCruce: vi.fn() }

describe('TablaSolicitudes · Descargar PDFs', () => {
  beforeEach(() => descargarPdfsZip.mockClear())

  it('pregunta y baja todas, con o sin muestra', async () => {
    render(<TablaSolicitudes solicitudes={[sol(1, 'M1'), sol(2, null), sol(3, null)]} {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Descargar PDFs' }))
    expect(screen.getByText('¿Cuáles quieres descargar?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Todas/ }))
    await waitFor(() => expect(descargarPdfsZip).toHaveBeenCalledTimes(1))
    expect(descargarPdfsZip).toHaveBeenCalledWith(['OT-AGF1.xlsx', 'OT-AGF2.xlsx', 'OT-AGF3.xlsx'])
  })

  it('baja solo las que no están cruzadas', async () => {
    render(<TablaSolicitudes solicitudes={[sol(1, 'M1'), sol(2, null), sol(3, null)]} {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Descargar PDFs' }))
    fireEvent.click(screen.getByRole('button', { name: /Solo las que no están cruzadas/ }))
    await waitFor(() => expect(descargarPdfsZip).toHaveBeenCalledTimes(1))
    expect(descargarPdfsZip).toHaveBeenCalledWith(['OT-AGF2.xlsx', 'OT-AGF3.xlsx'])
  })

  it('con más de 200 baja en varios .zip', async () => {
    const muchas = Array.from({ length: 450 }, (_, i) => sol(i, null))
    render(<TablaSolicitudes solicitudes={muchas} {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Descargar PDFs' }))
    fireEvent.click(screen.getByRole('button', { name: /Todas/ }))
    await waitFor(() => expect(descargarPdfsZip).toHaveBeenCalledTimes(3))
    expect(descargarPdfsZip.mock.calls.map((c) => c[0].length)).toEqual([200, 200, 50])
  }, 30000)

  it('la opción «no cruzadas» se desactiva si todas ya tienen muestra', () => {
    render(<TablaSolicitudes solicitudes={[sol(1, 'M1')]} {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Descargar PDFs' }))
    expect(screen.getByRole('button', { name: /Solo las que no están cruzadas/ })).toBeDisabled()
  })
})
