import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { useRef } from 'react'
import { usePresentacionPC } from './usePresentacionPC'

const api = vi.hoisted(() => ({ sincronizarPresentacion: vi.fn(), cerrarPresentacion: vi.fn() }))
vi.mock('../api', () => api)

function Prueba({ alRender }: { alRender: (r: ReturnType<typeof usePresentacionPC>) => void }) {
  const marco = useRef<HTMLIFrameElement>(null)
  alRender(usePresentacionPC(marco))
  return <iframe ref={marco} title="deck" />
}

const tick = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }

describe('usePresentacionPC (el computador)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    api.sincronizarPresentacion.mockResolvedValue({ comandos: [], seq: 5, control_conectado: false })
    api.cerrarPresentacion.mockResolvedValue({ ok: true })
  })
  afterEach(() => { cleanup(); vi.useRealTimers() })

  it('al abrir no ejecuta las órdenes viejas (desde = -1) y después pide solo lo nuevo', async () => {
    render(<Prueba alRender={() => undefined} />)
    await tick(10)
    expect(api.sincronizarPresentacion).toHaveBeenNthCalledWith(1, null, -1)
    await tick(1000)
    expect(api.sincronizarPresentacion).toHaveBeenNthCalledWith(2, null, 5)
  })

  it('le cuenta al servidor lo que muestra la presentación', async () => {
    const { container } = render(<Prueba alRender={() => undefined} />)
    const marco = container.querySelector('iframe') as HTMLIFrameElement
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { tipo: 'estado', estado: { slide: 'viaje' } }, origin: window.location.origin, source: marco.contentWindow }))
    })
    await tick(1000)
    expect(api.sincronizarPresentacion).toHaveBeenLastCalledWith({ slide: 'viaje' }, expect.any(Number))
  })

  it('cuando la presentación cambia de estado se lo cuenta al servidor enseguida, sin esperar el latido', async () => {
    const { container } = render(<Prueba alRender={() => undefined} />)
    await tick(10)
    api.sincronizarPresentacion.mockClear()
    const marco = container.querySelector('iframe') as HTMLIFrameElement
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { tipo: 'estado', estado: { slide: 'indice' } }, origin: window.location.origin, source: marco.contentWindow }))
    })
    await tick(300)
    expect(api.sincronizarPresentacion).toHaveBeenCalledTimes(1)
    expect(api.sincronizarPresentacion).toHaveBeenCalledWith({ slide: 'indice' }, expect.any(Number))
  })

  it('ignora mensajes que no vienen de la presentación', async () => {
    render(<Prueba alRender={() => undefined} />)
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { tipo: 'estado', estado: { slide: 'hackeado' } }, origin: 'https://otro.sitio', source: window }))
    })
    await tick(1000)
    expect(api.sincronizarPresentacion).not.toHaveBeenCalledWith({ slide: 'hackeado' }, expect.anything())
  })

  it('le pasa a la presentación las órdenes del teléfono y avisa si hay un teléfono conectado', async () => {
    let ultimo: ReturnType<typeof usePresentacionPC> | undefined
    const { container } = render(<Prueba alRender={(r) => { ultimo = r }} />)
    const marco = container.querySelector('iframe') as HTMLIFrameElement
    const espia = vi.spyOn(marco.contentWindow as Window, 'postMessage')
    api.sincronizarPresentacion.mockResolvedValueOnce({ comandos: [{ seq: 6, tipo: 'ir', datos: { slide: 'motor' } }], seq: 6, control_conectado: true })
    await tick(1000)
    expect(espia).toHaveBeenCalledWith({ tipo: 'cmd', cmd: 'ir', datos: { slide: 'motor' } }, window.location.origin)
    expect(ultimo?.controlConectado).toBe(true)
  })

  it('al cerrar la pantalla avisa que la presentación terminó', async () => {
    const { unmount } = render(<Prueba alRender={() => undefined} />)
    await tick(10)
    unmount()
    await tick(10)
    expect(api.cerrarPresentacion).toHaveBeenCalledTimes(1)
  })

  it('si se cierra con una llamada en curso, avisa del cierre recién cuando esa llamada termina', async () => {
    let terminar: (v: unknown) => void = () => undefined
    api.sincronizarPresentacion.mockReturnValueOnce(new Promise((r) => { terminar = r }))
    const { unmount } = render(<Prueba alRender={() => undefined} />)
    await tick(10)
    unmount()
    await tick(10)
    expect(api.cerrarPresentacion).not.toHaveBeenCalled()
    terminar({ comandos: [], seq: 1, control_conectado: false })
    await tick(10)
    expect(api.cerrarPresentacion).toHaveBeenCalledTimes(1)
  })

  it('si el servidor falla lo muestra y sigue intentando', async () => {
    let ultimo: ReturnType<typeof usePresentacionPC> | undefined
    api.sincronizarPresentacion.mockRejectedValueOnce(new Error('Falta la migración 0072'))
    render(<Prueba alRender={(r) => { ultimo = r }} />)
    await tick(10)
    expect(ultimo?.error).toBe('Falta la migración 0072')
    await tick(1000)
    expect(ultimo?.error).toBeNull()
  })
})
