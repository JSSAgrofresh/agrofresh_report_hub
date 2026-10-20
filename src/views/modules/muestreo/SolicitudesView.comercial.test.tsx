import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { SolicitudesView } from './SolicitudesView'

const api = vi.hoisted(() => ({
  listarSolicitudes: vi.fn(),
  listarInformesDeSolicitudes: vi.fn(),
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
vi.mock('@/views/modules/storage/VistaPrevia', () => ({ VistaPrevia: () => <p>VISTA PREVIA DEL PDF</p> }))

const solicitud = (archivo: string, numero: string) => ({
  archivo, numero_solicitud: numero, laboratorio: 'QUITECA', solicitante: 'AGROFRESH', sold_to: 'DOLE',
  ship_to: 'DOLE LONTUE', especie: 'Cereza', fecha_solicitud: '05-10-2026', creado_en: '2026-10-05T10:00:00',
  enviada: true, generado_por: 'J', es_prueba: false, campos_laboratorio: { 'Tipo Aplicación': 'Línea de proceso' },
})

function montar() {
  render(
    <MemoryRouter initialEntries={['/lista']}>
      <Routes>
        <Route path="/lista" element={<SolicitudesView />} />
        <Route path="*" element={<p>PANTALLA DE DETALLE</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Solicitudes e informes para un comercial (solo lectura)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    api.listarSolicitudes.mockResolvedValue([solicitud('a.xlsx', 'OT-QUI0048')])
    api.listarInformesDeSolicitudes.mockResolvedValue({})
    api.obtenerEnvioAutomatico.mockResolvedValue({ activo: false, por_tipo: {} })
    api.estadoSolicitudesPrueba.mockResolvedValue({ permitido: false })
    api.listarTiposAplicacion.mockResolvedValue([])
  })

  it('un administrador ve «Nueva solicitud» y abre el detalle', async () => {
    sesion.user = { email: 'a@agrofresh.com', tipoAcceso: 'admin_general', nombre: 'A' }
    montar()
    expect(await screen.findByRole('button', { name: '+ Nueva solicitud' })).toBeTruthy()
    fireEvent.click((await screen.findAllByLabelText('Ver OT-QUI0048'))[0])
    expect(await screen.findByText('PANTALLA DE DETALLE')).toBeTruthy()
  })

  it('un comercial no puede crear, y «Ver» abre el PDF en vez del detalle editable', async () => {
    sesion.user = { email: 'c@agrofresh.com', tipoAcceso: 'comercial', nombre: 'C' }
    montar()
    await screen.findAllByLabelText('Ver OT-QUI0048')
    expect(screen.queryByRole('button', { name: '+ Nueva solicitud' })).toBeNull()
    fireEvent.click(screen.getAllByLabelText('Ver OT-QUI0048')[0])
    expect(await screen.findByText('VISTA PREVIA DEL PDF')).toBeTruthy()
    expect(screen.queryByText('PANTALLA DE DETALLE')).toBeNull()
  })

  it('con una solicitud elegida solo ofrece descargar: sin enviar, JSON ni marcar envíos', async () => {
    sesion.user = { email: 'c@agrofresh.com', tipoAcceso: 'comercial', nombre: 'C' }
    montar()
    fireEvent.click((await screen.findAllByLabelText('Seleccionar OT-QUI0048'))[0])
    expect(await screen.findByRole('button', { name: /PDF \(\.zip\)/ })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /Excel/ }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /JSON \(\.zip\)/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Excel \(\.zip\)/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Excel zip \+ conversor/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Enviar pendientes/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Marcar enviado al cliente/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Quitar envío/ })).toBeNull()
  })
})
