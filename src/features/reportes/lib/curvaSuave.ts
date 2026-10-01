export interface Punto {
  x: number
  y: number
}

/** Un tramo de curva de Bézier cúbica: dos puntos de control y el punto final. */
export interface TramoCurvo {
  c1: Punto
  c2: Punto
  fin: Punto
}

/**
 * Curva suave que pasa por TODOS los puntos sin pasarse de ellos.
 *
 * Es una spline cúbica monótona (Fritsch–Carlson): entre dos puntos la curva
 * nunca sube más que el mayor ni baja más que el menor, y en un máximo o mínimo
 * local queda plana. Una spline común "rebota" -en un gráfico de ppm podría
 * dibujar valores negativos o picos que no existen-, esta no. Los `x` deben ir
 * en orden creciente. Devuelve un tramo de Bézier por cada par de puntos.
 */
export function tramosSuaves(puntos: Punto[]): TramoCurvo[] {
  const n = puntos.length
  if (n < 2) return []

  const h = puntos.slice(1).map((p, i) => p.x - puntos[i].x)
  const d = puntos.slice(1).map((p, i) => (h[i] > 0 ? (p.y - puntos[i].y) / h[i] : 0))

  // Pendientes en cada punto: la media de las vecinas, o 0 en un máximo/mínimo.
  const m: number[] = new Array(n)
  m[0] = d[0]
  m[n - 1] = d[n - 2]
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2

  // Se acotan para que ningún tramo se salga de sus dos puntos.
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0
      m[i + 1] = 0
      continue
    }
    const a = m[i] / d[i]
    const b = m[i + 1] / d[i]
    const s = a * a + b * b
    if (s > 9) {
      const t = 3 / Math.sqrt(s)
      m[i] = t * a * d[i]
      m[i + 1] = t * b * d[i]
    }
  }

  return puntos.slice(1).map((fin, i) => {
    const ini = puntos[i]
    const paso = h[i] / 3
    return {
      c1: { x: ini.x + paso, y: ini.y + m[i] * paso },
      c2: { x: fin.x - paso, y: fin.y - m[i + 1] * paso },
      fin,
    }
  })
}

/** Dibuja la curva en el contexto de un canvas, empezando en el primer punto. */
export function trazarCurvaSuave(ctx: CanvasRenderingContext2D, puntos: Punto[]): void {
  if (puntos.length < 2) return
  ctx.moveTo(puntos[0].x, puntos[0].y)
  for (const { c1, c2, fin } of tramosSuaves(puntos)) ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, fin.x, fin.y)
}
