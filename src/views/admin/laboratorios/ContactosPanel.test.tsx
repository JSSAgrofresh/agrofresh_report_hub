import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ContactosPanel } from './ContactosPanel'
import type { Contacto } from '@/features/laboratorios'

/**
 * Contacto laboratorio: cada contacto de solicitud elige si va en Para,
 * Copia (CC) o Copia oculta (CCO) del correo de la solicitud.
 */

const { crearContacto, actualizarContacto } = vi.hoisted(() => ({
  crearContacto: vi.fn(),
  actualizarContacto: vi.fn(),
}))

vi.mock('@/features/laboratorios', async (original) => ({
  ...(await original<typeof import('@/features/laboratorios')>()),
  crearContacto,
  actualizarContacto,
  eliminarContacto: vi.fn(),
}))

const SECCIONES = [{ tipo: 'solicitud' as const, titulo: 'Reciben las solicitudes', nota: '' }]

function contacto(extra: Partial<Contacto> = {}): Contacto {
  return {
    id: 1, laboratorio: 'QUITECA', nombre: 'Recepción', email: 'recepcion@quiteca.cl', cargo: '',
    tipo: 'solicitud', sold_to: '', ship_to: '', especie: '', tipo_copia: 'cc', activo: true, orden: 1,
    ...extra,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  crearContacto.mockImplementation(async (datos) => ({ id: 2, ...datos }))
  actualizarContacto.mockImplementation(async (id, datos) => ({ id, ...datos }))
})

describe('ContactosPanel', () => {
  it('se puede agregar a alguien en copia oculta', async () => {
    const onCambio = vi.fn()
    render(
      <ContactosPanel laboratorio="QUITECA" contactos={[contacto()]} secciones={SECCIONES}
        onCambio={onCambio} onError={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))
    fireEvent.change(screen.getByPlaceholderText('Ana Pinto'), { target: { value: 'Claudia' } })
    fireEvent.change(screen.getByPlaceholderText('ana@laboratorio.cl'), { target: { value: 'claudia@agrofresh.com' } })
    fireEvent.change(screen.getByLabelText('Va en el correo como'), { target: { value: 'bcc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar contacto' }))

    await waitFor(() => expect(crearContacto).toHaveBeenCalledTimes(1))
    expect(crearContacto.mock.calls[0][0]).toMatchObject({
      email: 'claudia@agrofresh.com', tipo: 'solicitud', envio: 'bcc',
    })
  })

  it('un contacto nuevo va en Para si no se elige otra cosa', async () => {
    render(
      <ContactosPanel laboratorio="QUITECA" contactos={[]} secciones={SECCIONES}
        onCambio={() => {}} onError={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))
    fireEvent.change(screen.getByPlaceholderText('Ana Pinto'), { target: { value: 'Jefa' } })
    fireEvent.change(screen.getByPlaceholderText('ana@laboratorio.cl'), { target: { value: 'jefa@quiteca.cl' } })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar contacto' }))
    await waitFor(() => expect(crearContacto).toHaveBeenCalledTimes(1))
    expect(crearContacto.mock.calls[0][0].envio).toBe('para')
  })

  it('la lista dice cuál va en copia oculta; los de Para no llevan marca', () => {
    render(
      <ContactosPanel
        laboratorio="QUITECA"
        contactos={[contacto(), contacto({ id: 2, nombre: 'Claudia', email: 'claudia@agrofresh.com', envio: 'bcc', orden: 2 })]}
        secciones={SECCIONES}
        onCambio={() => {}}
        onError={() => {}}
      />,
    )
    expect(screen.getByText(/Copia oculta \(CCO\)/)).toBeInTheDocument()
    expect(screen.queryByText(/· Para/)).not.toBeInTheDocument()
  })

  it('al editar se conserva cómo va el contacto', async () => {
    render(
      <ContactosPanel
        laboratorio="QUITECA"
        contactos={[contacto({ envio: 'cc' })]}
        secciones={SECCIONES}
        onCambio={() => {}}
        onError={() => {}}
      />,
    )
    fireEvent.click(screen.getByTitle('Editar'))
    expect(screen.getByLabelText('Va en el correo como')).toHaveValue('cc')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(actualizarContacto).toHaveBeenCalledTimes(1))
    expect(actualizarContacto.mock.calls[0][1].envio).toBe('cc')
  })
})
