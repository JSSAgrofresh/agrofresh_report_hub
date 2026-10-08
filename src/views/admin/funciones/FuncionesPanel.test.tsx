import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FuncionesPanel } from './FuncionesPanel'
import { HttpError } from '@/services/http/client'

const api = vi.hoisted(() => ({ obtenerFunciones: vi.fn(), cambiarServicioReport: vi.fn() }))
vi.mock('@/features/funciones', () => api)

const sesion = vi.hoisted(() => ({ user: { tipoAcceso: 'admin_general', email: 'jorge.sandoval@agrofresh.com' } as { tipoAcceso: string; email: string } }))
vi.mock('@/features/auth', () => ({ useAuth: () => ({ user: sesion.user }) }))

const estado = (activos: string[] = ['linea_proceso'], extra = {}) => ({
  report: {
    servicios: [
      { clave: 'linea_proceso', etiqueta: 'Línea de proceso', activo: activos.includes('linea_proceso') },
      { clave: 'actimist', etiqueta: 'Actimist', activo: activos.includes('actimist') },
      { clave: 'ecofog', etiqueta: 'Ecofog', activo: activos.includes('ecofog') },
      { clave: 'ryd', etiqueta: 'RYD', activo: activos.includes('ryd') },
    ],
    cambiado_por: null,
    cambiado_en: null,
  },
  migracion_pendiente: false,
  ...extra,
})

describe('FuncionesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sesion.user = { tipoAcceso: 'admin_general', email: 'jorge.sandoval@agrofresh.com' }
    api.obtenerFunciones.mockResolvedValue(estado())
  })

  it('de fábrica solo Línea de proceso se muestra en Report', async () => {
    render(<FuncionesPanel />)
    expect(await screen.findByText('Línea de proceso')).toBeTruthy()
    expect(screen.getAllByText('Se muestra en Report')).toHaveLength(1)
    expect(screen.getAllByText('No se muestra')).toHaveLength(3)
  })

  it('encender un servicio pide la contraseña y no cambia nada sin ella', async () => {
    api.cambiarServicioReport.mockResolvedValue(estado(['linea_proceso', 'ecofog']))
    render(<FuncionesPanel />)
    fireEvent.click(await screen.findByRole('button', { name: 'Mostrar Ecofog en Report' }))
    const confirmar = screen.getByRole('button', { name: 'Mostrar' }) as HTMLButtonElement
    expect(confirmar.disabled).toBe(true)
    expect(api.cambiarServicioReport).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Tu contraseña, para confirmar'), { target: { value: 'mi-clave' } })
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar' }))
    await waitFor(() => expect(api.cambiarServicioReport).toHaveBeenCalledWith('ecofog', true, 'mi-clave'))
    await waitFor(() => expect(screen.getAllByText('Se muestra en Report')).toHaveLength(2))
  })

  it('apagar también pide la contraseña', async () => {
    api.obtenerFunciones.mockResolvedValue(estado(['linea_proceso', 'actimist']))
    api.cambiarServicioReport.mockResolvedValue(estado())
    render(<FuncionesPanel />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ocultar Actimist en Report' }))
    fireEvent.change(screen.getByLabelText('Tu contraseña, para confirmar'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar' }))
    await waitFor(() => expect(api.cambiarServicioReport).toHaveBeenCalledWith('actimist', false, 'x'))
  })

  it('una contraseña equivocada se muestra y no cambia el estado', async () => {
    api.cambiarServicioReport.mockRejectedValue(new HttpError(403, 'Contraseña incorrecta.'))
    render(<FuncionesPanel />)
    fireEvent.click(await screen.findByRole('button', { name: 'Mostrar RYD en Report' }))
    fireEvent.change(screen.getByLabelText('Tu contraseña, para confirmar'), { target: { value: 'mala' } })
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText('Contraseña incorrecta.')).toBeTruthy()
    expect(screen.getAllByText('Se muestra en Report')).toHaveLength(1)
  })

  it('quien no es el administrador principal ve el estado pero no puede cambiarlo', async () => {
    sesion.user = { tipoAcceso: 'admin_general', email: 'otra.persona@agrofresh.com' }
    render(<FuncionesPanel />)
    const boton = (await screen.findByRole('button', { name: 'Mostrar Ecofog en Report' })) as HTMLButtonElement
    expect(boton.disabled).toBe(true)
  })

  it('avisa si falta la migración 0055', async () => {
    api.obtenerFunciones.mockResolvedValue(estado(['linea_proceso'], { migracion_pendiente: true }))
    render(<FuncionesPanel />)
    expect(await screen.findByText(/Falta correr la migración 0055/)).toBeTruthy()
  })
})
