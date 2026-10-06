/**
 * La tabla dinámica de listas de distribución: una fila por planta, una columna
 * por rol (Admin, Comercial, Técnico) y por especie (correos del cliente).
 *
 * Todo lo que cambia (a mano o porque se importó un Excel) vive como una
 * PROPUESTA sobre una celda: se ve en amarillo y se acepta o se rechaza. Nada
 * llega al servidor hasta guardar lo aceptado. Esta capa es lógica pura.
 */
import { httpClient } from '@/services/http/client'
import { parametroServicio } from '@/lib/servicio'
import type { ListaDistribucion } from '@/lib/servicio'
import type { CambioLista, FilaLista, PlantaLista, ResultadoComparacion } from './listasDistribucion'

export const CATEGORIAS = [
  'Manzana y Pera', 'Kiwi', 'Carozos', 'Cerezas', 'Citricos', 'Arandanos', 'Paltas', 'Nueces y Pasas', 'Granada',
] as const
export type Categoria = (typeof CATEGORIAS)[number]
export type CampoInterno = 'admin' | 'comercial' | 'tecnico'
export type CampoLista = CampoInterno | Categoria

export const CAMPOS_INTERNOS: CampoInterno[] = ['admin', 'comercial', 'tecnico']
export const CAMPOS: CampoLista[] = [...CAMPOS_INTERNOS, ...CATEGORIAS]

/** Cómo llega el correo: Para (cliente), CC (copia visible) o CCO (copia oculta). */
export type Via = 'PARA' | 'CC' | 'CCO'

export interface InfoCampo {
  titulo: string
  via: Via
  ayuda: string
}

export const INFO_CAMPO: Record<CampoLista, InfoCampo> = {
  admin: { titulo: 'Admin Report Hub', via: 'CCO', ayuda: 'Jorge, Claudia y el correo del sistema. Van en copia oculta; si la planta no tiene lista de cliente, pasan a Para.' },
  comercial: { titulo: 'Comercial a cargo', via: 'CC', ayuda: 'El ejecutivo comercial de la planta. Va en copia (la ve el cliente).' },
  tecnico: { titulo: 'Técnico a cargo', via: 'CCO', ayuda: 'El técnico de la planta. Va en copia oculta.' },
  ...(Object.fromEntries(
    CATEGORIAS.map((c) => [c, { titulo: c, via: 'PARA', ayuda: `Correos del cliente que reciben los resultados de ${c}. Van en Para.` }]),
  ) as Record<Categoria, InfoCampo>),
}

export const ETIQUETA_VIA: Record<Via, string> = { PARA: 'Para', CC: 'Copia', CCO: 'Copia oculta' }

export interface FilaEstado {
  sold_to: string
  ship_to: string
  admin: string[]
  comercial: string[]
  tecnico: string[]
  clientes: Record<string, string[]>
  /** correos de cada rol que están en la copia equivocada */
  copia_mal: Record<CampoInterno, string[]>
  /** si el nombre existe tal cual en Listados (null = no se pudo revisar) */
  en_listados: boolean | null
  /** planta de Listados que aún no tiene ninguna lista */
  sin_contactos: boolean
}

export interface EstadoListas {
  filas: FilaEstado[]
  clientes: string[]
  resumen: { plantas_con_lista: number; plantas_listados: number | null; listados_sin_lista: number | null }
}

/** Cada tipo de servicio tiene su lista: `servicio` vacío = Línea de proceso. */
export function obtenerEstado(incluirSinLista: boolean, servicio: ListaDistribucion = 'linea') {
  const qs = new URLSearchParams({ sin_lista: String(incluirSinLista), servicio: parametroServicio(servicio) })
  return httpClient.get<EstadoListas>(`/listas-distribucion/estado?${qs.toString()}`)
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

export function clavePlanta(soldTo: string, shipTo: string): string {
  return `${normalizar(soldTo)}|${normalizar(shipTo)}`
}

const EMAIL = /^[^@\s;,]+@[^@\s;,]+\.[^@\s;,]+$/

export function esCorreo(texto: string): boolean {
  return EMAIL.test(texto.trim())
}

/** Separa por «;», «,», saltos de línea o espacios y deja solo correos, en minúscula y sin repetir. */
export function separarCorreos(texto: string): { validos: string[]; invalidos: string[] } {
  const validos: string[] = []
  const invalidos: string[] = []
  for (const parte of texto.split(/[;,\n\s]+/)) {
    const p = parte.trim().replace(/^mailto:/i, '')
    if (!p) continue
    if (esCorreo(p)) {
      if (!validos.includes(p.toLowerCase())) validos.push(p.toLowerCase())
    } else invalidos.push(p)
  }
  return { validos, invalidos }
}

/** Los correos del equipo se muestran sin el dominio; el completo queda en el tooltip. */
export function etiquetaCorreo(email: string): string {
  return email.toLowerCase().endsWith('@agrofresh.com') ? email.slice(0, email.indexOf('@')) : email
}

export function mismaLista(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sa = new Set(a.map((e) => e.toLowerCase()))
  return b.every((e) => sa.has(e.toLowerCase()))
}

export function diffLista(actual: string[], nuevo: string[]): { agregar: string[]; quitar: string[] } {
  const a = new Set(actual.map((e) => e.toLowerCase()))
  const n = new Set(nuevo.map((e) => e.toLowerCase()))
  return { agregar: nuevo.filter((e) => !a.has(e.toLowerCase())), quitar: actual.filter((e) => !n.has(e.toLowerCase())) }
}

type ConListas = Pick<FilaEstado, 'admin' | 'comercial' | 'tecnico' | 'clientes'>

export function listaDe(fila: ConListas, campo: CampoLista): string[] {
  if (campo === 'admin' || campo === 'comercial' || campo === 'tecnico') return fila[campo] ?? []
  return fila.clientes?.[campo] ?? []
}

export function filaVacia(soldTo: string, shipTo: string): FilaLista {
  return {
    sold_to: soldTo, ship_to: shipTo, admin: [], comercial: [], tecnico: [],
    clientes: Object.fromEntries(CATEGORIAS.map((c) => [c, [] as string[]])),
  }
}

// ---------------------------------------------------------------------------
// Propuestas sobre celdas existentes
// ---------------------------------------------------------------------------

export type EstadoPropuesta = 'pendiente' | 'aceptada'
export type Origen = 'excel' | 'manual'

export interface Propuesta {
  /** `${clavePlanta}|${campo}` */
  clave: string
  plantaClave: string
  campo: CampoLista
  /** la lista completa que quedaría en la celda */
  nuevo: string[]
  /** correos de este rol a pasar a la copia correcta */
  ajustarCopia: string[]
  origen: Origen
  estado: EstadoPropuesta
}

export type Propuestas = Record<string, Propuesta>

export const claveCelda = (plantaClave: string, campo: CampoLista) => `${plantaClave}|${campo}`

/** Pone, cambia o quita (si no cambia nada) la propuesta de una celda. */
export function proponer(
  propuestas: Propuestas, fila: FilaEstado, campo: CampoLista, nuevo: string[], origen: Origen,
  estado: EstadoPropuesta, ajustarCopia: string[] = [],
): Propuestas {
  const plantaClave = clavePlanta(fila.sold_to, fila.ship_to)
  const clave = claveCelda(plantaClave, campo)
  const sig = { ...propuestas }
  const sinCambio = mismaLista(listaDe(fila, campo), nuevo) && ajustarCopia.length === 0
  if (sinCambio) delete sig[clave]
  else sig[clave] = { clave, plantaClave, campo, nuevo, ajustarCopia, origen, estado }
  return sig
}

/** Lo que muestra una celda: la propuesta si hay, si no lo guardado. */
export function valorMostrado(fila: FilaEstado, campo: CampoLista, propuestas: Propuestas): string[] {
  const p = propuestas[claveCelda(clavePlanta(fila.sold_to, fila.ship_to), campo)]
  return p ? p.nuevo : listaDe(fila, campo)
}

/**
 * Las propuestas que salen de comparar un Excel con lo guardado. Una celda vacía
 * del Excel no propone nada (no quita a nadie).
 */
export function propuestasDeFila(fila: FilaLista, actual: FilaEstado): Propuesta[] {
  const plantaClave = clavePlanta(actual.sold_to, actual.ship_to)
  const salida: Propuesta[] = []
  for (const campo of CAMPOS) {
    const nuevo = listaDe(fila, campo)
    if (nuevo.length === 0 || mismaLista(listaDe(actual, campo), nuevo)) continue
    salida.push({ clave: claveCelda(plantaClave, campo), plantaClave, campo, nuevo, ajustarCopia: [], origen: 'excel', estado: 'pendiente' })
  }
  return salida
}

// ---------------------------------------------------------------------------
// Plantas nuevas
// ---------------------------------------------------------------------------

export interface PlantaNueva {
  id: string
  sold_to: string
  ship_to: string
  fila: FilaLista
  origen: Origen
  estado: EstadoPropuesta
  /** crear también el cliente y la planta en Listados al guardar */
  crearEnListados: boolean
  /** el nombre ya coincide con Listados */
  existeEnListados: boolean
  sugerencias: PlantaLista[]
}

export function plantaNueva(
  fila: FilaLista, origen: Origen, estado: EstadoPropuesta, existeEnListados: boolean, sugerencias: PlantaLista[] = [],
): PlantaNueva {
  return {
    id: clavePlanta(fila.sold_to, fila.ship_to), sold_to: fila.sold_to, ship_to: fila.ship_to, fila, origen, estado,
    crearEnListados: !existeEnListados, existeEnListados, sugerencias,
  }
}

/** Una planta del sistema que el Excel importado ya no trae. `quitar` = el usuario marcó quitarle la lista. */
export interface PlantaRetirada {
  id: string
  sold_to: string
  ship_to: string
  quitar: boolean
}

export interface PropuestasImportadas {
  propuestas: Propuestas
  nuevas: PlantaNueva[]
  retiradas: PlantaRetirada[]
}

/** Convierte la respuesta de «comparar» en celdas amarillas y plantas nuevas. */
export function desdeComparacion(estado: EstadoListas, comparacion: ResultadoComparacion): PropuestasImportadas {
  const porClave = new Map(estado.filas.map((f) => [clavePlanta(f.sold_to, f.ship_to), f]))
  const propuestas: Propuestas = {}
  const nuevas: PlantaNueva[] = []
  for (const c of comparacion.cambios) {
    const plantaClave = clavePlanta(c.planta.sold_to, c.planta.ship_to)
    const fila = porClave.get(plantaClave)
    if (c.tipo === 'planta_nueva' && c.fila) {
      nuevas.push(plantaNueva(c.fila, 'excel', 'pendiente', !c.aviso, c.sugerencias ?? []))
    } else if (fila && c.tipo === 'campo') {
      const campo = c.campo as CampoLista
      const sin = new Set(c.quitar.map((e) => e.toLowerCase()))
      const nuevo = [...listaDe(fila, campo).filter((e) => !sin.has(e.toLowerCase())), ...c.agregar]
      const clave = claveCelda(plantaClave, campo)
      propuestas[clave] = { ...(propuestas[clave] ?? {}), clave, plantaClave, campo, nuevo, ajustarCopia: propuestas[clave]?.ajustarCopia ?? [], origen: 'excel', estado: 'pendiente' }
    } else if (fila && c.tipo === 'copia') {
      for (const campo of CAMPOS_INTERNOS) {
        const emails = fila.copia_mal[campo].filter((e) => c.corregir.some((x) => x.toLowerCase() === e.toLowerCase()))
        if (emails.length === 0) continue
        const clave = claveCelda(plantaClave, campo)
        const previa = propuestas[clave]
        propuestas[clave] = { clave, plantaClave, campo, nuevo: previa?.nuevo ?? listaDe(fila, campo), ajustarCopia: emails, origen: 'excel', estado: 'pendiente' }
      }
    }
  }
  const retiradas: PlantaRetirada[] = (comparacion.retiradas ?? []).map((r) => ({
    id: clavePlanta(r.planta.sold_to, r.planta.ship_to), sold_to: r.planta.sold_to, ship_to: r.planta.ship_to, quitar: false,
  }))
  return { propuestas, nuevas, retiradas }
}

// ---------------------------------------------------------------------------
// Revisar y guardar
// ---------------------------------------------------------------------------

export interface ResumenRevision {
  pendientes: number
  aceptadas: number
  agregan: number
  quitan: number
  ajustes: number
}

export function resumenRevision(
  propuestas: Propuestas, nuevas: PlantaNueva[], estado: EstadoListas, retiradas: PlantaRetirada[] = [],
): ResumenRevision {
  const porClave = new Map(estado.filas.map((f) => [clavePlanta(f.sold_to, f.ship_to), f]))
  const r: ResumenRevision = { pendientes: 0, aceptadas: 0, agregan: 0, quitan: 0, ajustes: 0 }
  for (const p of Object.values(propuestas)) {
    if (p.estado === 'pendiente') r.pendientes++
    else {
      r.aceptadas++
      const fila = porClave.get(p.plantaClave)
      const d = diffLista(fila ? listaDe(fila, p.campo) : [], p.nuevo)
      r.agregan += d.agregar.length
      r.quitan += d.quitar.length
      r.ajustes += p.ajustarCopia.length
    }
  }
  for (const n of nuevas) {
    if (n.estado === 'pendiente') r.pendientes++
    else {
      r.aceptadas++
      r.agregan += CAMPOS.reduce((t, c) => t + listaDe(n.fila, c).length, 0)
    }
  }
  // quitar la lista de una planta es un cambio aceptado (nunca pendiente: se marca a propósito)
  r.aceptadas += retiradas.filter((x) => x.quitar).length
  return r
}

/** Los cambios aceptados, en el formato que entiende el servidor. */
export function aCambios(
  estado: EstadoListas, propuestas: Propuestas, nuevas: PlantaNueva[], retiradas: PlantaRetirada[] = [],
): CambioLista[] {
  const porClave = new Map(estado.filas.map((f) => [clavePlanta(f.sold_to, f.ship_to), f]))
  const cambios: CambioLista[] = []
  for (const p of Object.values(propuestas)) {
    const fila = porClave.get(p.plantaClave)
    if (p.estado !== 'aceptada' || !fila) continue
    const planta = { sold_to: fila.sold_to, ship_to: fila.ship_to }
    const { agregar, quitar } = diffLista(listaDe(fila, p.campo), p.nuevo)
    if (agregar.length || quitar.length) {
      cambios.push({ id: p.clave, tipo: 'campo', planta, campo: p.campo, etiqueta: INFO_CAMPO[p.campo].titulo, agregar, quitar, corregir: [], aviso: null, fila: null })
    }
    if (p.ajustarCopia.length) {
      cambios.push({ id: `${p.clave}|copia`, tipo: 'copia', planta, campo: 'copia', etiqueta: 'Ajustar copia', agregar: [], quitar: [], corregir: p.ajustarCopia, aviso: null, fila: null })
    }
  }
  for (const n of nuevas) {
    if (n.estado !== 'aceptada') continue
    cambios.push({
      id: `${n.id}|nueva`, tipo: 'planta_nueva', planta: { sold_to: n.sold_to, ship_to: n.ship_to }, campo: 'planta',
      etiqueta: 'Planta nueva', agregar: [], quitar: [], corregir: [], aviso: null, crear_en_listados: n.crearEnListados,
      fila: { ...n.fila, sold_to: n.sold_to, ship_to: n.ship_to },
    })
  }
  for (const r of retiradas) {
    if (!r.quitar) continue
    cambios.push({
      id: `${r.id}|quitar`, tipo: 'planta_quitar', planta: { sold_to: r.sold_to, ship_to: r.ship_to }, campo: 'planta',
      etiqueta: 'Quitar la lista de la planta', agregar: [], quitar: [], corregir: [], aviso: null, fila: null,
    })
  }
  return cambios
}

// ---------------------------------------------------------------------------
// Indicadores y filtros
// ---------------------------------------------------------------------------

export type FiltroTabla =
  | 'todas' | 'cambios' | 'sin_tecnico' | 'sin_comercial' | 'sin_cliente' | 'fuera_listados' | 'copia_mal' | 'sin_lista_listados'

export const ETIQUETA_FILTRO_TABLA: Record<FiltroTabla, string> = {
  todas: 'Todas las plantas',
  cambios: 'Con cambios por revisar',
  sin_tecnico: 'Sin técnico',
  sin_comercial: 'Sin comercial',
  sin_cliente: 'Sin lista de cliente',
  fuera_listados: 'Fuera de Listados',
  copia_mal: 'Copia mal puesta',
  sin_lista_listados: 'En Listados, sin lista',
}

const sinClientes = (f: FilaEstado) => CATEGORIAS.every((c) => (f.clientes[c] ?? []).length === 0)

export function coincideFiltro(f: FilaEstado, filtro: FiltroTabla, conCambios: Set<string>): boolean {
  switch (filtro) {
    case 'cambios': return conCambios.has(clavePlanta(f.sold_to, f.ship_to))
    case 'sin_tecnico': return !f.sin_contactos && f.tecnico.length === 0
    case 'sin_comercial': return !f.sin_contactos && f.comercial.length === 0
    case 'sin_cliente': return !f.sin_contactos && sinClientes(f)
    case 'fuera_listados': return f.en_listados === false
    case 'copia_mal': return CAMPOS_INTERNOS.some((c) => f.copia_mal[c].length > 0)
    case 'sin_lista_listados': return f.sin_contactos
    default: return true
  }
}

export interface Indicadores {
  plantas: number
  conCliente: number
  conComercial: number
  conTecnico: number
  conAdmin: number
  alertas: Record<Exclude<FiltroTabla, 'todas' | 'cambios'>, number>
}

export function indicadores(estado: EstadoListas): Indicadores {
  const filas = estado.filas.filter((f) => !f.sin_contactos)
  const vacio = new Set<string>()
  const cuenta = (filtro: FiltroTabla) => estado.filas.filter((f) => coincideFiltro(f, filtro, vacio)).length
  return {
    plantas: filas.length,
    conCliente: filas.filter((f) => !sinClientes(f)).length,
    conComercial: filas.filter((f) => f.comercial.length > 0).length,
    conTecnico: filas.filter((f) => f.tecnico.length > 0).length,
    conAdmin: filas.filter((f) => f.admin.length > 0).length,
    alertas: {
      sin_tecnico: cuenta('sin_tecnico'),
      sin_comercial: cuenta('sin_comercial'),
      sin_cliente: cuenta('sin_cliente'),
      fuera_listados: cuenta('fuera_listados'),
      copia_mal: cuenta('copia_mal'),
      sin_lista_listados: estado.resumen.listados_sin_lista ?? 0,
    },
  }
}

/** Busca por planta, cliente o correo (con tildes o sin ellas) en lo que muestra la tabla. */
export function coincideTexto(f: FilaEstado, texto: string, propuestas: Propuestas): boolean {
  const palabras = normalizar(texto).split(' ').filter(Boolean)
  if (palabras.length === 0) return true
  const pajar = normalizar([f.sold_to, f.ship_to, ...CAMPOS.flatMap((c) => valorMostrado(f, c, propuestas))].join(' '))
  return palabras.every((p) => pajar.includes(p))
}

/** ¿Todas las especies tienen la misma lista (y no vacía)? Entonces se muestra una sola celda. */
export function listaGeneral(mostrar: (campo: CampoLista) => string[]): string[] | null {
  const primera = mostrar(CATEGORIAS[0])
  if (primera.length === 0) return null
  return CATEGORIAS.every((c) => mismaLista(mostrar(c), primera)) ? primera : null
}
