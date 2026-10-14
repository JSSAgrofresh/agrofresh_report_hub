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

  it('cada cliente tiene una fila por análisis: Residuales con AgroFresh y Quiteca en columnas (cantidad y %), FSMA y FITO', () => {
    render(<AnalisisPorCliente solicitudes={lista} />)
    const filas = screen.getAllByRole('row').slice(2)
    // DOLE: Residuales, FSMA, FITO
    expect(within(filas[0]).getByText('DOLE CHILE S.A.')).toBeTruthy()
    expect(within(filas[0]).getByText('Residuales')).toBeTruthy()
    expect(within(filas[0]).getAllByText('50%')).toHaveLength(2)
    expect(within(filas[1]).getByText('FSMA')).toBeTruthy()
    expect(within(filas[2]).getByText('FITO')).toBeTruthy()
    expect(screen.getByText('MULTIFRUTA')).toBeTruthy()
    // sin plan cargado, las columnas de entregables no aparecen
    expect(screen.queryByText('Entregables')).toBeNull()
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

  it('con solo Residuales visibles: sin filas de FSMA ni FITO, el total cuenta solo lo visible y salen del ranking los que no tienen residuales', () => {
    const conFsma = [...lista, sol('ALS', 'SOLO FSMA'), sol('ALS', 'SOLO FSMA'), sol('ALS', 'SOLO FSMA')]
    render(<AnalisisPorCliente solicitudes={conFsma} analisis={['residuales']} />)
    expect(screen.queryByText('FSMA')).toBeNull()
    expect(screen.queryByText('FITO')).toBeNull()
    expect(screen.queryByText('SOLO FSMA')).toBeNull() // su único análisis está oculto
    expect(screen.getByText('2 análisis')).toBeTruthy() // DOLE: 2 residuales (antes 4)
    expect(screen.getByText('1 análisis')).toBeTruthy() // MULTIFRUTA
  })

  it('los clientes sin ningún análisis del listado no cambian por ocultar un análisis', async () => {
    render(<AnalisisPorCliente solicitudes={lista} analisis={['residuales']} />)
    expect(await screen.findByRole('button', { name: /Mostrar los 2 clientes sin análisis/ })).toBeTruthy()
  })

  describe('Entregables (plan de los comerciales)', () => {
    const plan = new Map([['DOLE CHILE SA', { sold_to: 'DOLE CHILE S.A.', residuales: 8, fsma: 0, fito: 0, plantas: [{ planta: 'DOLE LONTUE', servicio: 'residuales' as const, cantidad: 8 }] }]])

    it('por Sold To: Cant. es lo prometido y % es lo llevado ÷ lo prometido (solo en la fila que el plan trae)', () => {
      render(<AnalisisPorCliente solicitudes={lista} plan={plan} />)
      expect(screen.getByText('Entregables')).toBeTruthy()
      const dole = screen.getAllByRole('row').slice(2)[0]
      // DOLE lleva 2 residuales (AgroFresh 1 + Quiteca 1) de 8 prometidos = 25%
      expect(within(dole).getByTitle('Análisis prometidos en la temporada (plan de entregables)').textContent).toBe('8')
      expect(within(dole).getByText('25%', { selector: 'td' })).toBeTruthy()
      // FSMA no está en el plan: queda en guion
      const fsma = screen.getAllByRole('row').slice(2)[1]
      expect(within(fsma).getAllByText('—').length).toBe(2)
    })

    it('muestra las plantas del plan al abrir el detalle', () => {
      render(<AnalisisPorCliente solicitudes={lista} plan={plan} />)
      expect(screen.queryByText(/DOLE LONTUE/)).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: /Ver las 1 del plan/ }))
      expect(screen.getByText(/DOLE LONTUE/)).toBeTruthy()
    })

    it('por Ship To, especie o tipo el cálculo se esconde', () => {
      render(<AnalisisPorCliente solicitudes={lista} plan={plan} dimension="planta" />)
      expect(screen.queryByText('Entregables')).toBeNull()
    })
  })
})
