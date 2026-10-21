import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { SolicitudDetalleView } from './SolicitudDetalleView'
import type { AnalitoConfig, Solicitud } from '@/features/tomaMuestras'
import { AuthContext } from '@/features/auth/context/AuthContext'

const { obtenerSolicitud, listarAnalitosConfig, destinatariosDeSolicitud, listarFotosSolicitud, enviarSolicitudPorCorreo, obtenerEnvioAutomatico } = vi.hoisted(() => ({
  obtenerSolicitud: vi.fn(),
  listarAnalitosConfig: vi.fn(),
  destinatariosDeSolicitud: vi.fn(),
  listarFotosSolicitud: vi.fn(),
  enviarSolicitudPorCorreo: vi.fn(),
  obtenerEnvioAutomatico: vi.fn(),
}))

vi.mock('@/features/tomaMuestras', async () => ({
  obtenerSolicitud,
  listarAnalitosConfig,
  destinatariosDeSolicitud,
  listarFotosSolicitud,
  descargarExcelSolicitud: vi.fn(),
  descargarPdfSolicitud: vi.fn(),
  descargarJsonSolicitud: vi.fn(),
  enviarSolicitudPorCorreo,
  subirFotoSolicitud: vi.fn(),
  eliminarFotoSolicitud: vi.fn(),
  obtenerFotoSolicitud: vi.fn(),
  resultadosDeShipTo: vi.fn().mockResolvedValue([]),
  listarLaboratoriosConfig: vi.fn().mockResolvedValue([]),
  obtenerEnvioAutomatico,
  puedeEditarSegunEnvio: (await vi.importActual<typeof import('@/features/tomaMuestras/lib/envioAutomatico')>('@/features/tomaMuestras/lib/envioAutomatico'))
    .puedeEditarSegunEnvio,
}))

const ANALITOS: AnalitoConfig[] = [
  { id: 1, laboratorio: 'AGROFRESH', categoria: 'Fungicidas', codigo: 'FDL', nombre: 'Fludioxonil', unidad: 'ppm', tipo: 'numero', dosis_aplicable: true, requerido: false, activo: true, orden: 1, tipo_aplicacion: '' },
  { id: 2, laboratorio: 'AGROFRESH', categoria: 'Fungicidas', codigo: 'PYR', nombre: 'Pirimetanil', unidad: 'ppm', tipo: 'numero', dosis_aplicable: true, requerido: false, activo: true, orden: 2, tipo_aplicacion: '' },
  { id: 3, laboratorio: 'AGROFRESH', categoria: 'Fungicidas', codigo: 'TEBU', nombre: 'Tebuconazol', unidad: 'ppm', tipo: 'numero', dosis_aplicable: true, requerido: false, activo: true, orden: 3, tipo_aplicacion: '' },
]

function solicitudBase(overrides: Partial<Solicitud> = {}): Solicitud {
  return {
    archivo: 'OT-0001.xlsx',
    numero_solicitud: 'OT-0001',
    fecha_solicitud: '2026-09-01',
    laboratorio: 'AGROFRESH',
    solicitante: 'AGROFRESH',
    sold_to: 'Cliente X',
    ship_to: null,
    especie: 'Cerezas',
    variedad: null,
    linea_proceso: null,
    csg_productor: null,
    csg_packing: null,
    lote: null,
    posicion_muestreo: null,
    numero_camara: null,
    numero_orden: null,
    kilos_procesados: null,
    producto_utilizado: null,
    tipo_muestra: null,
    fecha_muestreo: null,
    hora_muestreo: null,
    nombre_muestreador: null,
    generado_por: 'Juan',
    email_solicitante: null,
    email_laboratorio: null,
    observacion: null,
    campos_laboratorio: {
      'Fludioxonil (ppm)': '25',
      'Pirimetanil (ppm)': '15',
      'Tebuconazol (ppm)': 'Solicitado',
      'Tipo Aplicación': 'Actimist',
    },
    analitos_solicitados: ['FDL', 'PYR', 'TEBU'],
    creado_en: '2026-09-01T10:00:00+00:00',
    enviada: false,
    enviado_en: null,
    tipo_solicitud: 'CONVENCIONAL',
    solicitud_original_archivo: null,
    motivo_reanalisis: null,
    ...overrides,
  }
}

const ADMIN = { id: '1', nombre: 'Jorge', email: 'j@agrofresh.com', tipoAcceso: 'admin_general' }

function montar(solicitud: Solicitud, user: Record<string, unknown> = ADMIN) {
  obtenerSolicitud.mockResolvedValue(solicitud)
  // Línea de proceso se envía sola; Actimist se guarda y se envía a mano.
  obtenerEnvioAutomatico.mockResolvedValue({ activo: true, por_tipo: { Actimist: false } })
  listarAnalitosConfig.mockResolvedValue(ANALITOS)
  destinatariosDeSolicitud.mockResolvedValue({ laboratorio: solicitud.laboratorio, destinatarios: [] })
  listarFotosSolicitud.mockResolvedValue([])
  const valor = { user, login: async () => {}, logout: async () => {}, refrescar: async () => {}, sincronizando: false }
  return render(
    <AuthContext.Provider value={valor as never}>
      <MemoryRouter initialEntries={[`/solicitud/${solicitud.archivo}`]}>
        <Routes>
          <Route path="/solicitud/:archivo" element={<SolicitudDetalleView />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('SolicitudDetalleView — Analitos solicitados', () => {
  it('muestra cada analito solicitado con su propia dosis (CASO 1)', async () => {
    montar(solicitudBase())

    await waitFor(() => expect(screen.getByText('Dosis: 25')).toBeTruthy())

    expect(screen.getByText('FDL')).toBeTruthy()
    expect(screen.getByText('Dosis: 15')).toBeTruthy()
    // Solicitado pero sin dosis anotada: no debe mostrar la palabra
    // "Solicitado" como si fuera una dosis real.
    expect(screen.getByText('TEBU')).toBeTruthy()
    expect(screen.getByText('Dosis: —')).toBeTruthy()
  })

  it('un analito no pedido no aparece en la sección', async () => {
    montar(solicitudBase({ analitos_solicitados: ['FDL'], campos_laboratorio: { 'Fludioxonil (ppm)': '25' } }))
    await waitFor(() => expect(screen.getByText('Dosis: 25')).toBeTruthy())
    expect(screen.queryByText('PYR')).toBeNull()
  })
})

describe('SolicitudDetalleView — bloqueo tras enviar (CASO 5)', () => {
  it('una solicitud no enviada muestra Editar y Enviar por correo', async () => {
    montar(solicitudBase({ enviada: false }))
    await waitFor(() => expect(screen.getByText('Editar')).toBeTruthy())
    expect(screen.getByText('Enviar por correo')).toBeTruthy()
  })

  it('una solicitud ya enviada muestra Editar y cambia "Enviar" a "Reenviar"', async () => {
    montar(solicitudBase({ enviada: true, enviado_en: '2026-09-02T10:00:00+00:00' }))
    await waitFor(() => expect(screen.getByText(/Enviada/)).toBeTruthy())
    expect(screen.getByText('Editar')).toBeTruthy()
    expect(screen.getByText('Reenviar por correo')).toBeTruthy()
    expect(screen.queryByText('Enviar por correo')).toBeNull()
  })
})

describe('SolicitudDetalleView — quién puede editar', () => {
  const area = (modulos: string[]) => ({ id: '2', nombre: 'Ana', email: 'a@agrofresh.com', tipoAcceso: 'admin_area', area: 'cromatografia', modulos })

  it('sin la función «Editar solicitudes» no sale el botón Editar', async () => {
    montar(solicitudBase(), area(['toma_muestras']))
    await waitFor(() => expect(screen.getByText('Enviar por correo')).toBeTruthy())
    expect(screen.queryByText('Editar')).toBeNull()
  })

  it('con la función y un tipo que se guarda y se envía a mano (Actimist), sale Editar', async () => {
    montar(solicitudBase(), area(['toma_muestras', 'toma_editar']))
    await waitFor(() => expect(screen.getByText('Editar')).toBeTruthy())
  })

  it('con la función pero un tipo que se envía solo (Línea de proceso), no sale Editar', async () => {
    montar(
      solicitudBase({ campos_laboratorio: { 'Fludioxonil (ppm)': '25', 'Tipo Aplicación': 'Línea de proceso' } }),
      area(['toma_muestras', 'toma_editar']),
    )
    await waitFor(() => expect(obtenerEnvioAutomatico).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByText('Enviar por correo')).toBeTruthy())
    expect(screen.queryByText('Editar')).toBeNull()
  })
})

describe('SolicitudDetalleView — envío de una solicitud de prueba', () => {
  it('por defecto se envía solo a quien envía, sin la lista real', async () => {
    enviarSolicitudPorCorreo.mockResolvedValue({ ok: 'enviada' })
    montar(solicitudBase({ es_prueba: true }))
    fireEvent.click(await screen.findByText('Enviar por correo'))
    fireEvent.click(await screen.findByText('Enviarme a mí'))
    await waitFor(() => expect(enviarSolicitudPorCorreo).toHaveBeenCalledWith('OT-0001.xlsx', [], true))
  })

  it('desmarcando la opción vuelve al envío normal', async () => {
    enviarSolicitudPorCorreo.mockClear()
    enviarSolicitudPorCorreo.mockResolvedValue({ ok: 'enviada' })
    montar(solicitudBase({ es_prueba: true }))
    destinatariosDeSolicitud.mockResolvedValue({ laboratorio: 'AGROFRESH', destinatarios: ['lab@x.cl'] })
    fireEvent.click(await screen.findByText('Enviar por correo'))
    fireEvent.click(await screen.findByLabelText(/solo a mí o a quien escriba/i))
    fireEvent.click(await screen.findByText('Enviar a 1 contacto'))
    await waitFor(() => expect(enviarSolicitudPorCorreo).toHaveBeenCalledWith('OT-0001.xlsx', [], false))
  })

  it('una solicitud real no ofrece la opción', async () => {
    montar(solicitudBase())
    fireEvent.click(await screen.findByText('Enviar por correo'))
    await screen.findByText(/Contactos configurados/)
    expect(screen.queryByLabelText(/solo a mí o a quien escriba/i)).toBeNull()
  })
})
