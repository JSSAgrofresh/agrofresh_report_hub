import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { VerificacionesView } from './VerificacionesView'
import type { ConfigVerificaciones, Registro } from '@/features/verificaciones'

/**
 * El formulario del día.
 *
 * Lo que se prueba acá es lo que el cálculo puro no puede: que la pantalla
 * pinte el veredicto mientras se escribe, que el botón de guardar no se
 * encienda hasta que haya algo que guardar, y que lo que se manda al servidor
 * sea lo que está en pantalla.
 */

const { obtenerConfig, obtenerRegistro, guardarRegistro, eliminarRegistro } = vi.hoisted(() => ({
  obtenerConfig: vi.fn(),
  obtenerRegistro: vi.fn(),
  guardarRegistro: vi.fn(),
  eliminarRegistro: vi.fn(),
}))

vi.mock('@/features/verificaciones', async (original) => ({
  // El cálculo NO se simula: es justamente lo que da los colores de la
  // pantalla, y simularlo dejaría la prueba mirando un mock.
  ...(await original<typeof import('@/features/verificaciones')>()),
  obtenerConfig,
  obtenerRegistro,
  guardarRegistro,
  eliminarRegistro,
  descargarDiaExcel: vi.fn(),
  descargarDiaPdf: vi.fn(),
}))

vi.mock('@/features/auth', () => ({
  useAuth: () => ({ user: { id: '1', email: 'p@a.com', nombre: 'Paz', tipoAcceso: 'admin_general' } }),
}))

const CONFIG: ConfigVerificaciones = {
  micropipetas: [
    { id: 1, nombre: 'Microman E1000', codigo: '', volumen_nominal: 900, tolerancia: 8, orden: 1, activo: true },
  ],
  pesas: [{ id: 1, nombre: '1 g', codigo: '', valor_nominal: 1, tolerancia: 0.03, orden: 1, activo: true }],
  puntos_temperatura: [
    { id: 1, nombre: 'Sala de laboratorio 1', codigo: '', minimo: 15, maximo: 25, orden: 1, activo: true },
    { id: 2, nombre: 'Sala de laboratorio 2', codigo: '', minimo: 15, maximo: 25, orden: 2, activo: true },
  ],
  gases: [{ id: 1, nombre: 'Helio BIP', codigo: '', orden: 1, activo: true }],
  parametros: [
    { clave: 'gas_presion_contenido_min', valor: 200, descripcion: '', unidad: 'psi', orden: 1 },
    { clave: 'gas_presion_trabajo_min', valor: 80, descripcion: '', unidad: 'psi', orden: 2 },
    { clave: 'gas_presion_trabajo_max', valor: 120, descripcion: '', unidad: 'psi', orden: 3 },
    { clave: 'perla_voltaje_min', valor: 0, descripcion: '', unidad: 'V', orden: 4 },
    { clave: 'perla_voltaje_max', valor: 1, descripcion: '', unidad: 'V', orden: 5 },
    { clave: 'output_min', valor: 19, descripcion: '', unidad: '', orden: 6 },
    { clave: 'output_max', valor: 22, descripcion: '', unidad: '', orden: 7 },
  ],
  tabla_z: [{ temperatura: 20, factor: 1.0026 }],
}

function pintar() {
  return render(
    <MemoryRouter>
      <VerificacionesView />
    </MemoryRouter>,
  )
}

/** Escribir en un campo. `fireEvent.change` en vez de `userEvent` porque el
 * proyecto no trae `@testing-library/user-event` y para un input controlado el
 * evento de cambio es exactamente lo que el componente escucha. */
function escribir(campo: HTMLElement, valor: string) {
  fireEvent.change(campo, { target: { value: valor } })
}

/** La fila de la tabla que empieza con este texto. */
function fila(texto: string): HTMLElement {
  return screen.getByRole('row', { name: new RegExp(texto) })
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  obtenerConfig.mockResolvedValue(CONFIG)
  obtenerRegistro.mockResolvedValue(null)
  guardarRegistro.mockImplementation(
    async (fecha: string): Promise<Registro> => ({
      fecha,
      temperatura_agua: null,
      factor_z: null,
      fugas_visibles: '',
      fugas_observacion: '',
      resultado_fugas: '',
      observaciones: '',
      revisado_por: '',
      analista: '',
      editado_por: null,
      editado_en: null,
      observacion_edicion: '',
      creado_por: 'Paz',
      actualizado_en: '2026-09-01T12:00:00Z',
      micropipetas: [],
      balanza: [],
      temperaturas: [],
      gases: [],
      inyector: {
        analista: '', limpieza_aguja: '', aguja_danada: '', aguja_reemplazada: '',
        cambio_septa: '', observaciones: '', resultado: '', metodo_nombre: '', observacion: '',
      },
      detector: {
        analista: '', voltaje_perla: null, metodo_correcto: '', metodo_nombre: '',
        output_detector: null, resultado_voltaje: '', resultado_metodo: '',
        resultado_output: '', resultado: '', observacion: '',
      },
      resultados_seccion: {
        micropipetas: '', balanza: '', temperatura: '', gases: '', inyector: '', detector: '',
      },
      resultado: 'Sin datos',
    }),
  )
  eliminarRegistro.mockResolvedValue({ estado: 'eliminado' })
})

describe('VerificacionesView', () => {
  it('dibuja una fila por cada equipo del catálogo', async () => {
    pintar()
    expect(await screen.findByText('Microman E1000')).toBeInTheDocument()
    expect(screen.getByText('Sala de laboratorio 1')).toBeInTheDocument()
    expect(screen.getByText('Sala de laboratorio 2')).toBeInTheDocument()
    expect(screen.getByText('Helio BIP')).toBeInTheDocument()
  })

  it('un día sin nada llenado dice "Sin datos"', async () => {
    pintar()
    expect(await screen.findByText('Sin datos')).toBeInTheDocument()
  })

  it('marca la temperatura fuera de rango mientras se escribe, sin guardar', async () => {
    pintar()
    await screen.findByText('Sala de laboratorio 1')

    const celdas = within(fila('Sala de laboratorio 1')).getAllByRole('spinbutton')
    escribir(celdas[0], '30')

    await waitFor(() =>
      expect(within(fila('Sala de laboratorio 1')).getByText('No aceptable')).toBeInTheDocument(),
    )
    expect(guardarRegistro).not.toHaveBeenCalled()
  })

  it('calcula el factor Z desde la temperatura del agua', async () => {
    pintar()
    await screen.findByText('Microman E1000')

    escribir(screen.getByLabelText('Temp. agua (°C)'), '20')

    expect(await screen.findByText('1.0026')).toBeInTheDocument()
  })

  it('no deja guardar hasta que hay algo que guardar', async () => {
    pintar()
    await screen.findByText('Microman E1000')

    const guardar = screen.getByRole('button', { name: 'Guardar el día' })
    expect(guardar).toBeDisabled()

    escribir(screen.getByLabelText('Temp. agua (°C)'), '20')
    expect(guardar).toBeEnabled()
  })

  it('manda al servidor lo que está en pantalla', async () => {
    pintar()
    await screen.findByText('Microman E1000')

    escribir(screen.getByLabelText('Temp. agua (°C)'), '20')
    const pesos = within(fila('Microman E1000')).getAllByRole('spinbutton')
    escribir(pesos[0], '900')
    escribir(pesos[1], '900')
    escribir(pesos[2], '900')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar el día' }))

    await waitFor(() => expect(guardarRegistro).toHaveBeenCalledTimes(1))
    const [, enviado] = guardarRegistro.mock.calls[0]
    expect(enviado.temperatura_agua).toBe(20)
    expect(enviado.micropipetas[0]).toMatchObject({
      micropipeta_id: 1,
      peso_1: 900,
      peso_2: 900,
      peso_3: 900,
    })
  })

  it('abre el día que ya estaba guardado, no una hoja en blanco', async () => {
    obtenerRegistro.mockResolvedValue({
      ...(await guardarRegistro('2026-09-01')),
      temperatura_agua: 20,
      revisado_por: 'Romina Garrido',
      micropipetas: [
        {
          micropipeta_id: 1, analista: 'Paz Salazar',
          // pesos en gramos: 0.9 g × 1000 × 1.0026 ≈ 902.34 µL → Aceptable (nominal 900, tol 8)
          peso_1: 0.9, peso_2: 0.9, peso_3: 0.9,
          nombre: 'Microman E1000', volumen_nominal: 900, tolerancia: 8,
          volumen_medio: 902.34, desviacion: 2.34, error_pct: 0.26, resultado: 'Aceptable',
          observacion: '',
        },
      ],
    })
    pintar()

    expect(await screen.findByDisplayValue('Romina Garrido')).toBeInTheDocument()
    expect(within(fila('Microman E1000')).getByText('Aceptable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar el día' })).toBeDisabled()
  })

  it('permite eliminar un día ya guardado después de confirmarlo', async () => {
    obtenerRegistro.mockResolvedValue(await guardarRegistro('2026-09-01'))
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true)
    pintar()

    await screen.findByText(/Guardado/)
    const limpiar = screen.getByRole('button', { name: 'Limpiar registro' })
    expect(limpiar).toBeEnabled()
    fireEvent.click(limpiar)

    await waitFor(() => expect(eliminarRegistro).toHaveBeenCalledTimes(1))
    expect(screen.getByText('Este día todavía no se ha guardado')).toBeInTheDocument()
    confirmar.mockRestore()
  })

  it('muestra el factor Z al seleccionar una temperatura del dropdown', async () => {
    // La temperatura es ahora un <select> con los valores de tabla_z (15-35°C).
    // Seleccionar 20°C muestra el factor Z 1.0026 (del CONFIG mock).
    pintar()
    await screen.findByText('Microman E1000')

    const select = screen.getByLabelText('Temp. agua (°C)')
    fireEvent.change(select, { target: { value: '20' } })

    expect(await screen.findByText('1.0026')).toBeInTheDocument()
  })
})
