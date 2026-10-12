import { describe, expect, it } from 'vitest'
import { agruparTop, armarSlides, celdasVerificacion, indiceMasCercano, maximoEje, saludo } from './graficos'

describe('agruparTop', () => {
  it('deja las 4 mayores con su color fijo y junta el resto en «Otras» gris', () => {
    const r = agruparTop([
      { nombre: 'a', n: 1 }, { nombre: 'b', n: 5 }, { nombre: 'c', n: 4 },
      { nombre: 'd', n: 3 }, { nombre: 'e', n: 2 }, { nombre: 'f', n: 1 },
    ])
    expect(r.map((p) => p.nombre)).toEqual(['b', 'c', 'd', 'e', 'Otras'])
    expect(r[0].color).toBe('#1C7FA6')
    expect(r[4]).toMatchObject({ n: 2, color: '#9AA3A0' })
  })
  it('sin sobrantes no inventa «Otras» y descarta los ceros', () => {
    expect(agruparTop([{ nombre: 'a', n: 2 }, { nombre: 'z', n: 0 }]).map((p) => p.nombre)).toEqual(['a'])
  })
})

describe('maximoEje', () => {
  it.each([[0, 4], [3, 4], [7, 8], [23, 24], [41, 50], [101, 200]])('%s → %s', (v, esperado) => {
    expect(maximoEje(v)).toBe(esperado)
  })
})

describe('indiceMasCercano', () => {
  it('elige el punto y se queda dentro del rango', () => {
    expect(indiceMasCercano(0, 0, 100, 5)).toBe(0)
    expect(indiceMasCercano(51, 0, 100, 5)).toBe(2)
    expect(indiceMasCercano(500, 0, 100, 5)).toBe(4)
    expect(indiceMasCercano(-9, 0, 100, 5)).toBe(0)
  })
})

describe('saludo', () => {
  it('cambia con la hora', () => {
    expect([3, 9, 15, 22].map(saludo)).toEqual(['Buenas noches', 'Buenos días', 'Buenas tardes', 'Buenas noches'])
  })
})

describe('celdasVerificacion', () => {
  it('marca los días verificados y deja «falta» en los demás, con hoy al final', () => {
    const c = celdasVerificacion([{ fecha: '2026-10-09', resultado: 'Aceptable' }, { fecha: '2026-10-08', resultado: 'No aceptable' }], new Date(2026, 9, 9), 5)
    expect(c.map((x) => x.estado)).toEqual(['falta', 'falta', 'falta', 'mal', 'ok'])
    expect(c[4].fecha).toBe('2026-10-09')
  })
})

describe('armarSlides', () => {
  const vacia = {
    usuarios_activos: [], converter_recientes: [{ id: 1, origen: 'Excel', creado_en: null, n_motivos: 2 }], trace_recientes: [],
    solicitudes_recientes: [], verificaciones_recientes: [{ fecha: '2026-10-08', resultado: 'Aceptable', actualizado_en: null }],
    metricas: { total_solicitudes: 10, esta_semana: 3, pendientes_converter: 1, verificacion_hoy: false },
  }
  it('sin datos no hay diapositivas', () => {
    expect(armarSlides(null)).toEqual([])
  })
  it('arma las cuatro con sus cifras', async () => {
    const s = armarSlides(vacia)
    expect(s.map((x) => x.clave)).toEqual(['solicitudes', 'converter', 'verificacion', 'trace'])
    expect(s[0].numero).toBe('3')
    expect(s[1].titulo).toBe('fila esperando revisión')
    expect(s[2].lineas).toEqual(['08-10 · Aceptable'])
  })
})
