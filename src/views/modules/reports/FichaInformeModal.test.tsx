import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FichaInforme } from '@/features/reportes'
import { DetalleObservacionesModal } from './DetalleObservacionesModal'

const ficha: FichaInforme = {
  solicitud: { id: 7, nro_solicitud: 'AGF0001', laboratorio: 'Agrofresh', especie: 'Manzana', tipo_servicio: 'Actimist', fecha_muestreo: '2026-09-24', cliente: 'Dole', planta: 'Lontué' },
  resultados: [
    { codigo: 'FLUD', nombre: 'Fludioxonil', categoria: 'F', unidad: 'ppm', valor_num: 4, valor_texto: null, producto: 'Actimist', dosis: 2, gasto: null, tipo_aplicacion: null, linea_proceso: null },
    { codigo: 'TEBU', nombre: 'Tebuconazol', categoria: 'F', unidad: 'ppm', valor_num: null, valor_texto: 'ND', producto: null, dosis: null, gasto: null, tipo_aplicacion: null, linea_proceso: null },
  ],
  carga: null,
  toma: null,
  pdf: { disponible: false },
}

vi.mock('@/features/reportes', async (orig) => ({
  ...(await orig<typeof import('@/features/reportes')>()),
  obtenerFichaInforme: vi.fn(() => Promise.resolve(ficha)),
  descargarPdfInforme: vi.fn(),
}))

const obs = (id: number) => ({ solicitudId: id, nroSolicitud: 'AGF0001', ingrediente: 'FLUD', ppm: 4, valorTexto: null, fecha: '2026-09-24' }) as never

describe('DetalleObservacionesModal con ficha', () => {
  beforeEach(() => vi.clearAllMocks())

  it('muestra resultados con estado y avisa que no hay PDF', async () => {
    const analitos = [{ id: 1, codigo: 'FLUD', laboratorio: 'Agrofresh' }] as never
    const limites = [{ id: 1, analito_id: 1, especie: '', tipo_servicio: '', limite_min: null, limite_central: null, limite_max: 3 }] as never
    render(<DetalleObservacionesModal titulo="AGF0001 · 24-09" filas={[obs(7)]} onCerrar={() => {}} fichaCompleta={{ analitos, limites }} />)
    await waitFor(() => expect(screen.getByText('Fludioxonil')).toBeTruthy())
    expect(screen.getAllByText('Sobre el límite').length).toBeGreaterThan(0)
    expect(screen.getByText('Sin valor numérico')).toBeTruthy()
    expect(screen.getByText(/aún no tiene un PDF/)).toBeTruthy()
    expect(screen.queryByText('Ver informe')).toBeNull()
  })

  it('con varias solicitudes o sin permiso usa la tabla simple', () => {
    const { unmount } = render(<DetalleObservacionesModal titulo="x" filas={[obs(7), obs(8)]} onCerrar={() => {}} fichaCompleta={{ analitos: [], limites: [] }} />)
    expect(screen.getByText('N° informe')).toBeTruthy()
    unmount()
    render(<DetalleObservacionesModal titulo="x" filas={[obs(7)]} onCerrar={() => {}} />)
    expect(screen.getByText('N° informe')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Cerrar'))
  })
})
