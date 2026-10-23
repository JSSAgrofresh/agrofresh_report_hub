import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RespuestaRendimiento } from '@/features/rendimientoCalidad'

const { leer } = vi.hoisted(() => ({ leer: vi.fn() }))
vi.mock('@/features/rendimientoCalidad', async (original) => ({
  ...(await original<typeof import('@/features/rendimientoCalidad')>()),
  leerRendimientoCalidad: leer,
}))

import { RendimientoCalidadView } from './RendimientoCalidadView'

const fila = (o: object) => ({ sold_to: 'DOLE CHILE S.A.', ship_to: 'DOLE PLANTA CODEGUA', semana: '2026-10-26', bloque: 'residuales', servicio: 'linea', cumple: 0, no_cumple: 0, ...o })

const RESPUESTA = {
  filas: [
    fila({ servicio: 'linea', cumple: 7, no_cumple: 2 }),
    fila({ servicio: 'actimist', cumple: 3, no_cumple: 3 }),
    fila({ bloque: 'fsma', cumple: 8 }),
    fila({ bloque: 'fito', cumple: 4, no_cumple: 2 }),
    fila({ sold_to: 'MULTIFRUTA SA', ship_to: 'GESEX PLANTA FATIMA', semana: '2026-10-19', cumple: 1, no_cumple: 3 }),
  ],
  sin_criterio: { residuales: 2, fsma: 0, fito: 0 },
  fuera: { sin_fecha: 0, ecofog: 1, otro_laboratorio: 0 },
  moderado_cumple: false,
} as RespuestaRendimiento

describe('RendimientoCalidadView', () => {
  beforeEach(() => leer.mockReset().mockResolvedValue(RESPUESTA))

  it('una fila por planta, la que más no cumple primero, con el total de residuales sumando los dos servicios', async () => {
    render(<RendimientoCalidadView />)
    const filas = await screen.findAllByRole('row')
    const planta = filas.filter((r) => within(r).queryByText(/PLANTA/))
    expect(planta.map((r) => within(r).getByText(/PLANTA/).textContent)).toEqual(['GESEX PLANTA FATIMA', 'DOLE PLANTA CODEGUA'])
    // DOLE CODEGUA: 15 informes de residuales, 10 cumplen, 5 no, 33 % no cumple
    const dole = within(planta[1])
    expect(dole.getByText('15')).toBeTruthy()
    expect(dole.getAllByText('33%').length).toBeGreaterThan(0)
  })

  it('el buscador encuentra por Sold To', async () => {
    render(<RendimientoCalidadView />)
    await screen.findByText('GESEX PLANTA FATIMA')
    fireEvent.change(screen.getByLabelText('Buscar Sold To o Ship To'), { target: { value: 'dole' } })
    expect(screen.queryByText('GESEX PLANTA FATIMA')).toBeNull()
    expect(screen.getByText('DOLE PLANTA CODEGUA')).toBeTruthy()
  })

  it('«Solo con riesgo» deja las plantas desde 40 % de no cumple', async () => {
    render(<RendimientoCalidadView />)
    await screen.findByText('GESEX PLANTA FATIMA')
    fireEvent.click(screen.getByLabelText('Solo con riesgo'))
    expect(screen.getByText('GESEX PLANTA FATIMA')).toBeTruthy()          // 75 % no cumple
    expect(screen.queryByText('DOLE PLANTA CODEGUA')).toBeNull()           // 22 % no cumple
  })

  it('«Por semana» muestra las semanas de un cliente y planta', async () => {
    render(<RendimientoCalidadView />)
    await screen.findByText('GESEX PLANTA FATIMA')
    fireEvent.click(screen.getByRole('button', { name: 'Por semana' }))
    fireEvent.change(screen.getByLabelText('Cliente'), { target: { value: 'MULTIFRUTA SA' } })
    await waitFor(() => expect(screen.getByText('Sem 43')).toBeTruthy())
    expect(screen.queryByText('Sem 44')).toBeNull()
    expect(screen.getByText('Total del período')).toBeTruthy()
  })

  it('avisa lo que no se pudo juzgar', async () => {
    render(<RendimientoCalidadView />)
    await screen.findByText('GESEX PLANTA FATIMA')
    expect(screen.getByText(/2 informes sin criterio/)).toBeTruthy()
    expect(screen.getByText(/1 de Ecofog/)).toBeTruthy()
  })

  it('si el servidor falla, lo dice', async () => {
    leer.mockRejectedValueOnce(new Error('boom'))
    render(<RendimientoCalidadView />)
    expect((await screen.findByRole('alert')).textContent).toBe('boom')
  })
})
