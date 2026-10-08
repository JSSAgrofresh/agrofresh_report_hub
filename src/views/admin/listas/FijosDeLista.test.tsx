import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FijosDeLista } from './FijosDeLista'
import type { FijosLista } from '@/features/listasDistribucion'
import { HttpError } from '@/services/http/client'

const api = vi.hoisted(() => ({ guardarFijos: vi.fn(), restaurarFijos: vi.fn() }))
vi.mock('@/features/listasDistribucion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/listasDistribucion')>()),
  ...api,
}))

const ECO: FijosLista = {
  para: ['CJIMENEZ@AGROFRESH.COM', 'CVALENZUELA@AGROFRESH.COM'],
  cc: ['JORGE.SANDOVAL@AGROFRESH.COM'],
  respaldo: [],
  editable: true,
  original: { para: ['CJIMENEZ@AGROFRESH.COM', 'CVALENZUELA@AGROFRESH.COM'], cc: ['JORGE.SANDOVAL@AGROFRESH.COM'] },
  personalizado: false,
}

describe('FijosDeLista', () => {
  it('RYD muestra a Carla y Fran en Para y a Jorge y el sistema en copia', () => {
    render(<FijosDeLista servicio="ryd" fijos={{ para: ['CCACERES@AGROFRESH.COM', 'FGONZALEZ@AGROFRESH.COM'], cc: ['JORGE.SANDOVAL@AGROFRESH.COM', 'AGROFRESHREPORTHUB@GMAIL.COM'], respaldo: [] }} />)
    expect(screen.getByText(/Siempre reciben \(RYD\)/)).toBeInTheDocument()
    expect(screen.getByTitle('CCACERES@AGROFRESH.COM')).toHaveTextContent('CCACERES')
    expect(screen.getByTitle('AGROFRESHREPORTHUB@GMAIL.COM')).toBeInTheDocument()
  })

  it('Línea de proceso solo dice su respaldo para cuando no hay lista del cliente', () => {
    render(<FijosDeLista servicio="linea" fijos={{ para: [], cc: [], respaldo: ['JORGE.SANDOVAL@AGROFRESH.COM', 'CGUERRERO@AGROFRESH.COM'] }} />)
    expect(screen.getByText(/Sin lista del cliente/)).toBeInTheDocument()
    expect(screen.getByTitle('CGUERRERO@AGROFRESH.COM')).toBeInTheDocument()
  })

  it('Línea de proceso no se puede editar ni un backend anterior sin `editable`', () => {
    render(<FijosDeLista servicio="linea" fijos={{ para: [], cc: [], respaldo: ['A@X.CL'], editable: false }} />)
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
  })
})

describe('FijosDeLista: edición', () => {
  beforeEach(() => vi.clearAllMocks())

  it('Editar abre Para y Copia con lo vigente, y Guardar manda los cambios y avisa al panel', async () => {
    const nuevo = { ...ECO, para: ['CJIMENEZ@AGROFRESH.COM', 'nuevo@agrofresh.com'], personalizado: true }
    api.guardarFijos.mockResolvedValue(nuevo)
    const onCambio = vi.fn()
    render(<FijosDeLista servicio="ecofog" fijos={ECO} onCambio={onCambio} />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    expect(screen.getByLabelText(/Quitar CVALENZUELA@AGROFRESH.COM/)).toBeInTheDocument()
    expect((screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement).disabled).toBe(true)   // sin cambios
    fireEvent.click(screen.getByLabelText('Quitar CVALENZUELA@AGROFRESH.COM'))
    const [campoPara] = screen.getAllByPlaceholderText('Agregar otro…')
    fireEvent.change(campoPara, { target: { value: 'nuevo@agrofresh.com' } })
    fireEvent.keyDown(campoPara, { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(api.guardarFijos).toHaveBeenCalledWith('ecofog', {
      para: ['CJIMENEZ@AGROFRESH.COM', 'nuevo@agrofresh.com'], cc: ['JORGE.SANDOVAL@AGROFRESH.COM'],
    }))
    await waitFor(() => expect(onCambio).toHaveBeenCalledWith(nuevo))
    expect(screen.queryByRole('button', { name: 'Guardar' })).toBeNull()   // vuelve a la vista normal
  })

  it('no deja guardar con Para vacío', () => {
    render(<FijosDeLista servicio="ryd" fijos={ECO} />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    fireEvent.click(screen.getByLabelText('Quitar CJIMENEZ@AGROFRESH.COM'))
    fireEvent.click(screen.getByLabelText('Quitar CVALENZUELA@AGROFRESH.COM'))
    expect((screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('un correo mal escrito avisa y no se guarda', () => {
    render(<FijosDeLista servicio="ryd" fijos={ECO} />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    const [campoPara] = screen.getAllByPlaceholderText('Agregar otro…')
    fireEvent.change(campoPara, { target: { value: 'sin-arroba' } })
    fireEvent.keyDown(campoPara, { key: 'Enter' })
    expect(screen.getByText(/no parece un correo/)).toBeInTheDocument()
    expect((screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('el error del servidor se muestra y se sigue editando', async () => {
    api.guardarFijos.mockRejectedValue(new HttpError(400, 'Debe haber al menos un correo en Para.'))
    render(<FijosDeLista servicio="ecofog" fijos={ECO} />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    fireEvent.click(screen.getByLabelText('Quitar JORGE.SANDOVAL@AGROFRESH.COM'))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/al menos un correo/)
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument()
  })

  it('Restaurar los originales pide confirmación y solo aparece si hay cambios guardados', async () => {
    api.restaurarFijos.mockResolvedValue({ ...ECO, personalizado: false })
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    const onCambio = vi.fn()
    const { rerender } = render(<FijosDeLista servicio="ecofog" fijos={ECO} onCambio={onCambio} />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    expect(screen.queryByRole('button', { name: 'Restaurar los originales' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    rerender(<FijosDeLista servicio="ecofog" fijos={{ ...ECO, personalizado: true }} onCambio={onCambio} />)
    expect(screen.getByText('editado')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar los originales' }))
    expect(api.restaurarFijos).not.toHaveBeenCalled()                    // dijo que no
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar los originales' }))
    await waitFor(() => expect(api.restaurarFijos).toHaveBeenCalledWith('ecofog'))
    expect(confirmar).toHaveBeenCalledTimes(2)
  })

  it('Cancelar descarta lo escrito', () => {
    render(<FijosDeLista servicio="ecofog" fijos={ECO} />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    fireEvent.click(screen.getByLabelText('Quitar CVALENZUELA@AGROFRESH.COM'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    expect(screen.getByLabelText('Quitar CVALENZUELA@AGROFRESH.COM')).toBeInTheDocument()
  })
})
