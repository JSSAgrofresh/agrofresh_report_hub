import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { EnvioInformesView } from './EnvioInformesView'
import type { EstadoEnvio, LecturaInforme, VistaPrevia } from '@/features/envioInformes'

const api = vi.hoisted(() => ({
  obtenerEstadoEnvio: vi.fn(),
  cambiarModoEnvio: vi.fn(),
  analizarInformes: vi.fn(),
  desbloquearEdicion: vi.fn(),
  obtenerPlanDestinatarios: vi.fn(),
  vistaPreviaInforme: vi.fn(),
  enviarInforme: vi.fn(),
  historialEnvios: vi.fn(),
  guardarInternos: vi.fn(),
  obtenerTemplateInforme: vi.fn(),
  guardarTemplateInforme: vi.fn(),
  eliminarRegistroEnvio: vi.fn(),
}))

vi.mock('@/features/envioInformes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/envioInformes')>()),
  ...api,
}))

const sesion = vi.hoisted(() => ({
  user: { email: 'paz@agrofresh.com', tipoAcceso: 'admin_area' } as { email: string; tipoAcceso: string },
}))
vi.mock('@/features/auth', () => ({ useAuth: () => ({ user: sesion.user }) }))
const verificarClave = vi.hoisted(() => vi.fn())
vi.mock('@/features/auth/api/authApi', () => ({ verificarClave }))

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
  laboratorio_fijo: 'AGROFRESH',
  modo_cambiado_por: null,
  modo_cambiado_en: null,
})

const lectura = (nombre: string, ship: string, para: string[], extra: Partial<LecturaInforme> = {}): LecturaInforme => ({
  nombre, leido: true, error: null, sold_to: 'DOLE', ship_to: ship, especie: 'Naranja', tipo_aplicacion: 'Línea de proceso',
  numero_solicitud: 'OT-1', servicio: '', solicitud: null,
  plan: { to: para, cc: [], bcc: ['psalazar@agrofresh.com'], sin_lista: para.length === 0, especies: [] }, ...extra,
})

const vista = (modo: 'prueba' | 'produccion' = 'prueba'): VistaPrevia => ({
  modo,
  asunto: modo === 'prueba' ? '(PRUEBA) Informe' : 'Informe',
  texto: 'Estimados',
  asunto_base: 'Informe de la plantilla',
  texto_base: 'Texto de la plantilla',
  html: '<p>correo</p>',
  reales: { to: [], cc: [], bcc: [] },
  efectivos: { to: ['psalazar@agrofresh.com'], cc: [], bcc: [] },
})

function pantalla() {
  return render(
    <MemoryRouter>
      <EnvioInformesView />
    </MemoryRouter>,
  )
}

const pdf = (nombre: string) => new File(['%PDF-1.4'], nombre, { type: 'application/pdf' })

async function subir(container: HTMLElement, ...nombres: string[]) {
  await screen.findByRole('button', { name: /Sistema en/ })
  const entrada = container.querySelector('input[type="file"]') as HTMLInputElement
  fireEvent.change(entrada, { target: { files: nombres.map(pdf) } })
}

describe('EnvioInformesView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sesion.user = { email: 'paz@agrofresh.com', tipoAcceso: 'admin_area' }
    api.obtenerEstadoEnvio.mockResolvedValue(estado())
    api.analizarInformes.mockResolvedValue({
      disponible: true,
      items: [lectura('a.pdf', 'SAN FERNANDO', ['a@dole.cl']), lectura('b.pdf', 'LONTUE', ['b@dole.cl', 'b2@dole.cl'])],
    })
    api.vistaPreviaInforme.mockResolvedValue(vista())
    api.historialEnvios.mockResolvedValue({ disponible: true, items: [] })
    api.obtenerTemplateInforme.mockResolvedValue({ laboratorio: 'AGROFRESH', asunto: 'A', cuerpo: 'B', variables: ['sold_to'] })
    api.obtenerPlanDestinatarios.mockResolvedValue({ to: ['nuevo@dole.cl'], cc: [], bcc: [], sin_lista: false, especies: [] })
    api.enviarInforme.mockImplementation(async (datos) => ({
      ok: `Prueba enviada (${datos.ship_to}).`, modo: 'prueba', to: [], cc: [], bcc: [], mensaje_id: 'm',
    }))
  })

  it('abre en «Sistema en prueba», con el laboratorio fijo y sin nada que enviar', async () => {
    pantalla()
    expect(await screen.findByRole('button', { name: /Sistema en prueba/ })).toBeTruthy()
    expect(screen.getByText(/Nada sale a clientes/)).toBeTruthy()
    expect(screen.getByText(/Laboratorio:/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Enviar prueba' })).toBeDisabled()
  })

  it('sube varios PDF, lee cada uno y los envía todos de golpe, cada uno a su lista', async () => {
    const { container } = pantalla()
    await subir(container, 'a.pdf', 'b.pdf')

    expect(await screen.findByText('a.pdf')).toBeTruthy()
    expect(screen.getByText(/DOLE · LONTUE · Naranja · Línea de proceso/)).toBeTruthy()
    expect(api.analizarInformes).toHaveBeenCalledTimes(1)
    expect(api.analizarInformes.mock.calls[0][0].map((f: File) => f.name)).toEqual(['a.pdf', 'b.pdf'])

    const enviar = await screen.findByRole('button', { name: 'Enviar prueba (2)' })
    fireEvent.click(enviar)

    await waitFor(() => expect(api.enviarInforme).toHaveBeenCalledTimes(2))
    const [primero, segundo] = api.enviarInforme.mock.calls
    // Para, CC y CCO tal como los propuso el sistema (la lista de la solicitud más las copias del módulo)
    expect(primero[0]).toMatchObject({
      laboratorio: 'AGROFRESH', ship_to: 'SAN FERNANDO', para: ['a@dole.cl'], cc: [], bcc: ['psalazar@agrofresh.com'],
    })
    expect(segundo[0]).toMatchObject({ ship_to: 'LONTUE', para: ['b@dole.cl', 'b2@dole.cl'] })
    expect(primero[1].map((f: File) => f.name)).toEqual(['a.pdf'])
    expect(await screen.findByText('2 informes enviados.')).toBeTruthy()
  })

  it('si uno falla, el otro igual sale y el que falló queda para reintentar', async () => {
    api.enviarInforme.mockImplementation(async (datos) => {
      if (datos.ship_to === 'LONTUE') throw new Error('x')
      return { ok: 'ok', modo: 'prueba', to: [], cc: [], bcc: [], mensaje_id: 'm' }
    })
    const { container } = pantalla()
    await subir(container, 'a.pdf', 'b.pdf')
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar prueba (2)' }))

    expect(await screen.findByText('1 informe enviado, 1 con error.')).toBeTruthy()
    expect(screen.getByText('Falló')).toBeTruthy()
    expect(screen.getByText('Enviado')).toBeTruthy()
    // solo queda uno por enviar
    expect(screen.getByRole('button', { name: 'Enviar prueba' })).toBeEnabled()
  })

  it('un informe sin lista frena solo a ese; escribir un correo lo deja listo', async () => {
    api.analizarInformes.mockResolvedValue({
      disponible: true,
      items: [lectura('a.pdf', 'SAN FERNANDO', ['a@dole.cl']), lectura('b.pdf', 'LONTUE', [])],
    })
    const { container } = pantalla()
    await subir(container, 'a.pdf', 'b.pdf')

    expect(await screen.findByText(/Sin lista de distribución: escribe un correo en Para/)).toBeTruthy()
    // el que sí tiene lista se puede enviar solo
    expect(screen.getByRole('button', { name: 'Enviar prueba' })).toBeEnabled()
    expect(screen.getByText(/1 sin revisar/)).toBeTruthy()

    const tarjeta = screen.getByText('b.pdf').closest('li') as HTMLElement
    fireEvent.click(within(tarjeta).getByRole('button', { name: 'Editar este correo' }))
    const para = within(tarjeta).getAllByPlaceholderText('nombre@empresa.cl')[0]
    fireEvent.change(para, { target: { value: 'paz@dole.cl' } })
    fireEvent.blur(para)

    expect(await screen.findByRole('button', { name: 'Enviar prueba (2)' })).toBeEnabled()
  })

  it('corregir el correo de un informe no toca a los otros', async () => {
    const { container } = pantalla()
    await subir(container, 'a.pdf', 'b.pdf')
    const tarjeta = (await screen.findByText('b.pdf')).closest('li') as HTMLElement
    fireEvent.click(within(tarjeta).getByRole('button', { name: 'Editar este correo' }))
    const asunto = await within(tarjeta).findByDisplayValue('Informe de la plantilla')
    fireEvent.change(asunto, { target: { value: 'Solo para este' } })

    fireEvent.click(screen.getByRole('button', { name: 'Enviar prueba (2)' }))
    await waitFor(() => expect(api.enviarInforme).toHaveBeenCalledTimes(2))
    const [a, b] = api.enviarInforme.mock.calls
    expect(a[0].asunto).toBeNull()
    expect(b[0].asunto).toBe('Solo para este')
  })

  it('el Sold To, el Ship To y la especie leídos del PDF están bloqueados hasta habilitar con clave', async () => {
    api.desbloquearEdicion.mockResolvedValue({ ok: true })
    const { container } = pantalla()
    await subir(container, 'a.pdf')
    const tarjeta = (await screen.findByText('a.pdf')).closest('li') as HTMLElement
    fireEvent.click(within(tarjeta).getByRole('button', { name: 'Editar este correo' }))

    const especie = within(tarjeta).getByDisplayValue('Naranja')
    expect(especie).toBeDisabled()
    for (const campo of within(tarjeta).getAllByPlaceholderText('— sin dato —')) expect(campo).toBeDisabled()

    fireEvent.click(within(tarjeta).getByRole('button', { name: 'Habilitar con clave' }))
    const confirmar = screen.getByRole('button', { name: 'Habilitar' })
    expect(confirmar).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Contraseña del administrador principal'), { target: { value: 'clave' } })
    fireEvent.click(confirmar)

    await waitFor(() => expect(api.desbloquearEdicion).toHaveBeenCalledWith('clave'))
    await waitFor(() => expect(within(tarjeta).getByDisplayValue('Naranja')).toBeEnabled())

    // ya habilitado: cambiar la especie vuelve a pedir la lista de esa planta
    fireEvent.change(within(tarjeta).getByDisplayValue('Naranja'), { target: { value: 'Uva' } })
    await waitFor(() => expect(api.obtenerPlanDestinatarios).toHaveBeenCalledWith('DOLE', 'SAN FERNANDO', 'Uva', ''))
    expect(await within(tarjeta).findByText('nuevo@dole.cl')).toBeTruthy()
  })

  it('con una clave que no corresponde sigue bloqueado y lo dice', async () => {
    api.desbloquearEdicion.mockRejectedValue(Object.assign(new Error('Solo el administrador principal puede habilitar esta edición.'), { status: 403 }))
    const { container } = pantalla()
    await subir(container, 'a.pdf')
    const tarjeta = (await screen.findByText('a.pdf')).closest('li') as HTMLElement
    fireEvent.click(within(tarjeta).getByRole('button', { name: 'Editar este correo' }))
    fireEvent.click(within(tarjeta).getByRole('button', { name: 'Habilitar con clave' }))
    fireEvent.change(screen.getByLabelText('Contraseña del administrador principal'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Habilitar' }))
    await waitFor(() => expect(api.desbloquearEdicion).toHaveBeenCalled())
    expect(within(tarjeta).getByDisplayValue('Naranja')).toBeDisabled()
  })

  it('un PDF que no se pudo leer queda marcado y no se envía', async () => {
    api.analizarInformes.mockResolvedValue({
      disponible: true,
      items: [lectura('a.pdf', '', [], { leido: false, sold_to: '', especie: '', plan: null, error: 'No encontré el Sold To y el Ship To en este PDF.' })],
    })
    const { container } = pantalla()
    await subir(container, 'a.pdf')
    expect(await screen.findByText(/No se pudo leer el Sold To y el Ship To/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Enviar prueba' })).toBeDisabled()
  })

  it('si el servidor no tiene la lectura de PDF lo avisa', async () => {
    api.analizarInformes.mockResolvedValue({
      disponible: false,
      items: [lectura('a.pdf', '', [], { leido: false, sold_to: '', plan: null, error: 'Falta instalar pypdf en el servidor.' })],
    })
    const { container } = pantalla()
    await subir(container, 'a.pdf')
    expect(await screen.findByText(/falta instalar pypdf/)).toBeTruthy()
  })

  it('no sube dos veces el mismo archivo', async () => {
    const { container } = pantalla()
    await subir(container, 'a.pdf', 'b.pdf')
    await screen.findByText('a.pdf')
    await subir(container, 'a.pdf')
    expect(api.analizarInformes).toHaveBeenCalledTimes(1)
  })

  it('en producción confirma, con la lista de cada informe, antes de enviar a clientes', async () => {
    api.obtenerEstadoEnvio.mockResolvedValue(estado('produccion'))
    api.vistaPreviaInforme.mockResolvedValue(vista('produccion'))
    const { container } = pantalla()
    expect(await screen.findByRole('button', { name: /Sistema en producción/ })).toBeTruthy()
    await subir(container, 'a.pdf', 'b.pdf')

    fireEvent.click(await screen.findByRole('button', { name: 'Enviar a clientes (2)' }))
    expect(api.enviarInforme).not.toHaveBeenCalled()
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText('Para: b@dole.cl, b2@dole.cl')).toBeTruthy()
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Enviar a clientes' }))
    await waitFor(() => expect(api.enviarInforme).toHaveBeenCalledTimes(2))
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

  it('muestra la solicitud de la que sale la lista y avisa si usa el respaldo', async () => {
    api.analizarInformes.mockResolvedValue({
      disponible: true,
      items: [lectura('a.pdf', 'SAN FERNANDO', ['jorge@x.cl', 'claudia@x.cl'], {
        numero_solicitud: 'OT-AGF0075', solicitud: 'OT-AGF0075.xlsx',
        plan: { to: ['jorge@x.cl', 'claudia@x.cl'], cc: [], bcc: [], sin_lista: true, especies: [], origen: 'solicitud' },
      })],
    })
    const { container } = pantalla()
    await subir(container, 'a.pdf')
    expect(await screen.findByText(/OT-AGF0075 · DOLE · SAN FERNANDO/)).toBeTruthy()
    expect(screen.getByText(/no tiene lista de distribución del cliente: va a la lista de respaldo/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Enviar prueba' })).toBeEnabled()
  })

  describe('eliminar del historial', () => {
    const registro = {
      id: 7, creado_en: '2026-10-05T17:23:00Z', usuario_nombre: 'Jorge Sandoval', modo: 'prueba', laboratorio: 'AGROFRESH',
      sold_to: 'A.G. SERVICIOS SPA', ship_to: 'PLANTA GARCES MALLOA', especie: '', asunto: 'x', para: ['a@x.cl'], cc: [], bcc: [],
      enviado_to: ['psalazar@agrofresh.com'], adjuntos: [{ nombre: '801496_Pest (3).pdf', bytes: 10 }], exitoso: true, error: null,
    }

    it('Paz y los demás ven el historial pero no pueden borrarlo', async () => {
      api.historialEnvios.mockResolvedValue({ disponible: true, items: [registro] })
      pantalla()
      expect(await screen.findByText('PLANTA GARCES MALLOA')).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Eliminar registro' })).toBeNull()
    })

    it('el administrador principal borra uno con su clave, y se recarga el historial', async () => {
      sesion.user = { email: 'Jorge.Sandoval@agrofresh.com', tipoAcceso: 'admin_general' }
      api.historialEnvios.mockResolvedValue({ disponible: true, items: [registro] })
      api.eliminarRegistroEnvio.mockResolvedValue({ estado: 'eliminado' })
      verificarClave.mockResolvedValue(undefined)
      pantalla()
      fireEvent.click(await screen.findByRole('button', { name: 'Eliminar registro' }))
      const dialogo = await screen.findByRole('dialog')
      fireEvent.change(within(dialogo).getByPlaceholderText('Tu contraseña'), { target: { value: 'clave' } })
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar registro' }))

      await waitFor(() => expect(api.eliminarRegistroEnvio).toHaveBeenCalledWith(7))
      expect(verificarClave).toHaveBeenCalledWith('clave')
      await waitFor(() => expect(api.historialEnvios).toHaveBeenCalledTimes(2))
    })

    it('con una clave incorrecta no se borra nada', async () => {
      sesion.user = { email: 'jorge.sandoval@agrofresh.com', tipoAcceso: 'admin_general' }
      api.historialEnvios.mockResolvedValue({ disponible: true, items: [registro] })
      verificarClave.mockRejectedValue(new Error('no'))
      pantalla()
      fireEvent.click(await screen.findByRole('button', { name: 'Eliminar registro' }))
      const dialogo = await screen.findByRole('dialog')
      fireEvent.change(within(dialogo).getByPlaceholderText('Tu contraseña'), { target: { value: 'mala' } })
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar registro' }))
      expect(await within(dialogo).findByText('Contraseña incorrecta.')).toBeTruthy()
      expect(api.eliminarRegistroEnvio).not.toHaveBeenCalled()
    })
  })
})
