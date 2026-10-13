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

  it('cada cliente hacia abajo (el que más lleva primero) con residuales, FSMA, FITO y total', () => {
    render(<AnalisisPorCliente solicitudes={lista} />)
    const filas = screen.getAllByRole('row').slice(1)
    expect(within(filas[0]).getByText('DOLE CHILE S.A.')).toBeTruthy()
    expect(within(filas[0]).getByText('4')).toBeTruthy() // total
    expect(within(filas[1]).getByText('MULTIFRUTA')).toBeTruthy()
    expect(screen.getByText('Entregables')).toBeTruthy()
  })

  it('los clientes del listado sin ningún análisis salen apagados al final, solo si se piden', async () => {
    render(<AnalisisPorCliente solicitudes={lista} />)
    const boton = await screen.findByRole('button', { name: /Mostrar los 2 clientes sin análisis/ })
    expect(screen.queryByText('Alfa Ltda')).toBeNull()
    fireEvent.click(boton)
    await waitFor(() => expect(screen.getByText('Alfa Ltda')).toBeTruthy())
    const filas = screen.getAllByRole('row')
    expect(filas[filas.length - 1].className).toMatch(/apagado/)
    expect(screen.queryByText('Inactivo SA')).toBeNull()
  })
})
