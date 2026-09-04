import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { NuevaSolicitudView } from './NuevaSolicitudView'
import type { AnalitoConfig, CampoConfig, Solicitud } from '@/features/tomaMuestras'

const {
  crearSolicitud,
  actualizarSolicitud,
  obtenerSolicitud,
  listarAnalitosConfig,
  listarCamposConfig,
  listarCamposTipoAplicacion,
  listarLaboratoriosConfig,
  listarProductosConfig,
  listarTiposAplicacion,
} = vi.hoisted(() => ({
  crearSolicitud: vi.fn(),
  actualizarSolicitud: vi.fn(),
  obtenerSolicitud: vi.fn(),
  listarAnalitosConfig: vi.fn(),
  listarCamposConfig: vi.fn(),
  listarCamposTipoAplicacion: vi.fn(),
  listarLaboratoriosConfig: vi.fn(),
  listarProductosConfig: vi.fn(),
  listarTiposAplicacion: vi.fn(),
}))

vi.mock('@/features/tomaMuestras', () => ({
  crearSolicitud,
  actualizarSolicitud,
  obtenerSolicitud,
  listarAnalitosConfig,
  listarCamposConfig,
  listarCamposTipoAplicacion,
  listarLaboratoriosConfig,
  listarProductosConfig,
  listarTiposAplicacion,
}))

vi.mock('@/features/catalogo', () => ({
  listarClientes: vi.fn().mockResolvedValue([]),
  listarPlantas: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/features/laboratorios', () => ({
  listarAnalisis: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/features/listados', () => ({
  listarEspeciesActivas: vi.fn().mockResolvedValue([]),
  listarVariedadesActivasDeEspecie: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/features/auth', () => ({
  useAuth: () => ({ user: { nombre: 'Juan', email: 'juan@example.com' } }),
}))

const CAMPOS_CONFIG: CampoConfig[] = [
  { clave: 'sold_to', etiqueta: 'Sold To', tipo: 'select', requerido: true, activo: true, orden: 1 },
  { clave: 'especie', etiqueta: 'Especie', tipo: 'text', requerido: true, activo: true, orden: 2 },
  { clave: 'tipo_muestra', etiqueta: 'Tipo Muestra', tipo: 'select', requerido: true, activo: true, orden: 3 },
  { clave: 'fecha_muestreo', etiqueta: 'Fecha Muestreo', tipo: 'date', requerido: true, activo: true, orden: 4 },
  { clave: 'nombre_muestreador', etiqueta: 'Nombre Muestreador', tipo: 'text', requerido: false, activo: true, orden: 5 },
  { clave: 'observacion', etiqueta: 'Observación', tipo: 'textarea', requerido: false, activo: true, orden: 6 },
]

const ANALITOS: AnalitoConfig[] = [
  { id: 1, laboratorio: 'AGROFRESH', categoria: 'Fungicidas', codigo: 'FDL', nombre: 'Fludioxonil', unidad: 'ppm', tipo: 'numero', dosis_aplicable: true, requerido: false, activo: true, orden: 1, tipo_aplicacion: '' },
  { id: 2, laboratorio: 'AGROFRESH', categoria: 'Fungicidas', codigo: 'PYR', nombre: 'Pirimetanil', unidad: 'ppm', tipo: 'numero', dosis_aplicable: true, requerido: false, activo: true, orden: 2, tipo_aplicacion: '' },
]

function solicitudBase(overrides: Partial<Solicitud> = {}): Solicitud {
  return {
    archivo: 'OT-0007.xlsx',
    numero_solicitud: 'OT-0007',
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
    tipo_muestra: 'Fruta',
    fecha_muestreo: '2026-09-01',
    hora_muestreo: null,
    nombre_muestreador: 'Pedro',
    generado_por: 'Juan',
    email_solicitante: 'juan@example.com',
    email_laboratorio: null,
    observacion: null,
    campos_laboratorio: {
      'Fludioxonil (ppm)': '25',
      'Pirimetanil (ppm)': '15',
      'Tipo Aplicación': 'Actimist',
    },
    analitos_solicitados: ['FDL', 'PYR'],
    creado_en: '2026-09-01T10:00:00+00:00',
    enviada: false,
    enviado_en: null,
    ...overrides,
  }
}

function mockConfigComun() {
  listarCamposConfig.mockResolvedValue(CAMPOS_CONFIG)
  listarLaboratoriosConfig.mockResolvedValue([
    { id: 1, codigo: 'AGROFRESH', nombre: 'AgroFresh', descripcion: null, activo: true, orden: 1 },
  ])
  listarTiposAplicacion.mockResolvedValue([{ id: 1, nombre: 'Actimist', activo: true, orden: 1 }])
  listarAnalitosConfig.mockResolvedValue(ANALITOS)
  listarProductosConfig.mockResolvedValue([])
  listarCamposTipoAplicacion.mockResolvedValue([])
}

describe('NuevaSolicitudView — crear (CASO 2: sin columna "Analito" redundante)', () => {
  it('la tabla de analitos no tiene columna "Analito", solo checkbox + código + dosis', async () => {
    mockConfigComun()
    render(
      <MemoryRouter initialEntries={['/nueva']}>
        <Routes>
          <Route path="/nueva" element={<NuevaSolicitudView />} />
        </Routes>
      </MemoryRouter>,
    )

    // Elegir laboratorio y tipo de aplicación para que aparezca la tabla.
    await waitFor(() => expect(screen.getByText('AgroFresh')).toBeTruthy())
    fireEvent.change(screen.getByLabelText(/Laboratorio/), { target: { value: 'AGROFRESH' } })
    fireEvent.change(screen.getByLabelText(/Tipo de Aplicación/), { target: { value: 'Actimist' } })

    await waitFor(() => expect(screen.getByText('FDL')).toBeTruthy())

    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent)
    expect(headers).not.toContain('Analito')
    expect(headers).toContain('Código')

    const filaFDL = screen.getByText('FDL').closest('tr')!
    expect(within(filaFDL).getByRole('checkbox')).toBeTruthy()
    expect(within(filaFDL).getByRole('textbox')).toBeTruthy()
    // El nombre completo ya no es una columna visible.
    expect(screen.queryByText('Fludioxonil')).toBeNull()
  })
})

describe('NuevaSolicitudView — editar (CASO 3 y 4)', () => {
  it('precarga los datos y, al guardar, actualiza el mismo folio (no crea uno nuevo)', async () => {
    mockConfigComun()
    const solicitud = solicitudBase()
    obtenerSolicitud.mockResolvedValue(solicitud)
    actualizarSolicitud.mockResolvedValue(solicitud)

    render(
      <MemoryRouter initialEntries={[`/editar/${solicitud.archivo}`]}>
        <Routes>
          <Route path="/editar/:archivo" element={<NuevaSolicitudView modo="editar" />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByDisplayValue('OT-0007')).toBeTruthy())
    // Los analitos que traía la solicitud quedan marcados.
    await waitFor(() => expect(screen.getByDisplayValue('25')).toBeTruthy())
    expect(screen.getByDisplayValue('15')).toBeTruthy()

    fireEvent.click(screen.getByText('Guardar cambios'))

    await waitFor(() => expect(actualizarSolicitud).toHaveBeenCalledTimes(1))
    const [archivoLlamado, payload] = actualizarSolicitud.mock.calls[0]
    expect(archivoLlamado).toBe('OT-0007.xlsx')
    expect(payload.analitos_solicitados).toEqual(['FDL', 'PYR'])
    expect(crearSolicitud).not.toHaveBeenCalled()
  })

  it('una solicitud ya enviada se muestra de solo lectura, sin formulario editable (CASO 5)', async () => {
    mockConfigComun()
    const solicitud = solicitudBase({ enviada: true, enviado_en: '2026-09-02T10:00:00+00:00' })
    obtenerSolicitud.mockResolvedValue(solicitud)

    render(
      <MemoryRouter initialEntries={[`/editar/${solicitud.archivo}`]}>
        <Routes>
          <Route path="/editar/:archivo" element={<NuevaSolicitudView modo="editar" />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText(/ya fue enviada/)).toBeTruthy())
    expect(screen.queryByText('Guardar cambios')).toBeNull()
  })
})
