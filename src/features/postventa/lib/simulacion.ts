import { crearAzar } from '@/lib/azar'
import type { CargaTrace, FilaTrace, ResumenCargaTrace } from './api'

/**
 * Informes Accu-Tab inventados para ver la pantalla con volumen de verdad. Viven en memoria (ver `features/simulacion`):
 * no existen en el servidor, no tienen PDF y desaparecen al recargar. Los clientes llevan «(Sim.)» a propósito.
 */
export interface AccutabSimulado {
  informes: ResumenCargaTrace[]
  /** Las mediciones de un informe simulado; `null` si la carpeta no es simulada. */
  detalle: (carpeta: string) => CargaTrace | null
}

const CLIENTES = [
  { cliente: 'Frutícola Los Andes (Sim.)', plantas: ['Planta Los Andes', 'Planta San Felipe'] },
  { cliente: 'Exportadora Valle Central (Sim.)', plantas: ['Planta Rancagua', 'Planta Rengo'] },
  { cliente: 'Agrícola Del Maule (Sim.)', plantas: ['Planta Talca'] },
]
const POSICIONES = ['Entrada línea', 'Salida línea', 'Cámara']
const EQUIPOS = ['ACCUTAB_SIM_1', 'ACCUTAB_SIM_2', 'ACCUTAB_SIM_3']

const dos = (n: number) => String(n).padStart(2, '0')

function promedio(valores: number[]): number | null {
  return valores.length ? valores.reduce((s, v) => s + v, 0) / valores.length : null
}

function estadistica(valores: number[]) {
  const prom = promedio(valores)
  if (prom == null) return { min: null, max: null, prom: null, desv: null, rMin: null, rMax: null }
  const desv = Math.sqrt(valores.reduce((s, v) => s + (v - prom) ** 2, 0) / valores.length)
  return { min: Math.min(...valores), max: Math.max(...valores), prom, desv, rMin: null, rMax: null }
}

/** `cantidad` informes repartidos en los últimos 90 días, cada uno con ~120 lecturas de pH y ORP cada 10 minutos. */
export function generarAccutabSimulado(cantidad = 30, semilla = 20261027, hoy = new Date()): AccutabSimulado {
  const azar = crearAzar(semilla)
  const fin = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate(), 12)
  const cargas: CargaTrace[] = []

  for (let i = 0; i < cantidad; i++) {
    const cliente = azar.elegir(CLIENTES)
    const equipoIdx = Math.floor(azar.siguiente() * EQUIPOS.length)
    const momento = new Date(fin - Math.floor(azar.siguiente() * 90) * 86400000 + Math.floor(azar.siguiente() * 36000) * 1000)
    const carpeta = `${momento.getUTCFullYear()}-${dos(momento.getUTCMonth() + 1)}-${dos(momento.getUTCDate())}_${dos(momento.getUTCHours())}-${dos(momento.getUTCMinutes())}-${dos(momento.getUTCSeconds())}`
    const centroPh = 7.0 + equipoIdx * 0.15
    const centroMv = 650 + equipoIdx * 25
    const n = 100 + Math.floor(azar.siguiente() * 40)
    const inicio = momento.getTime() - n * 600000
    const filas: FilaTrace[] = []
    for (let k = 0; k < n; k++) {
      const t = new Date(inicio + k * 600000)
      filas.push({
        ts: t.getTime(),
        fecha: `${t.getUTCFullYear()}-${dos(t.getUTCMonth() + 1)}-${dos(t.getUTCDate())}`,
        hora: `${dos(t.getUTCHours())}:${dos(t.getUTCMinutes())}:${dos(t.getUTCSeconds())}`,
        modo: null,
        ph: Math.round((centroPh + Math.sin(k / 9) * 0.25 + azar.normal() * 0.05) * 100) / 100,
        mv: Math.round(centroMv + Math.cos(k / 11) * 30 + azar.normal() * 6),
        temp: Math.round((18 + azar.normal() * 0.8) * 10) / 10,
        archivo: 'historydata.csv',
        desfase: 0,
      })
    }
    const ph = filas.map((f) => f.ph as number)
    const mv = filas.map((f) => f.mv as number)
    cargas.push({
      carpeta,
      guardado_en: momento.toISOString(),
      cliente: cliente.cliente,
      planta: azar.elegir(cliente.plantas),
      ubicacion: azar.elegir(POSICIONES),
      equipo: EQUIPOS[equipoIdx],
      responsable: null,
      n_registros: n,
      ph_promedio: promedio(ph),
      mv_promedio: promedio(mv),
      tiene_pdf: false,
      n_archivos: 0,
      origen: 'email',
      limites: { phMin: 6.5, phMax: 8.0, mvMin: 600, mvMax: 750 },
      estadisticas: { n, ph: estadistica(ph), mv: estadistica(mv) },
      filas,
      archivos: [],
    })
  }

  cargas.sort((a, b) => b.carpeta.localeCompare(a.carpeta))
  const porCarpeta = new Map(cargas.map((c) => [c.carpeta, c]))
  const informes: ResumenCargaTrace[] = cargas.map((c) => ({
    carpeta: c.carpeta,
    guardado_en: c.guardado_en,
    cliente: c.cliente,
    planta: c.planta,
    ubicacion: c.ubicacion,
    equipo: c.equipo,
    responsable: c.responsable,
    n_registros: c.n_registros,
    ph_promedio: c.ph_promedio,
    mv_promedio: c.mv_promedio,
    tiene_pdf: false,
    n_archivos: 0,
    origen: c.origen,
  }))
  return { informes, detalle: (carpeta) => porCarpeta.get(carpeta) ?? null }
}
