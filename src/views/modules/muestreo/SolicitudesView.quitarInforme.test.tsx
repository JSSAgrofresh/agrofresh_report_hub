import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SolicitudesView } from './SolicitudesView'

const api = vi.hoisted(() => ({
  listarSolicitudes: vi.fn(),
  listarInformesDeSolicitudes: vi.fn(),
  quitarInformeDeSolicitud: vi.fn(),
  obtenerEnvioAutomatico: vi.fn(),
  estadoSolicitudesPrueba: vi.fn(),
  listarTiposAplicacion: vi.fn(),
}))
vi.mock('@/features/tomaMuestras', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/tomaMuestras')>()),
  ...api,
}))

const sesion = vi.hoisted(() => ({ user: null as { email: string; tipoAcceso: string; nombre: string } | null }))
vi.mock('@/features/auth', () => ({ useAuth: () => ({ user: sesion.user }) }))
vi.mock('@/features/auth/api/authApi', () => ({ verificarClave: vi.fn().mockResolvedValue(undefined) }))

const solicitud = (archivo: string, numero: string) => ({
  archivo, numero_solicitud: numero, laboratorio: 'QUITECA', solicitante: 'AGROFRESH', sold_to: 'EXPORTADORA ERFRUT LTDA',
  ship_to: 'FRIGORIFICO CHIMBARONGO', especie: 'Manzana', fecha_solicitud: '05-10-2026', creado_en: '2026-10-05T10:00:00',
  enviada: true, generado_por: 'J', es_prueba: false, campos_laboratorio: { 'Tipo Aplicación': 'Ecofog' },
})
const informe = { nro_informe: '2026-1907-PC', numeros: ['2026-1907-PC'], pdf_guardado: true, en_report: true }

function montar() {
  render(<MemoryRouter><SolicitudesView /></MemoryRouter>)
}

describe('Solicitudes e informes: quitar el informe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sesion.user = { email: 'jorge.sandoval@agrofresh.com', tipoAcceso: 'admin_general', nombre: 'Jorge' }
    api.listarSolicitudes.mockResolvedValue([solicitud('a.xlsx', 'OT-QUI0048'), solicitud('b.xlsx', 'OT-QUI0049')])
    api.listarInformesDeSolicitudes.mockResolvedValue({ 'a.xlsx': informe })
    api.obtenerEnvioAutomatico.mockResolvedValue({ activo: false, por_tipo: {} })
    api.estadoSolicitudesPrueba.mockResolvedValue({ permitido: false })
    api.listarTiposAplicacion.mockResolvedValue([])
  })

  it('el botón aparece solo en la solicitud que tiene informe', async () => {
    montar()
    expect(await screen.findAllByLabelText('Quitar informe')).toHaveLength(2)   // tabla + tarjeta de celular de a.xlsx
    expect(screen.getAllByLabelText('Eliminar').length).toBeGreaterThanOrEqual(2)
    expect(api.quitarInformeDeSolicitud).not.toHaveBeenCalled()
  })

  it('pide la contraseña, la manda al servidor y avisa lo que se borró', async () => {
    api.quitarInformeDeSolicitud.mockResolvedValue({
      estado: 'quitado', informes: ['2026-1907-PC'], solicitudes_report: 1, resultados: 1, productos: 1,
      pendientes: 0, pdf_borrados: 2, pdf_no_borrados: 0,
    })
    montar()
    fireEvent.click((await screen.findAllByLabelText('Quitar informe'))[0])
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText(/La solicitud no se toca/)).toBeTruthy()
    fireEvent.change(within(dialogo).getByLabelText('Ingresa tu contraseña para confirmar'), { target: { value: 'mi-clave' } })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Quitar informe' }))
    await waitFor(() => expect(api.quitarInformeDeSolicitud).toHaveBeenCalledWith('a.xlsx', 'mi-clave'))
    expect(await screen.findByText(/1 resultados y 1 registro\(s\) de Report borrados/)).toBeTruthy()
  })

  it('quien no es el administrador principal no ve el botón', async () => {
    sesion.user = { email: 'otra.persona@agrofresh.com', tipoAcceso: 'admin_general', nombre: 'Otra' }
    montar()
    await screen.findAllByText('OT-QUI0048')
    expect(screen.queryByLabelText('Quitar informe')).toBeNull()
  })
})
