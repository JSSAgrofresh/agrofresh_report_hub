import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { enviarLatido } = vi.hoisted(() => ({ enviarLatido: vi.fn((_: { inactivo_segundos: number }) => Promise.resolve({ ok: true })) }))
vi.mock('../lib/monitoreo', async (original) => ({ ...(await original<typeof import('../lib/monitoreo')>()), enviarLatido }))

import { usePresencia } from './usePresencia'

describe('usePresencia', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-26T15:00:00Z'))
    enviarLatido.mockClear()
  })
  afterEach(() => vi.useRealTimers())

  it('late al abrir y cada minuto, con la pantalla y cuánto lleva sin tocar nada', () => {
    renderHook(() => usePresencia('/modulos/reportes', true))
    expect(enviarLatido).toHaveBeenCalledTimes(1)
    expect(enviarLatido.mock.calls[0][0]).toMatchObject({ ruta: '/modulos/reportes', inactivo_segundos: 0, visible: true })

    act(() => { vi.advanceTimersByTime(60_000) })
    expect(enviarLatido).toHaveBeenCalledTimes(2)
    expect(enviarLatido.mock.calls[1][0].inactivo_segundos).toBe(60)
  })

  it('tras 3 min de pausa, tocar algo avisa de inmediato y la inactividad vuelve a 0', () => {
    renderHook(() => usePresencia('/', true))
    act(() => { vi.advanceTimersByTime(4 * 60_000 + 30_000) }) // 4 latidos de «en pausa» y 30 s más
    const antes = enviarLatido.mock.calls.length
    act(() => { window.dispatchEvent(new Event('pointerdown')) })
    expect(enviarLatido).toHaveBeenCalledTimes(antes + 1)
    expect(enviarLatido.mock.calls[antes][0].inactivo_segundos).toBe(0)
  })

  it('un toque sin pausa previa no manda un latido extra', () => {
    renderHook(() => usePresencia('/', true))
    act(() => { window.dispatchEvent(new Event('pointerdown')) })
    expect(enviarLatido).toHaveBeenCalledTimes(1)
  })

  it('sin sesión no late', () => {
    renderHook(() => usePresencia('/', false))
    expect(enviarLatido).not.toHaveBeenCalled()
  })
})
