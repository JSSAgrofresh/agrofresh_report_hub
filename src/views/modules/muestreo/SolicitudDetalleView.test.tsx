import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { SolicitudDetalleView } from './SolicitudDetalleView'
import type { AnalitoConfig, Solicitud } from '@/features/tomaMuestras'

const { obtenerSolicitud, listarAnalitosConfig, destinatariosDeSolicitud } = vi.hoisted(() => ({
  obtenerSolicitud: vi.fn(),
  listarAnalitosConfig: vi.fn(),
  destinatariosDeSolicitud: vi.fn(),
}))

vi.mock('@/features/tomaMuestras', () => ({
  obtenerSolicitud,
  listarAnalitosConfig,
  destinatariosDeSolicitud,
  descargarExcelSolicitud: vi.fn(),
  descargarPdfSolicitud: vi.fn(),
  enviarSolicitudPorCorreo: vi.fn(),
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
    csg: null,
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
    ...overrides,
  }
}

function montar(solicitud: Solicitud) {
  obtenerSolicitud.mockResolvedValue(solicitud)
  listarAnalitosConfig.mockResolvedValue(ANALITOS)
  destinatariosDeSolicitud.mockResolvedValue({ laboratorio: solicitud.laboratorio, destinatarios: [] })
  return render(
    <MemoryRouter initialEntries={[`/solicitud/${solicitud.archivo}`]}>
      <Routes>
        <Route path="/solicitud/:archivo" element={<SolicitudDetalleView />} />
      </Routes>
    </MemoryRouter>,
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

  it('una solicitud ya enviada NO muestra Editar ni Enviar por correo', async () => {
    montar(solicitudBase({ enviada: true, enviado_en: '2026-09-02T10:00:00+00:00' }))
    await waitFor(() => expect(screen.getByText(/Enviada/)).toBeTruthy())
    expect(screen.queryByText('Editar')).toBeNull()
    expect(screen.queryByText('Enviar por correo')).toBeNull()
  })
})
