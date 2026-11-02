import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AvisoPresentacion } from './AvisoPresentacion'

const mocks = vi.hoisted(() => ({
  user: { tipoAcceso: 'admin_general' } as { tipoAcceso: string } | null,
  estado: { datos: { activa: true } as { activa: boolean } | null },
  angosta: true,
}))

vi.mock('@/features/auth', () => ({ useAuth: () => ({ user: mocks.user }) }))
vi.mock('@/features/presentacion', () => ({ useEstadoPresentacion: () => mocks.estado }))

const montar = () => render(<MemoryRouter><AvisoPresentacion /></MemoryRouter>)

describe('AvisoPresentacion (el aviso en el teléfono)', () => {
  beforeEach(() => {
    mocks.user = { tipoAcceso: 'admin_general' }
    mocks.estado = { datos: { activa: true } }
    mocks.angosta = true
    window.matchMedia = ((q: string) => ({
      matches: mocks.angosta, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia
  })
  afterEach(cleanup)

  it('con la presentación abierta, en pantalla angosta, ofrece manejarla', () => {
    montar()
    const enlace = screen.getByRole('link', { name: /Presentación abierta/ })
    expect(enlace.getAttribute('href')).toBe('/presentacion/control')
  })

  it('si la presentación no está abierta no avisa nada', () => {
    mocks.estado = { datos: { activa: false } }
    montar()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('en el computador (pantalla ancha) no molesta', () => {
    mocks.angosta = false
    montar()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('solo para el administrador general', () => {
    mocks.user = { tipoAcceso: 'analista' }
    montar()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('se puede callar por un rato', () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: /Ocultar este aviso/ }))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('el silencio dura 10 minutos y después el aviso vuelve', () => {
    vi.useFakeTimers()
    try {
      montar()
      fireEvent.click(screen.getByRole('button', { name: /Ocultar este aviso/ }))
      expect(screen.queryByRole('status')).toBeNull()
      act(() => { vi.advanceTimersByTime(10 * 60 * 1000 + 100) })
      expect(screen.getByRole('status')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })
})
