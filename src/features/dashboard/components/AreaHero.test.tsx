import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AREAS } from '@/constants/areas'
import { TINTE_CEREZA } from '../lib/fondoEspecie'
import { AreaHero } from './AreaHero'

/** jsdom devuelve los colores como rgba(r, g, b, a): se compara contra eso. */
function rgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255},`
}

function degradado(): string {
  const hero = screen.getByRole('heading', { level: 1 }).parentElement as HTMLElement
  return hero.style.backgroundImage
}

describe('AreaHero', () => {
  // La foto base (background_lab.jpg) es de cerezas. Cuando Cromatografía pasó
  // de vino a verde, el velo siguió al área y las cerezas quedaron verdes.
  it('la foto de cerezas lleva velo rojo cereza aunque el área sea verde', () => {
    render(<AreaHero area={AREAS.cromatografia} titulo="Cliente" descripcion="d" />)
    expect(degradado()).toContain(rgb(TINTE_CEREZA))
    expect(degradado()).not.toContain(rgb(AREAS.cromatografia.colorOscuro))
  })

  it('también en R y D, que usa la misma foto con color morado', () => {
    render(<AreaHero area={AREAS.ryd} titulo="R y D" descripcion="d" />)
    expect(degradado()).toContain(rgb(TINTE_CEREZA))
  })

  it('una foto sin tono propio (Accu-Tab) sigue con el color del área', () => {
    render(<AreaHero area={AREAS.postventa} titulo="Post Venta" descripcion="d" />)
    expect(degradado()).toContain(rgb(AREAS.postventa.colorOscuro))
  })

  it('un tinte explícito (fruta filtrada en Report) manda sobre todo', () => {
    render(<AreaHero area={AREAS.cromatografia} titulo="Cliente" descripcion="d" tinte="#20336E" />)
    expect(degradado()).toContain(rgb('#20336E'))
  })
})
