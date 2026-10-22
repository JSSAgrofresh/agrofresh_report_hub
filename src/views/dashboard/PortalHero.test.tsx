import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { PortalHero } from './PortalHero'

const fotos = () => [...document.querySelectorAll<HTMLElement>('[style*="background-image"]')].map((e) => e.style.backgroundImage)

describe('PortalHero: carrusel de especies', () => {
  afterEach(() => vi.useRealTimers())

  it('con varias fotos las rota una tras otra', () => {
    vi.useFakeTimers()
    render(<PortalHero titulo="Hola" descripcion="d" fondo="/base.jpg" fondos={['/manzana.jpg', '/pera.jpg']} />)
    expect(fotos().at(-1)).toContain('manzana.jpg')
    act(() => { vi.advanceTimersByTime(7000) })
    expect(fotos().at(-1)).toContain('pera.jpg')
    act(() => { vi.advanceTimersByTime(7000) })
    expect(fotos().at(-1)).toContain('manzana.jpg')
  })

  it('con una sola foto (una especie elegida) se queda quieta', () => {
    vi.useFakeTimers()
    render(<PortalHero titulo="Hola" descripcion="d" fondo="/pera.jpg" fondos={undefined} />)
    act(() => { vi.advanceTimersByTime(20000) })
    expect(fotos().at(-1)).toContain('pera.jpg')
    expect(fotos()).toHaveLength(1)
  })
})
