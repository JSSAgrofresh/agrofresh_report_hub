import { render, screen, within, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RespuestaDetalle } from '@/features/rendimientoCalidad'

const { leer } = vi.hoisted(() => ({ leer: vi.fn() }))
vi.mock('@/features/rendimientoCalidad', async (original) => ({
  ...(await original<typeof import('@/features/rendimientoCalidad')>()),
  leerDetallePlanta: leer,
}))

import { DetallePlantaModal } from './DetallePlantaModal'

const base = { ot: 'OT-QUI0001', laboratorio: 'Quiteca', variedad: 'Fuji', fecha: '2026-10-28', semana: '2026-10-26' }
const RESPUESTA = {
  informes: [
    {
      ...base, id: 1, informe: '2026-1900-PC', bloque: 'residuales', servicio: 'linea', especie: 'Manzana', cumple: false,
      analitos: [
        { codigo: 'FDL', nombre: 'Fludioxonil', unidad: 'ppm', valor: 3.4, signo: '', min: 0.7, max: 3, estado: 'sobre', desvio: 0.4 },
        { codigo: 'PYR', nombre: 'Pirimetanil', unidad: 'ppm', valor: 0.6, signo: '', min: 1, max: 4, estado: 'bajo', desvio: -0.4 },
        { codigo: 'TBZ', nombre: 'Tiabendazol', unidad: 'ppm', valor: 2, signo: '', min: 1, max: 4, estado: 'dentro', desvio: 0 },
        { codigo: 'DPA', nombre: 'Difenilamina', unidad: 'ppm', valor: 5, signo: '', min: null, max: null, estado: 'sin_limite', desvio: 0 },
      ],
    },
    {
      ...base, id: 2, informe: 'AGF2026-9', laboratorio: 'Agrofresh', bloque: 'residuales', servicio: 'actimist', especie: 'Pera', cumple: true,
      analitos: [{ codigo: 'FDL', nombre: 'Fludioxonil', unidad: 'ppm', valor: 3.4, signo: '', min: 0.7, max: 3.5, estado: 'dentro', desvio: 0 }],
    },
    {
      ...base, id: 3, informe: '253522-DIAG1', laboratorio: 'Diagnofruit', bloque: 'fito', servicio: 'linea', especie: 'Cerezas', cumple: false,
      analitos: [{ codigo: 'BOT', nombre: 'Botrytis', unidad: 'conidia/mL', valor: 250, signo: '', optimo_hasta: 20, peligroso_desde: 200, nivel: 'peligroso' }],
    },
    {
      ...base, id: 4, informe: 'ALS-1', laboratorio: 'ALS (Corthon)', bloque: 'fsma', servicio: 'linea', especie: 'Manzana', cumple: true,
      analitos: [{ codigo: 'ECOLI', nombre: 'Escherichia coli', unidad: 'UFC/100 mL', valor: '<1', detecto: false }],
    },
  ],
} as unknown as RespuestaDetalle

const abrir = () => render(<DetallePlantaModal soldTo="DOLE CHILE S.A." shipTo="DOLE PLANTA CODEGUA" desde="2026-10-05" hasta="2026-11-01" onCerrar={() => undefined} />)

describe('DetallePlantaModal', () => {
  beforeEach(() => leer.mockReset().mockResolvedValue(RESPUESTA))

  it('pide el detalle de la planta y el período de la fila', async () => {
    abrir()
    await screen.findByText('2026-1900-PC')
    expect(leer).toHaveBeenCalledWith('DOLE CHILE S.A.', 'DOLE PLANTA CODEGUA', '2026-10-05', '2026-11-01')
  })

  it('muestra especie, servicio, límite y la variación: sobre en rojo (▲) y bajo (▼)', async () => {
    abrir()
    const mala = (await screen.findByText('2026-1900-PC')).closest('article') as HTMLElement
    const t = within(mala)
    expect(t.getByText('Manzana · Fuji')).toBeTruthy()
    expect(t.getByText('Línea de proceso')).toBeTruthy()
    expect(t.getByText('No cumple')).toBeTruthy()
    expect(t.getByText('0,7 – 3 ppm')).toBeTruthy()
    expect(t.getByText('▲ +0,4 ppm').className).toMatch(/arriba/)
    expect(t.getByText('▼ −0,4 ppm').className).toMatch(/abajo/)
    expect(t.getByText('Dentro del límite')).toBeTruthy()
    expect(t.getByText('Sin límite para esta especie')).toBeTruthy()
  })

  it('cada servicio se juzga con su límite (Actimist 3,5)', async () => {
    abrir()
    await screen.findByText('2026-1900-PC')
    const act = (screen.getByText('AGF2026-9').closest('article')) as HTMLElement
    expect(within(act).getByText('Actimist')).toBeTruthy()
    expect(within(act).getByText('0,7 – 3,5 ppm')).toBeTruthy()
    expect(within(act).getByText('Cumple')).toBeTruthy()
  })

  it('abre en el análisis que no cumple y deja cambiar de pestaña', async () => {
    abrir()
    await screen.findByText('2026-1900-PC')
    expect(screen.queryByText('253522-DIAG1')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: /FITO/ }))
    const fito = (await screen.findByText('253522-DIAG1')).closest('article') as HTMLElement
    expect(within(fito).getByText('Peligroso')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: /FSMA/ }))
    const fsma = (await screen.findByText('ALS-1')).closest('article') as HTMLElement
    expect(within(fsma).getByText('No detectado')).toBeTruthy()
  })

  it('sin informes lo dice', async () => {
    leer.mockResolvedValue({ informes: [] })
    abrir()
    expect(await screen.findByText('No hay informes de esta planta en el período.')).toBeTruthy()
  })

  it('si el servidor falla, lo dice', async () => {
    leer.mockRejectedValueOnce(new Error('boom'))
    abrir()
    expect((await screen.findByRole('alert')).textContent).toBe('boom')
  })
})
