import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Fortificado } from '@/features/emitir'

const listarFortificados = vi.fn()
const crearFortificado = vi.fn()
const corregirFortificado = vi.fn()
vi.mock('@/features/tomaMuestras', () => ({ descargarPdfsZip: vi.fn() }))
vi.mock('@/features/emitir', async (orig) => ({
  ...(await orig<typeof import('@/features/emitir')>()),
  listarFortificados: () => listarFortificados(),
  crearFortificado: (n: string, p: number) => crearFortificado(n, p),
  corregirFortificado: (i: number, n: string, p: number) => corregirFortificado(i, n, p),
}))

import { TablaSolicitudes } from './TablaSolicitudes'

const F1: Fortificado = { id: 1, numero: 'F-001', peso_extraido: 10.0086, fecha_ingreso: '2026-10-05', hora_ingreso: '09:13' }
const props = { solicitudes: [], onVerFicha: vi.fn(), onQuitarCruce: vi.fn(), onCruceEditado: vi.fn() }

async function abrirFortificados() {
  render(<TablaSolicitudes {...props} />)
  fireEvent.click(screen.getByRole('tab', { name: 'Ingreso fortificados' }))
  await screen.findByText('F-001', {}, { timeout: 2000 }).catch(() => undefined)
}

describe('Ingreso de fortificados', () => {
  beforeEach(() => {
    listarFortificados.mockReset().mockResolvedValue([F1])
    crearFortificado.mockReset().mockResolvedValue({ ...F1, id: 2, numero: 'F-002' })
    corregirFortificado.mockReset().mockResolvedValue(F1)
  })

  it('las pestañas son Ingreso estándar e Ingreso fortificados (ya no Todas / Con muestra / Sin muestra)', () => {
    render(<TablaSolicitudes {...props} />)
    expect(screen.getByRole('tab', { name: 'Ingreso estándar' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Ingreso fortificados' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Con muestra' })).toBeNull()
  })

  it('muestra N°, peso, fecha y hora de ingreso de lo ya ingresado', async () => {
    await abrirFortificados()
    expect(screen.getByDisplayValue('F-001')).toBeInTheDocument()
    expect(screen.getByDisplayValue('10.0086')).toBeInTheDocument()
    expect(screen.getByText('05-10-2026')).toBeInTheDocument()
    expect(screen.getByText('09:13')).toBeInTheDocument()
  })

  it('ingresa un fortificado con el peso tal cual se digita', async () => {
    await abrirFortificados()
    const boton = screen.getByRole('button', { name: 'Ingresar fortificado' })
    expect(boton).toBeDisabled()
    fireEvent.change(screen.getByLabelText('N° de fortificado nuevo'), { target: { value: 'F-002' } })
    fireEvent.change(screen.getByLabelText(/Peso extraído del fortificado nuevo/), { target: { value: '10.0051' } })
    fireEvent.click(boton)
    await waitFor(() => expect(crearFortificado).toHaveBeenCalledWith('F-002', 10.0051))
    await waitFor(() => expect(listarFortificados).toHaveBeenCalledTimes(2))
  })

  it('un peso en cero no se puede ingresar', async () => {
    await abrirFortificados()
    fireEvent.change(screen.getByLabelText('N° de fortificado nuevo'), { target: { value: 'F-009' } })
    fireEvent.change(screen.getByLabelText(/Peso extraído del fortificado nuevo/), { target: { value: '0' } })
    expect(screen.getByRole('button', { name: 'Ingresar fortificado' })).toBeDisabled()
  })

  it('corrige el peso de uno ya guardado; sin cambios no deja guardar', async () => {
    await abrirFortificados()
    const guardar = screen.getByRole('button', { name: 'Guardar fortificado F-001' })
    expect(guardar).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/Peso extraído del fortificado F-001/), { target: { value: '9.9' } })
    fireEvent.click(guardar)
    await waitFor(() => expect(corregirFortificado).toHaveBeenCalledWith(1, 'F-001', 9.9))
  })

  it('«Borrar» no aparece sin permiso', async () => {
    await abrirFortificados()
    expect(screen.queryByRole('button', { name: 'Borrar' })).toBeNull()
  })
})
