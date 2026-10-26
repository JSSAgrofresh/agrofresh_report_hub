import { describe, expect, it } from 'vitest'
import { claveNuevas, dispositivoDe, duracion, hace, tendencia, textoInactividad, tonoDe, trazoPulso } from './monitoreo'

const AHORA = new Date('2026-10-22T15:00:00Z').getTime()
const antes = (seg: number) => new Date(AHORA - seg * 1000).toISOString()

describe('hace', () => {
  it('ahora, minutos, horas y días', () => {
    expect(hace(antes(10), AHORA)).toBe('ahora')
    expect(hace(antes(5 * 60), AHORA)).toBe('hace 5 min')
    expect(hace(antes(3 * 3600), AHORA)).toBe('hace 3 h')
    expect(hace(antes(50 * 3600), AHORA)).toBe('hace 2 d')
  })
  it('sin fecha no inventa nada y el futuro cuenta como ahora', () => {
    expect(hace(null, AHORA)).toBe('—')
    expect(hace(antes(-120), AHORA)).toBe('ahora')
  })
})

describe('duracion', () => {
  it('formatea minutos y horas', () => {
    expect(duracion(antes(20), antes(0))).toBe('menos de 1 min')
    expect(duracion(antes(8 * 60), antes(0))).toBe('8 min')
    expect(duracion(antes(72 * 60), antes(0))).toBe('1 h 12 min')
    expect(duracion(antes(120 * 60), antes(0))).toBe('2 h')
  })
})

describe('tonoDe', () => {
  it('es estable y está entre 0 y 359', () => {
    expect(tonoDe('a@x.cl')).toBe(tonoDe('a@x.cl'))
    expect(tonoDe('a@x.cl')).toBeGreaterThanOrEqual(0)
    expect(tonoDe('a@x.cl')).toBeLessThan(360)
  })
})

describe('claveNuevas', () => {
  const items = [{ id: 1 }, { id: 2 }, { id: 3 }]
  it('la primera vuelta no destaca nada', () => {
    expect(claveNuevas(null, items, (i) => String(i.id)).size).toBe(0)
  })
  it('destaca solo lo que no estaba', () => {
    expect([...claveNuevas(new Set(['1', '2']), items, (i) => String(i.id))]).toEqual(['3'])
  })
})

describe('trazoPulso', () => {
  it('una serie vacía no rompe y una plana queda abajo', () => {
    expect(trazoPulso([], 100, 40).linea).toBe('')
    const t = trazoPulso([0, 0, 0], 100, 40)
    expect(t.max).toBe(1)
    expect(t.ultimo?.y).toBeCloseTo(34)
  })
  it('el máximo llega arriba y el área se cierra', () => {
    const t = trazoPulso([0, 5, 10], 100, 40)
    expect(t.ultimo?.y).toBeCloseTo(6)
    expect(t.area.endsWith('Z')).toBe(true)
  })
})

describe('dispositivoDe', () => {
  const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'
  const WINDOWS_EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 Edg/126.0'
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

  it('reconoce el celular, el computador y si es la app instalada', () => {
    expect(dispositivoDe(ANDROID, 412, false)).toBe('Móvil · Chrome')
    expect(dispositivoDe(ANDROID, 412, true)).toBe('Móvil · Chrome · app')
    expect(dispositivoDe(WINDOWS_EDGE, 1920, false)).toBe('Escritorio · Edge')
    expect(dispositivoDe(IPHONE, 390, false)).toBe('Móvil · Safari')
  })

  it('un Android sin «Mobile» es tablet', () => {
    expect(dispositivoDe(ANDROID.replace(' Mobile', ''), 800, false)).toBe('Tablet · Chrome')
  })
})

describe('textoInactividad y tendencia', () => {
  it('segundos redondeados a 5 y luego minutos', () => {
    expect(textoInactividad(null)).toBe('')
    expect(textoInactividad(2)).toBe('hace 5 s')
    expect(textoInactividad(47)).toBe('hace 45 s')
    expect(textoInactividad(5 * 60 + 10)).toBe('hace 5 min')
  })

  it('compara con la hora anterior', () => {
    expect(tendencia(7, 4)).toEqual({ texto: '+3 que la hora anterior', sube: true })
    expect(tendencia(2, 5)).toEqual({ texto: '-3 que la hora anterior', sube: false })
    expect(tendencia(3, 3).sube).toBeNull()
  })
})
