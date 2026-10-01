import type { EntradaStorage } from './tipos'

/** Un lugar de Storage. Local es el disco del servidor y se puede administrar
 * entero (Laboratorio AgroFresh es una carpeta suya con entrada propia);
 * Solicitudes, Accutab e Informes son del bucket R2 y la aplicación es dueña de
 * parte de lo que hay: renombrar o mover a mano dejaría rotas las solicitudes
 * o los informes que apuntan a esas rutas. */
export interface Espacio {
  id: 'local' | 'solicitudes' | 'accutab' | 'laboratorio' | 'informes'
  etiqueta: string
  descripcion: string
  r2: boolean
  /** Ruta desde la que se navega (R2 no empieza en la raíz del bucket). */
  raiz: string
  /** Color del espacio en la pantalla (solo decoración). */
  acento: string
  permiteOrganizar?: boolean
}

/** Carpeta del disco del servidor que tiene su propia entrada en Storage. */
export const CARPETA_LABORATORIO = 'Laboratorio AgroFresh'

export const ESPACIOS: Espacio[] = [
  {
    id: 'local',
    etiqueta: 'Archivos del servidor',
    descripcion: 'Carpetas y archivos guardados en el servidor de AgroFresh.',
    r2: false,
    raiz: '',
    acento: '#5f9e1f',
  },
  {
    id: 'solicitudes',
    etiqueta: 'Solicitudes',
    descripcion: 'Solicitudes de muestreo, una carpeta por cliente. Puedes ordenar las carpetas; los archivos de cada solicitud los maneja la aplicación.',
    r2: true,
    raiz: 'solicitudes',
    acento: '#2f7fc1',
    permiteOrganizar: true,
  },
  {
    id: 'accutab',
    etiqueta: 'Accutab',
    descripcion: 'Correos y archivos de Accutab recibidos.',
    r2: true,
    raiz: 'accutab/mail',
    acento: '#e08a1e',
  },
  {
    id: 'laboratorio',
    etiqueta: CARPETA_LABORATORIO,
    descripcion: 'Archivos del laboratorio de AgroFresh, guardados en el servidor.',
    r2: false,
    raiz: CARPETA_LABORATORIO,
    acento: '#0f8b8d',
  },
  {
    id: 'informes',
    etiqueta: 'Informes',
    descripcion:
      'Los informes de cada planta, ordenados por fecha de muestreo, tipo de análisis y laboratorio. Los deja la aplicación al cargar un informe en Converter.',
    r2: true,
    raiz: 'informes',
    acento: '#7c4dbd',
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

export interface Arrastre {
  espacio: Espacio['id']
  rutas: string[]
}

/** Lo que trae un arrastre; tolera basura (otro arrastre cualquiera). */
export function leerArrastre(bruto: string): Arrastre | null {
  try {
    const dato: unknown = JSON.parse(bruto)
    if (typeof dato !== 'object' || dato === null) return null
    const { espacio, rutas } = dato as Partial<Arrastre>
    if (typeof espacio !== 'string' || !Array.isArray(rutas)) return null
    return { espacio, rutas: rutas.filter((r): r is string => typeof r === 'string') }
  } catch {
    return null
  }
}

/** Carpeta que contiene a `ruta` ('' es la raíz). */
export function carpetaDe(ruta: string): string {
  const partes = ruta.split('/').filter(Boolean)
  partes.pop()
  return partes.join('/')
}

// ---------------------------------------------------------------------------
// Qué se puede hacer y dónde
// ---------------------------------------------------------------------------

export type Operacion = 'crear' | 'subir' | 'renombrar' | 'mover' | 'eliminar'

const RAIZ_ACCUTAB = 'accutab/mail'
const RAIZ_SOLICITUDES = 'solicitudes'
const RAIZ_INFORMES = 'informes'

function dentro(ruta: string, raiz: string, estricto: boolean): boolean {
  return ruta === raiz ? !estricto : ruta.startsWith(raiz + '/')
}

/** Espacio al que pertenece una ruta de R2 (los resultados de búsqueda no lo dicen). */
export function espacioDeRuta(ruta: string): Espacio['id'] {
  if (dentro(ruta, RAIZ_ACCUTAB, false)) return 'accutab'
  if (dentro(ruta, RAIZ_SOLICITUDES, false)) return 'solicitudes'
  if (dentro(ruta, RAIZ_INFORMES, false)) return 'informes'
  return 'local'
}

/** Espacio del disco al que pertenece una ruta local: Laboratorio AgroFresh tiene
 * el suyo; todo lo demás es «Archivos del servidor». */
export function espacioLocalDeRuta(ruta: string): 'local' | 'laboratorio' {
  return dentro(ruta, CARPETA_LABORATORIO, false) ? 'laboratorio' : 'local'
}

/**
 * Lo que la pantalla ofrece. El servidor decide de verdad (storage_r2.permitir):
 * esto solo evita mostrar botones que va a rechazar. Es el mismo criterio en
 * los dos lados; si tocas uno, toca el otro y sus pruebas.
 */
export function puede(espacio: Espacio, operacion: Operacion, ruta: string, esCarpeta = true): boolean {
  if (!espacio.r2) return true
  if (ruta.split('/').includes('_config')) return false
  const zona = espacioDeRuta(ruta)
  if (zona === 'local') return false
  const raiz = zona === 'accutab' ? RAIZ_ACCUTAB : zona === 'informes' ? RAIZ_INFORMES : RAIZ_SOLICITUDES
  if (['renombrar', 'mover', 'eliminar'].includes(operacion) && !dentro(ruta, raiz, true)) return false
  if (zona === 'accutab') return true
  if (zona === 'informes') return operacion === 'eliminar'
  if (operacion === 'subir' || operacion === 'eliminar') return false
  if ((operacion === 'renombrar' || operacion === 'mover') && !esCarpeta) return false
  return true
}

// ---------------------------------------------------------------------------
// Tipos de archivo (solo para pintarlos)
// ---------------------------------------------------------------------------

export interface TipoArchivo {
  clave: string
  etiqueta: string
  color: string
  /** Se puede mostrar sin bajarlo. */
  vista: 'imagen' | 'pdf' | 'texto' | null
  mime: string
}

const TIPOS: Record<string, Omit<TipoArchivo, 'etiqueta'>> = {
  pdf: { clave: 'pdf', color: '#d64545', vista: 'pdf', mime: 'application/pdf' },
  xlsx: { clave: 'excel', color: '#1f8a4c', vista: null, mime: '' },
  xls: { clave: 'excel', color: '#1f8a4c', vista: null, mime: '' },
  xlsm: { clave: 'excel', color: '#1f8a4c', vista: null, mime: '' },
  csv: { clave: 'excel', color: '#1f8a4c', vista: 'texto', mime: 'text/csv' },
  doc: { clave: 'word', color: '#2b6cb0', vista: null, mime: '' },
  docx: { clave: 'word', color: '#2b6cb0', vista: null, mime: '' },
  ppt: { clave: 'ppt', color: '#d9772b', vista: null, mime: '' },
  pptx: { clave: 'ppt', color: '#d9772b', vista: null, mime: '' },
  png: { clave: 'imagen', color: '#8b5cc6', vista: 'imagen', mime: 'image/png' },
  jpg: { clave: 'imagen', color: '#8b5cc6', vista: 'imagen', mime: 'image/jpeg' },
  jpeg: { clave: 'imagen', color: '#8b5cc6', vista: 'imagen', mime: 'image/jpeg' },
  gif: { clave: 'imagen', color: '#8b5cc6', vista: 'imagen', mime: 'image/gif' },
  webp: { clave: 'imagen', color: '#8b5cc6', vista: 'imagen', mime: 'image/webp' },
  svg: { clave: 'imagen', color: '#8b5cc6', vista: 'imagen', mime: 'image/svg+xml' },
  zip: { clave: 'zip', color: '#8a6d3b', vista: null, mime: '' },
  rar: { clave: 'zip', color: '#8a6d3b', vista: null, mime: '' },
  '7z': { clave: 'zip', color: '#8a6d3b', vista: null, mime: '' },
  txt: { clave: 'texto', color: '#64748b', vista: 'texto', mime: 'text/plain' },
  log: { clave: 'texto', color: '#64748b', vista: 'texto', mime: 'text/plain' },
  md: { clave: 'texto', color: '#64748b', vista: 'texto', mime: 'text/plain' },
  json: { clave: 'datos', color: '#0f8b8d', vista: 'texto', mime: 'application/json' },
  xml: { clave: 'datos', color: '#0f8b8d', vista: 'texto', mime: 'text/xml' },
  html: { clave: 'datos', color: '#0f8b8d', vista: null, mime: '' },
  eml: { clave: 'correo', color: '#c0761a', vista: 'texto', mime: 'text/plain' },
  msg: { clave: 'correo', color: '#c0761a', vista: null, mime: '' },
}

export function tipoDeArchivo(nombre: string): TipoArchivo {
  const punto = nombre.lastIndexOf('.')
  const ext = punto > 0 ? nombre.slice(punto + 1).toLowerCase() : ''
  const base = TIPOS[ext]
  const etiqueta = (ext || 'archivo').slice(0, 4).toUpperCase()
  return base ? { ...base, etiqueta } : { clave: 'otro', color: '#6b7a8c', vista: null, mime: '', etiqueta }
}

/** Trozos de `texto` marcando lo que coincide con la búsqueda, sin importar
 * mayúsculas ni tildes, para poder resaltarlo. */
export function partirResaltado(texto: string, busqueda: string): { texto: string; marca: boolean }[] {
  const palabras = sinTildes(busqueda).split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return [{ texto, marca: false }]
  const plano = sinTildes(texto)
  if (plano.length !== texto.length) return [{ texto, marca: false }]
  const marcas = new Array<boolean>(texto.length).fill(false)
  for (const p of palabras) {
    let desde = 0
    for (;;) {
      const i = plano.indexOf(p, desde)
      if (i < 0) break
      for (let k = i; k < i + p.length; k++) marcas[k] = true
      desde = i + p.length
    }
  }
  const trozos: { texto: string; marca: boolean }[] = []
  for (let i = 0; i < texto.length; i++) {
    const ultimo = trozos[trozos.length - 1]
    if (ultimo && ultimo.marca === marcas[i]) ultimo.texto += texto[i]
    else trozos.push({ texto: texto[i], marca: marcas[i] })
  }
  return trozos
}
