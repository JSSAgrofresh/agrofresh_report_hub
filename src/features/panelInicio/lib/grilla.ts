/**
 * La grilla del Panel general: 12 columnas, filas sin tope visible (hasta MAX_FILAS).
 * Cada pieza es `{id, x, y, w, h}` en unidades de la grilla; (0,0) es arriba a la izquierda.
 *
 * Todo esto es PURO (sin React ni red) para poder probarlo solo, y es el espejo de
 * `validar_piezas` en `backend/app/panel_inicio.py` (mismas reglas: 12 columnas, sin pisarse,
 * sin salirse). Si cambias una regla acá, cámbiala allá.
 */
export const COLUMNAS = 12
export const MAX_FILAS = 80

export interface Pieza {
  id: string
  x: number
  y: number
  w: number
  h: number
}

export type Rect = Pick<Pieza, 'x' | 'y' | 'w' | 'h'>

/** ¿Dos rectángulos se pisan? Compartir solo el borde NO cuenta. */
export function seTocan(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

export function dentroDelTablero(r: Rect): boolean {
  return r.x >= 0 && r.y >= 0 && r.w >= 1 && r.h >= 1 && r.x + r.w <= COLUMNAS && r.y + r.h <= MAX_FILAS
}

/** Por qué NO cabe `r` entre `piezas` (sin contar `ignorar`), o null si cabe. */
export function porQueNoCabe(piezas: Pieza[], r: Rect, ignorar?: string): string | null {
  if (r.x < 0 || r.y < 0) return 'se sale del tablero por arriba o por la izquierda'
  if (r.x + r.w > COLUMNAS) return `se sale del borde derecho (el tablero tiene ${COLUMNAS} columnas)`
  if (r.y + r.h > MAX_FILAS) return 'queda demasiado abajo'
  const choque = piezas.find((p) => p.id !== ignorar && seTocan(p, r))
  return choque ? `se pisa con «${choque.id}»` : null
}

export const cabe = (piezas: Pieza[], r: Rect, ignorar?: string): boolean => porQueNoCabe(piezas, r, ignorar) === null

/** El primer hueco libre (de arriba abajo, de izquierda a derecha) donde entra un widget de w×h. */
export function primerHueco(piezas: Pieza[], w: number, h: number): Rect | null {
  if (w > COLUMNAS) return null
  const filas = Math.max(0, ...piezas.map((p) => p.y + p.h)) + h
  for (let y = 0; y <= Math.min(filas, MAX_FILAS - h); y++) {
    for (let x = 0; x + w <= COLUMNAS; x++) {
      const r = { x, y, w, h }
      if (cabe(piezas, r)) return r
    }
  }
  return null
}

/** Sube cada pieza todo lo que pueda sin pisar a nadie («acomodar»): quita los huecos de arriba. */
export function compactar(piezas: Pieza[]): Pieza[] {
  const orden = [...piezas].sort((a, b) => a.y - b.y || a.x - b.x)
  const puestas: Pieza[] = []
  for (const p of orden) {
    let y = p.y
    while (y > 0 && cabe(puestas, { x: p.x, y: y - 1, w: p.w, h: p.h })) y--
    puestas.push({ ...p, y })
  }
  // se devuelve en el orden original para que la lista no «salte» al acomodar
  return piezas.map((p) => puestas.find((q) => q.id === p.id) as Pieza)
}

/** Lleva una pieza a (x, y). `null` si ahí no cabe. */
export function mover(piezas: Pieza[], id: string, x: number, y: number): Pieza[] | null {
  const p = piezas.find((q) => q.id === id)
  if (!p || !cabe(piezas, { x, y, w: p.w, h: p.h }, id)) return null
  return piezas.map((q) => (q.id === id ? { ...q, x, y } : q))
}

/** Cambia el tamaño de una pieza (esquina de arriba-izquierda fija). `null` si no cabe. */
export function redimensionar(piezas: Pieza[], id: string, w: number, h: number): Pieza[] | null {
  const p = piezas.find((q) => q.id === id)
  if (!p || !cabe(piezas, { x: p.x, y: p.y, w, h }, id)) return null
  return piezas.map((q) => (q.id === id ? { ...q, w, h } : q))
}

/** Pone un widget nuevo en (x, y). `null` si no cabe o ya está puesto. */
export function agregar(piezas: Pieza[], nueva: Pieza): Pieza[] | null {
  if (piezas.some((p) => p.id === nueva.id)) return null
  return cabe(piezas, nueva) ? [...piezas, nueva] : null
}

/** La celda (cuadrada, de `celda` px) que está bajo un punto relativo al borde del tablero. */
export function celdaBajo(px: number, py: number, celda: number): { x: number; y: number } {
  return { x: Math.floor(px / celda), y: Math.floor(py / celda) }
}

/**
 * Dónde queda una pieza de w×h si el puntero está en la celda (cx, cy): el puntero agarra el centro
 * (más natural que la esquina) y se ajusta para no salirse por el borde derecho.
 */
export function ubicarBajoPuntero(cx: number, cy: number, w: number, h: number): Rect {
  const x = Math.min(Math.max(0, cx - Math.floor(w / 2)), COLUMNAS - w)
  const y = Math.max(0, cy - Math.floor(h / 2))
  return { x, y, w, h }
}

export const filasUsadas = (piezas: Pieza[]): number => Math.max(0, ...piezas.map((p) => p.y + p.h))
