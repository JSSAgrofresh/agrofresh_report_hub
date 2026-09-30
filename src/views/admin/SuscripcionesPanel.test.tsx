import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SuscripcionesPanel } from './SuscripcionesPanel'
import type { SuscripcionUsuario, Suscripciones } from '@/features/notificaciones'

const api = vi.hoisted(() => ({
  adminSuscripciones: vi.fn(),
  adminGuardarSuscripcion: vi.fn(),
  adminRestablecerSuscripcion: vi.fn(),
}))

vi.mock('@/features/notificaciones', () => ({ notificacionesApi: api }))

const PAZ: SuscripcionUsuario = {
  usuario_id: 7,
  nombre: 'Paz Salazar',
  email: 'paz@agrofresh.cl',
  tipoAcceso: 'analista',
  area: 'cromatografia',
  tipos: ['solicitud', 'verificacion'],
  personalizado: false,
}

const DATOS: Suscripciones = {
  tipos: [
    { id: 'solicitud', nombre: 'Nueva solicitud de análisis', descripcion: 'd' },
    { id: 'verificacion', nombre: 'Verificaciones diarias', descripcion: 'd' },
    { id: 'anuncio', nombre: 'Avisos del sistema', descripcion: 'd' },
  ],
  usuarios: [PAZ],
}

describe('SuscripcionesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.adminSuscripciones.mockResolvedValue(DATOS)
  })

  it('desmarcar un tipo guarda los demás, sin ese', async () => {
    api.adminGuardarSuscripcion.mockResolvedValue({ ...PAZ, tipos: ['solicitud'], personalizado: true })
    render(<SuscripcionesPanel />)

    const verif = await screen.findByLabelText('Verificaciones diarias para Paz Salazar')
    expect(verif).toBeChecked()
    fireEvent.click(verif)

    expect(api.adminGuardarSuscripcion).toHaveBeenCalledWith(7, ['solicitud'])
    await waitFor(() => expect(verif).not.toBeChecked())
    expect(screen.getByRole('button', { name: 'Restablecer' })).toBeInTheDocument()
  })

  it('apagar el módulo deja al usuario sin ningún tipo', async () => {
    api.adminGuardarSuscripcion.mockResolvedValue({ ...PAZ, tipos: [], personalizado: true })
    render(<SuscripcionesPanel />)

    fireEvent.click(await screen.findByLabelText('Módulo de notificaciones para Paz Salazar'))

    expect(api.adminGuardarSuscripcion).toHaveBeenCalledWith(7, [])
    await waitFor(() =>
      expect(screen.getByLabelText('Nueva solicitud de análisis para Paz Salazar')).not.toBeChecked(),
    )
  })

  it('encender el módulo lo devuelve a lo predeterminado de su perfil', async () => {
    const apagada = { ...PAZ, tipos: [], personalizado: true }
    api.adminSuscripciones.mockResolvedValue({ ...DATOS, usuarios: [apagada] })
    api.adminRestablecerSuscripcion.mockResolvedValue(PAZ)
    render(<SuscripcionesPanel />)

    const modulo = await screen.findByLabelText('Módulo de notificaciones para Paz Salazar')
    expect(modulo).not.toBeChecked()
    fireEvent.click(modulo)

    expect(api.adminRestablecerSuscripcion).toHaveBeenCalledWith(7)
    expect(api.adminGuardarSuscripcion).not.toHaveBeenCalled()
    await waitFor(() => expect(modulo).toBeChecked())
    expect(screen.getByText('Predeterminado')).toBeInTheDocument()
  })
})
