import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { EnvioInformesView } from './EnvioInformesView'
import type { EstadoEnvio, PlanDestinatarios, VistaPrevia } from '@/features/envioInformes'

const api = vi.hoisted(() => ({
  obtenerEstadoEnvio: vi.fn(),
  cambiarModoEnvio: vi.fn(),
  obtenerPlanDestinatarios: vi.fn(),
  vistaPreviaInforme: vi.fn(),
  enviarInforme: vi.fn(),
  historialEnvios: vi.fn(),
  guardarInternos: vi.fn(),
  obtenerTemplateInforme: vi.fn(),
  guardarTemplateInforme: vi.fn(),
}))

vi.mock('@/features/envioInformes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/envioInformes')>()),
  ...api,
}))

vi.mock('@/features/catalogo', () => ({
  listarClientes: vi.fn().mockResolvedValue([{ id: 1, nombre: 'DOLE', activo: true }]),
  listarPlantas: vi.fn().mockResolvedValue([
    { id: 1, cliente_id: 1, cliente_nombre: 'DOLE', nombre: 'SAN FERNANDO', activo: true },
  ]),
}))

const estado = (modo: 'prueba' | 'produccion' = 'prueba'): EstadoEnvio => ({
  modo,
  destinatarios_prueba: ['psalazar@agrofresh.com', 'jorge.sandoval@agrofresh.com'],
  internos: { cc: [], bcc: ['psalazar@agrofresh.com'] },
  laboratorios: ['QUITECA', 'AGROFRESH'],
  modo_cambiado_por: null,
  modo_cambiado_en: null,
})

const plan: PlanDestinatarios = {
  to: ['cliente1@dole.cl', 'cliente2@dole.cl'], cc: [], bcc: ['psalazar@agrofresh.com'], sin_lista: false, especies: [],
}

const vista = (modo: 'prueba' | 'produccion' = 'prueba'): VistaPrevia => ({
  modo,
  asunto: modo === 'prueba' ? '(PRUEBA) Informe DOLE' : 'Informe DOLE',
  texto: 'Estimados, adjuntamos el informe.',
  asunto_base: 'Informe DOLE',
  texto_base: 'Estimados, adjuntamos el informe.',
  html: '<p>correo</p>',
  reales: { to: plan.to, cc: [], bcc: plan.bcc },
  efectivos: modo === 'prueba'
    ? { to: ['psalazar@agrofresh.com', 'jorge.sandoval@agrofresh.com'], cc: [], bcc: [] }
    : { to: plan.to, cc: [], bcc: plan.bcc },
})

function pantalla() {
  return render(
    <MemoryRouter>
      <EnvioInformesView />
    </MemoryRouter>,
  )
}

async function elegirPlantaYArchivo(container: HTMLElement) {
  const sold = await screen.findByPlaceholderText('— elegir cliente —')
  fireEvent.focus(sold)
  fireEvent.click(await screen.findByRole('button', { name: 'DOLE' }))
  const ship = await screen.findByPlaceholderText('— elegir planta —')
  fireEvent.focus(ship)
  fireEvent.click(await screen.findByRole('button', { name: 'SAN FERNANDO' }))
  const entrada = container.querySelector('input[type="file"]') as HTMLInputElement
  fireEvent.change(entrada, { target: { files: [new File(['%PDF-1.4'], 'informe.pdf', { type: 'application/pdf' })] } })
}

describe('EnvioInformesView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.obtenerEstadoEnvio.mockResolvedValue(estado())
    api.obtenerPlanDestinatarios.mockResolvedValue(plan)
    api.vistaPreviaInforme.mockResolvedValue(vista())
    api.historialEnvios.mockResolvedValue({ disponible: true, items: [] })
    api.obtenerTemplateInforme.mockResolvedValue({ laboratorio: 'QUITECA', asunto: 'A', cuerpo: 'B', variables: ['sold_to'] })
    api.enviarInforme.mockResolvedValue({
      ok: 'Prueba enviada a psalazar@agrofresh.com.', modo: 'prueba', to: [], cc: [], bcc: [], mensaje_id: 'm',
    })
  })

  it('abre en «Sistema en prueba» y dice que nada sale a clientes', async () => {
    pantalla()
    expect(await screen.findByRole('button', { name: /Sistema en prueba/ })).toBeTruthy()
    expect(screen.getByText(/Nada sale a clientes/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Enviar prueba' })).toBeDisabled()
  })

  it('carga la lista de la planta, deja corregirla y envía con lo que se ve', async () => {
    const { container } = pantalla()
    await elegirPlantaYArchivo(container)

    expect(await screen.findByText('cliente1@dole.cl')).toBeTruthy()
    expect(screen.getByText('cliente2@dole.cl')).toBeTruthy()
    expect(api.obtenerPlanDestinatarios).toHaveBeenCalledWith('DOLE', 'SAN FERNANDO', '')

    // Paz saca a uno de la lista, solo para este envío
    fireEvent.click(screen.getByRole('button', { name: 'Quitar cliente2@dole.cl' }))
    expect(screen.queryByText('cliente2@dole.cl')).toBeNull()
    expect(screen.getByRole('button', { name: 'Volver a la lista del sistema' })).toBeTruthy()

    const enviar = screen.getByRole('button', { name: 'Enviar prueba' })
    await waitFor(() => expect(enviar).toBeEnabled())
    fireEvent.click(enviar)

    await waitFor(() => expect(api.enviarInforme).toHaveBeenCalledTimes(1))
    const [datos, archivos] = api.enviarInforme.mock.calls[0]
    expect(datos).toMatchObject({
      laboratorio: 'QUITECA', sold_to: 'DOLE', ship_to: 'SAN FERNANDO', para: ['cliente1@dole.cl'], asunto: null,
    })
    expect(archivos).toHaveLength(1)
    expect(await screen.findByText('Prueba enviada a psalazar@agrofresh.com.')).toBeTruthy()
  })

  it('sin lista de distribución no deja enviar y lo explica', async () => {
    api.obtenerPlanDestinatarios.mockResolvedValue({ to: [], cc: [], bcc: [], sin_lista: true, especies: [] })
    const { container } = pantalla()
    await elegirPlantaYArchivo(container)

    expect(await screen.findByText(/no tiene lista de distribución de resultados/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Enviar prueba' })).toBeDisabled()
    expect(screen.getByText(/escribe al menos un correo en Para/)).toBeTruthy()
  })

  it('un correo mal escrito se marca y frena el envío', async () => {
    const { container } = pantalla()
    await elegirPlantaYArchivo(container)
    await screen.findByText('cliente1@dole.cl')

    const entradas = screen.getAllByPlaceholderText('Agregar otro…')
    fireEvent.change(entradas[0], { target: { value: 'roto' } })
    fireEvent.blur(entradas[0])

    expect(await screen.findByText(/corrige: roto/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Enviar prueba' })).toBeDisabled()
  })

  it('editar el asunto manda lo escrito; volver a la plantilla lo suelta', async () => {
    const { container } = pantalla()
    await elegirPlantaYArchivo(container)
    const asunto = await screen.findByDisplayValue('Informe DOLE')

    fireEvent.change(asunto, { target: { value: 'Asunto de Paz' } })
    await waitFor(() => expect(api.vistaPreviaInforme).toHaveBeenLastCalledWith(
      expect.objectContaining({ asunto: 'Asunto de Paz' }), ['informe.pdf'],
    ))
    fireEvent.click(screen.getByRole('button', { name: 'Volver a la plantilla' }))
    expect(await screen.findByDisplayValue('Informe DOLE')).toBeTruthy()
  })

  it('en producción confirma antes de enviar a clientes', async () => {
    api.obtenerEstadoEnvio.mockResolvedValue(estado('produccion'))
    api.vistaPreviaInforme.mockResolvedValue(vista('produccion'))
    const { container } = pantalla()
    expect(await screen.findByRole('button', { name: /Sistema en producción/ })).toBeTruthy()
    await elegirPlantaYArchivo(container)

    const boton = await screen.findByRole('button', { name: 'Enviar a clientes' })
    await waitFor(() => expect(boton).toBeEnabled())
    fireEvent.click(boton)

    expect(api.enviarInforme).not.toHaveBeenCalled()
    expect(await screen.findByRole('dialog', { name: 'Enviar a clientes' })).toBeTruthy()
    const botones = screen.getAllByRole('button', { name: 'Enviar a clientes' })
    fireEvent.click(botones[botones.length - 1])
    await waitFor(() => expect(api.enviarInforme).toHaveBeenCalledTimes(1))
  })

  it('pasar a producción pide la contraseña', async () => {
    api.cambiarModoEnvio.mockResolvedValue(estado('produccion'))
    pantalla()
    fireEvent.click(await screen.findByRole('button', { name: /Sistema en prueba/ }))

    const confirmar = screen.getByRole('button', { name: 'Pasar a producción' })
    expect(confirmar).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Tu contraseña, para confirmar'), { target: { value: 'clave' } })
    fireEvent.click(confirmar)

    await waitFor(() => expect(api.cambiarModoEnvio).toHaveBeenCalledWith('produccion', 'clave'))
    expect(await screen.findByRole('button', { name: /Sistema en producción/ })).toBeTruthy()
  })
})
