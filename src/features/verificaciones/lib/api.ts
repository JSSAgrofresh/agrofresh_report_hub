import { HttpError, httpClient } from '@/services/http/client'
import { descargarArchivo } from '@/services/http/descargar'
import type {
  ConfigVerificaciones,
  Gas,
  GasInput,
  Metodo,
  MetodoInput,
  Micropipeta,
  MicropipetaInput,
  Parametro,
  PesaPatron,
  PesaPatronInput,
  PuntoTemperatura,
  PuntoTemperaturaInput,
  Registro,
  RegistroInput,
  ResumenDia,
} from './tipos'

const BASE = '/verificaciones'

/** Todo lo que el formulario necesita para dibujarse, en una sola llamada:
 * son seis catálogos chicos y pedirlos por separado serían seis viajes. */
export function obtenerConfig() {
  return httpClient.get<ConfigVerificaciones>(`${BASE}/config`)
}

// --- El día ------------------------------------------------------------------

export function listarRegistros(desde?: string, hasta?: string) {
  return httpClient.get<ResumenDia[]>(`${BASE}/registros${rango(desde, hasta)}`)
}

/** Devuelve `null` cuando ese día todavía no tiene nada registrado, que es lo
 * normal al abrir el formulario en la mañana — no es un error que mostrar. */
export async function obtenerRegistro(fecha: string): Promise<Registro | null> {
  try {
    return await httpClient.get<Registro>(`${BASE}/registros/${fecha}`)
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null
    throw error
  }
}

export function guardarRegistro(fecha: string, datos: RegistroInput) {
  return httpClient.put<Registro>(`${BASE}/registros/${fecha}`, datos)
}

export function eliminarRegistro(fecha: string) {
  return httpClient.delete<{ estado: string }>(`${BASE}/registros/${fecha}`)
}

/** Los días completos de un rango, del más antiguo al más nuevo: es lo que
 * necesitan las tablas de histórico y los gráficos de tendencia. */
export function historico(desde?: string, hasta?: string) {
  return httpClient.get<Registro[]>(`${BASE}/historico${rango(desde, hasta)}`)
}

export function descargarDiaExcel(fecha: string) {
  return descargarArchivo(`${BASE}/registros/${fecha}/excel`, `verificaciones_diarias ${fecha}.xlsx`)
}

export function descargarDiaPdf(fecha: string) {
  return descargarArchivo(`${BASE}/registros/${fecha}/pdf`, `verificaciones_diarias ${fecha}.pdf`)
}

export function descargarHistoricoExcel(desde?: string, hasta?: string) {
  return descargarArchivo(`${BASE}/excel${rango(desde, hasta)}`, 'historico_verificaciones.xlsx')
}

function rango(desde?: string, hasta?: string): string {
  const partes = [desde && `desde=${desde}`, hasta && `hasta=${hasta}`].filter(Boolean)
  return partes.length ? `?${partes.join('&')}` : ''
}

// --- Criterios ---------------------------------------------------------------

export const micropipetasApi = crud<Micropipeta, MicropipetaInput>('/config/micropipetas')
export const pesasApi = crud<PesaPatron, PesaPatronInput>('/config/pesas')
export const puntosTemperaturaApi = crud<PuntoTemperatura, PuntoTemperaturaInput>(
  '/config/puntos-temperatura',
)
export const gasesApi = crud<Gas, GasInput>('/config/gases')
export const metodosApi = crud<Metodo, MetodoInput>('/config/metodos')

/** Los cuatro catálogos exponen el mismo CRUD sobre distintas rutas. */
function crud<T, TInput>(ruta: string) {
  return {
    crear: (datos: TInput) => httpClient.post<T>(`${BASE}${ruta}`, datos),
    actualizar: (id: number, datos: TInput) => httpClient.put<T>(`${BASE}${ruta}/${id}`, datos),
    eliminar: (id: number) => httpClient.delete<{ estado: string }>(`${BASE}${ruta}/${id}`),
  }
}

/** Los parámetros globales no se crean ni se borran: son un conjunto fijo que
 * el cálculo conoce por nombre. Solo cambia su valor. */
export function actualizarParametro(clave: string, valor: number) {
  return httpClient.put<Parametro>(`${BASE}/config/parametros/${clave}`, { valor })
}
