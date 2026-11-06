import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IntegridadPanel } from './IntegridadPanel'

const api = vi.hoisted(() => ({
  estadoIntegridad: vi.fn(),
  analizarIntegridad: vi.fn(),
  hallazgosIntegridad: vi.fn(),
  descargarPdfIntegridad: vi.fn(),
  descargarExcelIntegridad: vi.fn(),
}))
vi.mock('@/features/integridad', async (original) => ({ ...(await original<object>()), ...api }))

const lab = (laboratorio: string, altos: number) => ({
  laboratorio, enviadas: 10, sin_enviar: 0, con_informe: 8, sin_informe: 2, atrasadas: 1, informes_revisados: 8,
  informes_con_problema: 3, solicitudes_con_problema: 3, altos, medios: 2, por_codigo: {},
})
const resumen = { hoy: '2026-11-06', solicitudes_enviadas: 20, con_informe: 16, sin_informe: 4, atrasadas: 2, informes_revisados: 16, informes_con_problema: 5, informes_limpios: 11, hallazgos_altos: 7, hallazgos_medios: 3, pdf_revisado: true }
const ultimo = { id: 1, iniciado_en: '2026-11-06T03:00:00Z', terminado_en: '2026-11-06T03:05:00Z', origen: 'nocturno', usuario: null, con_pdf: true, estado: 'listo', avance: 'Listo', resumen, laboratorios: [lab('Quiteca', 4), lab('ALS', 1)] }
const hallazgo = { codigo: 'ANALITO_FALTA', titulo: 'Analito pedido que el informe no trae', gravedad: 'alto', detalle: 'Se pidió y el informe no trae: PYR.', sugerencia: 'Reclamar', laboratorio: 'Quiteca', ot: 'OT-QUI0053', informe: '2026-1914-PC', sold_to: 'AGROVIC', ship_to: 'PLANTA 1', especie: 'Cereza', fecha_muestreo: '2026-10-20', enviada_en: '2026-10-21' }

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset())
  api.estadoIntegridad.mockResolvedValue({ disponible: true, en_curso: null, ultimo })
  api.hallazgosIntegridad.mockResolvedValue({ analisis_id: 1, total: 1, tipos: [{ codigo: 'ANALITO_FALTA', titulo: hallazgo.titulo, gravedad: 'alto', casos: 1 }], hallazgos: [hallazgo] })
})

describe('IntegridadPanel', () => {
  it('muestra el resumen, los laboratorios (el de más errores graves primero) y los errores', async () => {
    render(<IntegridadPanel />)
    expect(await screen.findByText('OT-QUI0053')).toBeInTheDocument()
    const filas = screen.getAllByRole('row')
    expect(filas[1]).toHaveTextContent('Quiteca')
    expect(filas[2]).toHaveTextContent('ALS')
    expect(screen.getByText(/Los de ALS aún no/)).toBeInTheDocument()
  })

  it('«Ver errores» filtra por ese laboratorio y el PDF se pide con su nombre', async () => {
    render(<IntegridadPanel />)
    await screen.findByText('OT-QUI0053')
    const fila = screen.getAllByRole('row')[2]
    fireEvent.click(fila.querySelectorAll('button')[0])
    await waitFor(() => expect(api.hallazgosIntegridad).toHaveBeenLastCalledWith(expect.objectContaining({ laboratorio: 'ALS' })))
    fireEvent.click(fila.querySelectorAll('button')[1])
    expect(api.descargarPdfIntegridad).toHaveBeenCalledWith('ALS')
  })

  it('«Analizar ahora» manda si se releen los PDF', async () => {
    api.analizarIntegridad.mockResolvedValue({ id: 2, en_curso: true, ya_estaba_en_curso: false })
    render(<IntegridadPanel />)
    await screen.findByText('OT-QUI0053')
    fireEvent.click(screen.getByLabelText(/Releer los PDF/))
    fireEvent.click(screen.getByRole('button', { name: 'Analizar ahora' }))
    expect(api.analizarIntegridad).toHaveBeenCalledWith(false, false)
  })

  it('avisa si falta la migración', async () => {
    api.estadoIntegridad.mockResolvedValue({ disponible: false, en_curso: null, ultimo: null })
    render(<IntegridadPanel />)
    expect(await screen.findByText(/migración 0075/)).toBeInTheDocument()
  })
})
