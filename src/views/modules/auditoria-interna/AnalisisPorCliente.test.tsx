import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { SolicitudAuditoria } from '@/features/auditoriaInterna'

vi.mock('@/features/catalogo', () => ({
  listarClientes: () => Promise.resolve([
    { id: 1, nombre: 'DOLE CHILE S.A.', activo: true },
    { id: 2, nombre: 'Zeta Frutas', activo: true },
    { id: 3, nombre: 'Alfa Ltda', activo: true },
    { id: 4, nombre: 'Inactivo SA', activo: false },
  ]),
}))

import { AnalisisPorCliente } from './AnalisisPorCliente'

const sol = (lab: string, cliente: string, concretada = false) =>
  ({ archivo: Math.random().toString(), numero_solicitud: 'OT', laboratorio: lab, sold_to: cliente, ship_to: null, especie: null, variedad: null, tipo_servicio: null, analitos: [], fecha_solicitud: null, fecha_muestreo: null, emitida_en: null, informe: null, en_report: concretada, concretada }) as SolicitudAuditoria

describe('AnalisisPorCliente', () => {
  const lista = [
    sol('AGROFRESH', 'DOLE CHILE S.A.', true), sol('QUITECA', 'DOLE CHILE S.A.'), sol('ALS', 'DOLE CHILE S.A.'), sol('DIAGNOFRUIT', 'DOLE CHILE S.A.'),
    sol('QUITECA', 'MULTIFRUTA'),
  ]

  it('cada cliente es un bloque de filas: Residuales con su desglose por laboratorio y su %, FSMA y FITO', () => {
    render(<AnalisisPorCliente solicitudes={lista} />)
    const filas = screen.getAllByRole('row').slice(2)
    // DOLE: Residuales, AgroFresh, Quiteca, FSMA, FITO
    expect(within(filas[0]).getByText('DOLE CHILE S.A.')).toBeTruthy()
    expect(within(filas[0]).getByText('Residuales')).toBeTruthy()
    expect(within(filas[0]).getByText('2')).toBeTruthy()
    expect(within(filas[1]).getByText('AgroFresh')).toBeTruthy()
    expect(within(filas[1]).getByText('50%')).toBeTruthy()
    expect(within(filas[2]).getByText('Quiteca')).toBeTruthy()
    expect(within(filas[2]).getByText('50%')).toBeTruthy()
    expect(within(filas[3]).getByText('FSMA')).toBeTruthy()
    expect(within(filas[4]).getByText('FITO')).toBeTruthy()
    expect(screen.getByText('MULTIFRUTA')).toBeTruthy()
    expect(screen.getByText('Entregables')).toBeTruthy()
  })

  it('los clientes del listado sin ningún análisis salen apagados al final, solo si se piden', async () => {
    render(<AnalisisPorCliente solicitudes={lista} />)
    const boton = await screen.findByRole('button', { name: /Mostrar los 2 clientes sin análisis/ })
    expect(screen.queryByText('Alfa Ltda')).toBeNull()
    fireEvent.click(boton)
    await waitFor(() => expect(screen.getByText('Alfa Ltda')).toBeTruthy())
    const apagadas = screen.getAllByRole('row').filter((r) => /apagado/.test(r.className))
    expect(apagadas).toHaveLength(2)
    expect(screen.queryByText('Inactivo SA')).toBeNull()
  })
})
