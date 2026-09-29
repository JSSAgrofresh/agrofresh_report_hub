import type { EntradaStorage } from './tipos'

/** Un lugar de Storage. Local es el disco del servidor y se puede administrar
 * entero; Solicitudes y Accutab son del bucket R2 y solo se leen: las escribe
 * la propia aplicación y renombrarles o moverles algo dejaría rotas las
 * solicitudes que apuntan a esas rutas. */
export interface Espacio {
  id: 'local' | 'solicitudes' | 'accutab'
  etiqueta: string
  descripcion: string
  r2: boolean
  /** Ruta desde la que se navega (R2 no empieza en la raíz del bucket). */
  raiz: string
  editable: boolean
  permiteOrganizar?: boolean
}

export const ESPACIOS: Espacio[] = [
  {
    id: 'local',
    etiqueta: 'Archivos del servidor',
    descripcion: 'Carpetas y archivos guardados en el servidor de AgroFresh.',
    r2: false,
    raiz: '',
    editable: true,
  },
  {
    id: 'solicitudes',
    etiqueta: 'Solicitudes',
    descripcion: 'Solicitudes de muestreo, una carpeta por cliente. Las ordena la aplicación.',
    r2: true,
    raiz: 'solicitudes',
    editable: false,
    permiteOrganizar: true,
  },
  {
    id: 'accutab',
    etiqueta: 'Accutab',
    descripcion: 'Correos y archivos de Accutab recibidos.',
    r2: true,
    raiz: 'accutab/mail',
    editable: false,
  },
]

/** Tipo con el que viaja lo que se arrastra (lista de rutas en JSON). */
export const TIPO_MOVER = 'application/x-storage-rutas'

export type CampoOrden = 'nombre' | 'tamano' | 'modificado'
export interface Orden {
  campo: CampoOrden
  descendente: boolean
}

export function formatoTamano(bytes: number | null): string {
  if (bytes === null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Las carpetas de fecha (2026-09-28) se muestran como en Chile. */
export function nombreVisible(nombre: string): string {
  const fechaIso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(nombre)
  return fechaIso ? `${fechaIso[3]}-${fechaIso[2]}-${fechaIso[1]}` : nombre
}

function sinTildes(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/** Cada palabra tiene que aparecer en el nombre, sin importar mayúsculas ni tildes. */
export function filtrarEntradas(entradas: EntradaStorage[], busqueda: string): EntradaStorage[] {
  const palabras = sinTildes(busqueda).split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return entradas
  return entradas.filter((e) => {
    const nombre = sinTildes(`${e.nombre} ${nombreVisible(e.nombre)}`)
    return palabras.every((p) => nombre.includes(p))
  })
}

/** Las carpetas siempre van primero, como en cualquier explorador. */
export function ordenarEntradas(entradas: EntradaStorage[], orden: Orden): EntradaStorage[] {
  const signo = orden.descendente ? -1 : 1
  const valor = (e: EntradaStorage): string | number => {
    if (orden.campo === 'tamano') return e.tamano_bytes ?? -1
    if (orden.campo === 'modificado') return e.modificado
    return sinTildes(e.nombre)
  }
  return [...entradas].sort((a, b) => {
    if (a.tipo !== b.tipo) return a.tipo === 'carpeta' ? -1 : 1
    const va = valor(a)
    const vb = valor(b)
    if (va < vb) return -1 * signo
    if (va > vb) return 1 * signo
    return sinTildes(a.nombre) < sinTildes(b.nombre) ? -1 : 1
  })
}

export interface Miga {
  etiqueta: string
  ruta: string
}

/** Migas desde la raíz del espacio: la primera lleva el nombre del espacio. */
export function migasDe(espacio: Espacio, ruta: string): Miga[] {
  const migas: Miga[] = [{ etiqueta: espacio.etiqueta, ruta: espacio.raiz }]
  const base = espacio.raiz ? espacio.raiz.split('/').length : 0
  const partes = ruta.split('/').filter(Boolean)
  for (let i = base; i < partes.length; i++) {
    migas.push({ etiqueta: nombreVisible(partes[i]), ruta: partes.slice(0, i + 1).join('/') })
  }
  return migas
}

export function nombreDe(ruta: string): string {
  return ruta.split('/').filter(Boolean).pop() ?? ''
}

/** ¿`ruta` está en `carpeta` o dentro de ella? */
export function estaDentro(ruta: string, carpeta: string): boolean {
  return ruta === carpeta || ruta.startsWith(carpeta + '/')
}

/** Lo que trae un arrastre; tolera basura (otro arrastre cualquiera). */
export function rutasArrastradas(bruto: string): string[] {
  try {
    const lista: unknown = JSON.parse(bruto)
    return Array.isArray(lista) ? lista.filter((r): r is string => typeof r === 'string') : []
  } catch {
    return []
  }
}

/** Carpeta que contiene a `ruta` ('' es la raíz). */
export function carpetaDe(ruta: string): string {
  const partes = ruta.split('/').filter(Boolean)
  partes.pop()
  return partes.join('/')
}
