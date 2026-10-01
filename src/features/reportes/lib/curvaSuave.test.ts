import { describe, expect, it } from 'vitest'
import { tramosSuaves } from './curvaSuave'

/** Punto de una Bézier cúbica en t (0..1). */
function bezier(p0: number, c1: number, c2: number, p1: number, t: number) {
  const u = 1 - t
  return u * u * u * p0 + 3 * u * u * t * c1 + 3 * u * t * t * c2 + t * t * t * p1
}

describe('tramosSuaves', () => {
  it('con menos de dos puntos no hay curva, y con dos es una recta', () => {
    expect(tramosSuaves([{ x: 0, y: 1 }])).toEqual([])
    const [t] = tramosSuaves([{ x: 0, y: 0 }, { x: 3, y: 6 }])
    expect(t.c1).toEqual({ x: 1, y: 2 })
    expect(t.c2).toEqual({ x: 2, y: 4 })
  })

  it('pasa por cada punto: cada tramo termina donde empieza el siguiente', () => {
    const pts = [{ x: 0, y: 5 }, { x: 10, y: 1 }, { x: 25, y: 7 }, { x: 40, y: 3 }]
    const tramos = tramosSuaves(pts)
    expect(tramos.map((t) => t.fin)).toEqual(pts.slice(1))
  })

  it('no se pasa de los datos: entre dos puntos nunca sube más que el mayor ni baja más que el menor', () => {
    // un valle y un pico marcados, como los de un gráfico de ppm
    const pts = [{ x: 0, y: 0.8 }, { x: 10, y: 6.1 }, { x: 20, y: 5.5 }, { x: 30, y: 0.4 }, { x: 40, y: 1.4 }, { x: 50, y: 3.4 }]
    tramosSuaves(pts).forEach((t, i) => {
      const [a, b] = [pts[i].y, pts[i + 1].y]
      for (let k = 0; k <= 50; k++) {
        const y = bezier(a, t.c1.y, t.c2.y, b, k / 50)
        expect(y).toBeGreaterThanOrEqual(Math.min(a, b) - 1e-9)
        expect(y).toBeLessThanOrEqual(Math.max(a, b) + 1e-9)
      }
    })
  })

  it('queda plana en un máximo o mínimo local (sin rebote)', () => {
    const [primero] = tramosSuaves([{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 0 }])
    expect(primero.c2.y).toBeCloseTo(5) // llega al pico con tangente horizontal
  })
})
