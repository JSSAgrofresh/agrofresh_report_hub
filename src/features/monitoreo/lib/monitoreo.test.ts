import { describe, expect, it } from 'vitest'
import {
  barrasDeSerie, claveNuevas, dispositivoDe, duracion, duracionAcumulada, duracionSeg, fechaCorta, hace, indicesDeEje, PERIODOS_CLIENTES,
  porcentajeDe, tendencia, textoInactividad, tonoDe, trazoPulso,
} from './monitoreo'

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

describe('duracionSeg', () => {
  it('menos de un minuto, minutos y horas', () => {
    expect(duracionSeg(20)).toBe('menos de 1 min')
    expect(duracionSeg(42 * 60)).toBe('42 min')
    expect(duracionSeg(72 * 60)).toBe('1 h 12 min')
    expect(duracionSeg(2 * 3600)).toBe('2 h')
  })
})

describe('duracionAcumulada', () => {
  it('minutos, horas con minutos y, desde 100 h, solo horas', () => {
    expect(duracionAcumulada(0)).toBe('0 min')
    expect(duracionAcumulada(20)).toBe('0 min')
    expect(duracionAcumulada(42 * 60)).toBe('42 min')
    expect(duracionAcumulada(9 * 3600 + 48 * 60)).toBe('9 h 48 min')
    expect(duracionAcumulada(3 * 3600)).toBe('3 h')
    expect(duracionAcumulada(126 * 3600 + 20 * 60)).toBe('126 h')
    expect(duracionAcumulada(-5)).toBe('0 min')
  })
})

describe('fechaCorta', () => {
  it('arma «28 oct» sin depender de la zona horaria', () => {
    expect(fechaCorta('2026-10-28')).toBe('28 oct')
    expect(fechaCorta('2026-01-05')).toBe('5 ene')
    expect(fechaCorta('2026-12-31')).toBe('31 dic')
  })
  it('un texto que no es fecha se devuelve tal cual', () => {
    expect(fechaCorta('hoy')).toBe('hoy')
  })
})

describe('porcentajeDe', () => {
  it('es proporcional al máximo y deja ver lo pequeño', () => {
    expect(porcentajeDe(50, 100)).toBe(50)
    expect(porcentajeDe(100, 100)).toBe(100)
    expect(porcentajeDe(1, 1000)).toBe(3)
  })
  it('cero o sin máximo no dibuja nada', () => {
    expect(porcentajeDe(0, 100)).toBe(0)
    expect(porcentajeDe(5, 0)).toBe(0)
  })
})

describe('barrasDeSerie', () => {
  it('una barra por valor, la mayor llena el alto y el cero no tiene alto', () => {
    const b = barrasDeSerie([0, 5, 10], 90, 100, 4)
    expect(b).toHaveLength(3)
    expect(b[0].alto).toBe(0)
    expect(b[2].alto).toBe(96)
    expect(b[1].alto).toBeCloseTo(48, 5)
    expect(b[2].y).toBe(4)
  })
  it('las barras no se pisan y caben en el lienzo', () => {
    const b = barrasDeSerie([1, 1, 1, 1], 100, 50)
    for (let i = 1; i < b.length; i++) expect(b[i].x).toBeGreaterThan(b[i - 1].x + b[i - 1].ancho)
    expect(b[3].x + b[3].ancho).toBeLessThanOrEqual(100)
  })
  it('un valor chico igual se ve (mínimo 3) y una serie vacía no dibuja', () => {
    expect(barrasDeSerie([1, 1000], 20, 100)[0].alto).toBe(3)
    expect(barrasDeSerie([], 100, 50)).toEqual([])
  })
})

describe('indicesDeEje', () => {
  it('el primero, el último y los de en medio sin repetir', () => {
    expect(indicesDeEje(30)).toEqual([0, 7, 15, 22, 29])
    expect(indicesDeEje(3)).toEqual([0, 1, 2])
    expect(indicesDeEje(1)).toEqual([0])
    expect(indicesDeEje(0)).toEqual([])
  })
})

describe('períodos de clientes', () => {
  it('incluyen «Todo» como el historial completo (dias 0)', () => {
    expect(PERIODOS_CLIENTES.map((p) => p.dias)).toEqual([1, 7, 30, 0])
    expect(PERIODOS_CLIENTES[3].etiqueta).toBe('Todo')
  })
})
