import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PorHacer } from './PorHacer'
import { bandeja, INFORME_OK, INFORME_ROJO } from './fixturesIngreso'

const { listarBandeja, aceptarInforme, aceptarVarios, marcarInformado, rechazarInforme } = vi.hoisted(() => ({
  listarBandeja: vi.fn(),
  aceptarInforme: vi.fn(),
  aceptarVarios: vi.fn(),
  marcarInformado: vi.fn(),
  rechazarInforme: vi.fn(),
}))

vi.mock('@/features/correoInformes', async () => {
  const real = await vi.importActual<typeof import('@/features/correoInformes')>('@/features/correoInformes')
  return { ...real, listarBandeja, aceptarInforme, aceptarVarios, marcarInformado, rechazarInforme }
})

const LISTO = { ...INFORME_OK, id: 31, decision: 'pendiente' as const, es_ultima_copia: true, estado: 'ok' as const, ya_cargado: false }
const LISTO2 = { ...LISTO, id: 32, nro_informe: '2026-2000-PC' }
const MAL = { ...INFORME_ROJO, id: 33, decision: 'pendiente' as const, es_ultima_copia: true, informado: false, resuelto_en: null }

afterEach(() => vi.clearAllMocks())

describe('PorHacer', () => {
  it('agrupa lo pendiente y acepta de una vez todos los listos', async () => {
    listarBandeja.mockResolvedValue(bandeja([LISTO, LISTO2, MAL]))
    aceptarVarios.mockResolvedValue({ aceptados: [{ id: 31, resultado: 'cargado', carga_id: 1, envio_al_cliente: 'marcado', avisos: [] }], errores: [] })
    render(<PorHacer version={0} onCambio={() => {}} onVerDetalle={() => {}} />)
    expect(await screen.findByText('Listos para aceptar')).toBeInTheDocument()
    expect(screen.getByText('Salió mal: hay que avisar al laboratorio')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Aceptar todos \(2\)/ }))
    await waitFor(() => expect(aceptarVarios).toHaveBeenCalledWith([31, 32]))
  })

  it('desmarcar un listo lo deja fuera del lote', async () => {
    listarBandeja.mockResolvedValue(bandeja([LISTO, LISTO2]))
    aceptarVarios.mockResolvedValue({ aceptados: [], errores: [] })
    render(<PorHacer version={0} onCambio={() => {}} onVerDetalle={() => {}} />)
    fireEvent.click(await screen.findByLabelText(`Elegir ${LISTO.nro_informe}`))
    fireEvent.click(screen.getByRole('button', { name: /Aceptar los elegidos \(1\)/ }))
    await waitFor(() => expect(aceptarVarios).toHaveBeenCalledWith([32]))
  })

  it('«Ya informé» se anota en la misma fila, sin abrir el detalle', async () => {
    listarBandeja.mockResolvedValue(bandeja([MAL]))
    marcarInformado.mockResolvedValue({ ok: true })
    render(<PorHacer version={0} onCambio={() => {}} onVerDetalle={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ya informé' }))
    fireEvent.change(screen.getByLabelText(/A quién se avisó/), { target: { value: 'Avisé a Quiteca' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(marcarInformado).toHaveBeenCalledWith(33, 'Avisé a Quiteca'))
  })

  it('un informe que no se pudo aceptar muestra su motivo en la fila', async () => {
    listarBandeja.mockResolvedValue(bandeja([LISTO]))
    aceptarInforme.mockRejectedValue(new Error('No calza con Listados'))
    render(<PorHacer version={0} onCambio={() => {}} onVerDetalle={() => {}} />)
    fireEvent.click((await screen.findAllByRole('button', { name: 'Aceptar' }))[0])
    expect(await screen.findByText('No calza con Listados')).toBeInTheDocument()
  })
})
