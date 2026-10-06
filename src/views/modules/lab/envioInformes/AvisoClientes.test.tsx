import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AvisoClientes } from './AvisoClientes'

const api = vi.hoisted(() => ({
  obtenerAvisoClientes: vi.fn(),
  vistaPreviaAviso: vi.fn(),
  guardarAviso: vi.fn(),
  restaurarAviso: vi.fn(),
  enviarPruebaAviso: vi.fn(),
}))
vi.mock('@/features/envioInformes', () => api)

const original = {
  asunto: 'Asunto original', titulo: 'Aviso a clientes', subtitulo: 'AgroFresh Report Hub', texto: 'Estimados clientes:',
  plantilla: 'estandar',
}
const plantillas = [
  { clave: 'estandar', nombre: 'Estándar', descripcion: 'Sobria', miniatura: 'data:image/png;base64,AAAA' },
  { clave: 'azul', nombre: 'Azul', descripcion: 'Portada azul', miniatura: 'data:image/png;base64,BBBB' },
]
const aviso = (extra = {}) => ({
  ...original, html: '<p>original</p>', original, personalizado: false, plantillas,
  destinatarios_prueba: ['psalazar@agrofresh.com', 'jorge.sandoval@agrofresh.com'], ...extra,
})

describe('AvisoClientes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.obtenerAvisoClientes.mockResolvedValue(aviso())
    api.vistaPreviaAviso.mockResolvedValue({ html: '<p>borrador</p>' })
  })

  it('muestra los cuatro campos editables y no envía nada al abrir', async () => {
    render(<AvisoClientes />)
    expect(await screen.findByDisplayValue('Asunto original')).toBeTruthy()
    expect(screen.getByDisplayValue('Aviso a clientes')).toBeTruthy()
    expect(screen.getByDisplayValue('AgroFresh Report Hub')).toBeTruthy()
    expect(screen.getByDisplayValue('Estimados clientes:')).toBeTruthy()
    expect(screen.getByText(/solo a psalazar@agrofresh.com y jorge.sandoval@agrofresh.com/)).toBeTruthy()
    expect(api.enviarPruebaAviso).not.toHaveBeenCalled()
    expect((screen.getByRole('button', { name: 'Guardar cambios' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('al escribir actualiza la vista previa y permite guardar', async () => {
    api.guardarAviso.mockResolvedValue(aviso({ asunto: 'Otro asunto', personalizado: true }))
    render(<AvisoClientes />)
    fireEvent.change(await screen.findByDisplayValue('Asunto original'), { target: { value: 'Otro asunto' } })
    await waitFor(() => expect(api.vistaPreviaAviso).toHaveBeenCalledWith(expect.objectContaining({ asunto: 'Otro asunto' })))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(api.guardarAviso).toHaveBeenCalledWith(expect.objectContaining({ asunto: 'Otro asunto' })))
    expect(await screen.findByText('Aviso guardado.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Restaurar el original' })).toBeTruthy()
  })

  it('«Probar el aviso» manda lo que está en pantalla, aunque no esté guardado', async () => {
    api.enviarPruebaAviso.mockResolvedValue({ ok: 'Prueba enviada. No salió nada a clientes.', to: [] })
    render(<AvisoClientes />)
    fireEvent.change(await screen.findByDisplayValue('Estimados clientes:'), { target: { value: 'Hola' } })
    fireEvent.click(screen.getByRole('button', { name: 'Probar el aviso' }))
    await waitFor(() => expect(api.enviarPruebaAviso).toHaveBeenCalledWith(expect.objectContaining({ texto: 'Hola' })))
    expect(await screen.findByText(/No salió nada a clientes/)).toBeTruthy()
  })

  it('no deja guardar ni probar con el texto vacío', async () => {
    render(<AvisoClientes />)
    fireEvent.change(await screen.findByDisplayValue('Estimados clientes:'), { target: { value: '  ' } })
    expect((screen.getByRole('button', { name: 'Guardar cambios' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Probar el aviso' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('«Restaurar el original» vuelve al texto original', async () => {
    api.obtenerAvisoClientes.mockResolvedValue(aviso({ asunto: 'Editado', personalizado: true }))
    api.restaurarAviso.mockResolvedValue(aviso())
    render(<AvisoClientes />)
    fireEvent.click(await screen.findByRole('button', { name: 'Restaurar el original' }))
    expect(await screen.findByDisplayValue('Asunto original')).toBeTruthy()
    expect(api.restaurarAviso).toHaveBeenCalledTimes(1)
  })

  it('con un backend viejo (sin título ni subtítulo) no se cae y avisa que falta actualizar', async () => {
    api.obtenerAvisoClientes.mockResolvedValue({
      asunto: 'Asunto', texto: 'Texto', html: '<p>x</p>', destinatarios_prueba: ['a@x.cl'],
    })
    render(<AvisoClientes />)
    expect(await screen.findByText(/hacer git pull y reiniciar el backend/)).toBeTruthy()
    expect(screen.getByDisplayValue('Asunto')).toBeTruthy()
  })

  it('elige una plantilla, actualiza la vista previa y la guarda con el aviso', async () => {
    api.guardarAviso.mockResolvedValue(aviso({ plantilla: 'azul', personalizado: true }))
    render(<AvisoClientes />)
    const azul = await screen.findByRole('radio', { name: /Azul/ })
    expect(screen.getByRole('radio', { name: /Estándar/ }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(azul)
    expect(azul.getAttribute('aria-checked')).toBe('true')
    await waitFor(() => expect(api.vistaPreviaAviso).toHaveBeenCalledWith(expect.objectContaining({ plantilla: 'azul' })))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(api.guardarAviso).toHaveBeenCalledWith(expect.objectContaining({ plantilla: 'azul' })))
  })

  it('con un backend sin plantillas no muestra el selector y no se cae', async () => {
    api.obtenerAvisoClientes.mockResolvedValue(aviso({ plantillas: undefined, plantilla: undefined }))
    render(<AvisoClientes />)
    expect(await screen.findByDisplayValue('Asunto original')).toBeTruthy()
    expect(screen.queryByRole('radiogroup')).toBeNull()
  })
})
