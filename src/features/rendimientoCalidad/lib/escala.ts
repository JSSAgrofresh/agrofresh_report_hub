/** Geometría de la barra de un analito: el rango permitido (min–máx) y dónde cae el valor, en % del ancho. Puro, para probarlo. */
export interface BandaLimite {
  /** Donde empieza y termina el rango permitido, en % del eje. */
  desde: number
  hasta: number
  /** Dónde cae el valor, en % del eje (queda dentro de 0–100 aunque se pase mucho). */
  marca: number
  /** Hasta qué valor llega el eje. */
  tope: number
}

export function bandaLimite(valor: number, min: number, max: number): BandaLimite {
  // El eje se estira para que el valor quepa, pero con tope (3 veces el máximo): un valor desmedido queda pegado al borde en vez de aplastar la banda.
  const tope = Math.max(Math.min(Math.max(max * 1.35, valor * 1.12), max * 3), 1e-9)
  const pct = (v: number) => Math.min(100, Math.max(0, (v / tope) * 100))
  return { desde: pct(min), hasta: pct(max), marca: pct(valor), tope }
}

/** Los tres tramos de FITO (óptimo, moderado, peligroso) y dónde cae el valor, en % del eje. */
export function bandaFito(valor: number, optimoHasta: number, peligrosoDesde: number) {
  const tope = Math.max(peligrosoDesde * 1.5, valor * 1.1, 1e-9)
  const pct = (v: number) => Math.min(100, Math.max(0, (v / tope) * 100))
  return { optimo: pct(optimoHasta), peligroso: pct(peligrosoDesde), marca: pct(valor), tope }
}

/** 0,4 → «0,4»; 3,4 → «3,4»; 12 → «12». Hasta 2 decimales, con coma. */
export function fmtNum(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return v.toLocaleString('es-CL', { maximumFractionDigits: 2 })
}

/** «+0,4» / «−0,4» (con el signo menos tipográfico). */
export function fmtDesvio(v: number): string {
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtNum(Math.abs(v))}`
}
