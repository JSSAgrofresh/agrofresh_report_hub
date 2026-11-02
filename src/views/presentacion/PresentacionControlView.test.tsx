import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PresentacionControlView } from './PresentacionControlView'
import type { RespuestaEstado } from '@/features/presentacion'

const api = vi.hoisted(() => ({
  estado: { datos: null as RespuestaEstado | null, error: null as string | null },
  enviarComando: vi.fn(),
  guardarNotaPresentacion: vi.fn(),
}))

vi.mock('@/features/presentacion', async (original) => ({
  ...(await original<typeof import('@/features/presentacion')>()),
  useEstadoPresentacion: () => api.estado,
  enviarComando: api.enviarComando,
  guardarNotaPresentacion: api.guardarNotaPresentacion,
}))

const activa = (estado: RespuestaEstado['estado'], notas: Record<string, string> = {}): RespuestaEstado => ({ activa: true, estado, seq: 3, notas })

describe('PresentacionControlView (el control remoto del teléfono)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.enviarComando.mockResolvedValue({ ok: true, seq: 1 })
    api.guardarNotaPresentacion.mockResolvedValue({ ok: true })
    api.estado = { datos: activa({ slide: 'indice' }), error: null }
  })
  afterEach(cleanup)

  it('sin la presentación abierta dice cómo abrirla y deja los botones apagados', () => {
    api.estado = { datos: { activa: false, estado: {}, seq: 0, notas: {} }, error: null }
    render(<PresentacionControlView />)
    expect(screen.getByText('Abre la presentación en tu computador')).toBeTruthy()
    expect((screen.getByRole('button', { name: /Adelante/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Sin presentación')).toBeTruthy()
  })

  it('con la presentación abierta muestra en cuál diapositiva va y avanza y retrocede', () => {
    render(<PresentacionControlView />)
    expect(screen.getByText('2 / 8')).toBeTruthy()
    expect(screen.getByText('Conectado')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Adelante/ }))
    expect(api.enviarComando).toHaveBeenCalledWith('siguiente', undefined)
    fireEvent.click(screen.getByRole('button', { name: /Atrás/ }))
    expect(api.enviarComando).toHaveBeenCalledWith('anterior', undefined)
  })

  it('al tocar «Adelante» muestra enseguida la que viene, sin esperar al computador', () => {
    render(<PresentacionControlView />)
    expect(screen.getByRole('heading', { level: 2, name: 'Índice' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Adelante/ }))
    expect(screen.getByRole('heading', { level: 2, name: 'Report Hub' })).toBeTruthy()
    expect(screen.getByText('3 / 8')).toBeTruthy()
  })

  it('si la orden falla vuelve a mostrar donde está de verdad', async () => {
    api.enviarComando.mockRejectedValue(new Error('La presentación no está abierta en tu computador.'))
    render(<PresentacionControlView />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Adelante/ })) })
    expect(screen.getByRole('heading', { level: 2, name: 'Índice' })).toBeTruthy()
  })

  it('en la primera no se puede retroceder y en la última no se puede avanzar', () => {
    api.estado = { datos: activa({ slide: 'portada' }), error: null }
    const { unmount } = render(<PresentacionControlView />)
    expect((screen.getByRole('button', { name: /Atrás/ }) as HTMLButtonElement).disabled).toBe(true)
    unmount()
    api.estado = { datos: activa({ slide: 'aporte' }), error: null }
    render(<PresentacionControlView />)
    expect((screen.getByRole('button', { name: /Adelante/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('salta a cualquier diapositiva', () => {
    render(<PresentacionControlView />)
    fireEvent.click(screen.getByRole('button', { name: /Los sistemas/ }))
    expect(api.enviarComando).toHaveBeenCalledWith('ir', { slide: 'sistemas' })
  })

  it('en «Report Hub» aparecen la simulación y los paneles; en otra diapositiva no', () => {
    const { unmount } = render(<PresentacionControlView />)
    expect(screen.queryByRole('region', { name: 'Simulación' })).toBeNull()
    unmount()
    api.estado = { datos: activa({ slide: 'viaje', sim: { playing: false, paso: 1, total: 8 }, nodo: 'B' }), error: null }
    render(<PresentacionControlView />)
    fireEvent.click(screen.getByRole('button', { name: /Simular/ }))
    expect(api.enviarComando).toHaveBeenCalledWith('simular', undefined)
    fireEvent.click(screen.getByRole('button', { name: /Paso →/ }))
    expect(api.enviarComando).toHaveBeenCalledWith('paso', { n: 2 })
    fireEvent.click(screen.getByRole('button', { name: 'Administrador general' }))
    expect(api.enviarComando).toHaveBeenCalledWith('nodo', { k: 'G' })
    fireEvent.click(screen.getByRole('button', { name: 'Qué viaja' }))
    expect(api.enviarComando).toHaveBeenCalledWith('pestana', { t: 'tok' })
  })

  it('mientras simula, el botón dice Pausar', () => {
    api.estado = { datos: activa({ slide: 'viaje', sim: { playing: true, paso: 0, total: 8 } }), error: null }
    render(<PresentacionControlView />)
    expect(screen.getByRole('button', { name: /Pausar/ })).toBeTruthy()
  })

  it('en «Por dentro» se activan los engranajes', () => {
    api.estado = { datos: activa({ slide: 'motor' }), error: null }
    render(<PresentacionControlView />)
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar resultados' }))
    expect(api.enviarComando).toHaveBeenCalledWith('engranaje', { k: 'report' })
  })

  it('abre y cierra el ecosistema, y lo pausa solo mientras está abierto', () => {
    const { unmount } = render(<PresentacionControlView />)
    expect(screen.queryByRole('button', { name: /Pausar/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir el ecosistema' }))
    expect(api.enviarComando).toHaveBeenCalledWith('eco', { abierto: true })
    unmount()
    api.estado = { datos: activa({ slide: 'indice', eco: true }), error: null }
    render(<PresentacionControlView />)
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar el ecosistema' }))
    expect(api.enviarComando).toHaveBeenCalledWith('eco', { abierto: false })
    fireEvent.click(screen.getByRole('button', { name: /Pausar/ }))
    expect(api.enviarComando).toHaveBeenCalledWith('pausa_eco', { pausa: true })
  })

  it('si el servidor rechaza la orden lo dice', async () => {
    api.enviarComando.mockRejectedValue(new Error('La presentación no está abierta en tu computador.'))
    render(<PresentacionControlView />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Adelante/ })) })
    expect((await screen.findByRole('alert')).textContent).toContain('no está abierta')
  })

  describe('notas', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('muestra la nota de la diapositiva, y la de la que sigue', () => {
      api.estado = { datos: activa({ slide: 'viaje' }, { viaje: 'Decir lo del loop', sistemas: 'Faltan los correos' }), error: null }
      render(<PresentacionControlView />)
      expect((screen.getByLabelText(/Nota para/) as HTMLTextAreaElement).value).toBe('Decir lo del loop')
      expect(screen.getByText(/Faltan los correos/)).toBeTruthy()
    })

    it('guarda lo que escribes, de a poco, y asociado a la diapositiva donde estás', async () => {
      render(<PresentacionControlView />)
      fireEvent.change(screen.getByLabelText(/Nota para/), { target: { value: 'Mencionar los 45 clientes' } })
      expect(api.guardarNotaPresentacion).not.toHaveBeenCalled()
      await act(async () => { vi.advanceTimersByTime(800) })
      expect(api.guardarNotaPresentacion).toHaveBeenCalledTimes(1)
      expect(api.guardarNotaPresentacion).toHaveBeenCalledWith('indice', 'Mencionar los 45 clientes')
    })
  })
})
