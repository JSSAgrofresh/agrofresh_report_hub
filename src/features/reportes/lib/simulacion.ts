import type { Analito, FilaReporte, LimiteAnalito } from './tipos'

/**
 * Datos de prueba para ver Report con volumen de verdad (hoy la base tiene
 * pocas solicitudes). Todo vive en memoria de la pantalla: nunca se manda al
 * backend, nunca se guarda, y desaparece al salir de Report, al recargar o al
 * apretar «Actualizar».
 *
 * Los clientes, sucursales y límites son INVENTADOS a propósito y se nota en
 * el nombre: nada de esto puede confundirse con un dato real. En particular
 * los límites residuales: los reales los define el laboratorio (ver
 * CLAUDE.md), estos solo existen para que la dona de cumplimiento tenga algo
 * que mostrar durante la simulación.
 */

export interface DatosSimulados {
  filas: FilaReporte[]
  analitos: Analito[]
  limites: LimiteAnalito[]
  totalSolicitudes: number
}

/** Generador pseudoaleatorio con semilla (mulberry32): la misma semilla da
 * siempre los mismos datos, así los tests son estables. */
function crearAzar(semilla: number) {
  let a = semilla >>> 0
  const siguiente = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const elegir = <T>(lista: readonly T[]): T => lista[Math.floor(siguiente() * lista.length)]
  /** Normal estándar (Box-Muller). */
  const normal = () => {
    const u = Math.max(siguiente(), 1e-9)
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * siguiente())
  }
  return { siguiente, elegir, normal }
}

// Rango objetivo ficticio de cada ingrediente (ppm). Los códigos son los del
// catálogo real para que cada uno salga con su color de siempre.
const INGREDIENTES = [
  { codigo: 'IMZ', nombre: 'Imazalil (simulado)', min: 1.0, central: 2.0, max: 3.0 },
  { codigo: 'FDL', nombre: 'Fludioxonil (simulado)', min: 0.8, central: 1.6, max: 2.5 },
  { codigo: 'PYR', nombre: 'Pirimetanil (simulado)', min: 1.2, central: 2.4, max: 3.5 },
  { codigo: 'TBZ', nombre: 'Tiabendazol (simulado)', min: 1.5, central: 3.0, max: 4.5 },
  { codigo: 'DPA', nombre: 'Difenilamina (simulado)', min: 2.0, central: 3.5, max: 5.0 },
  { codigo: 'AZOX', nombre: 'Azoxistrobina (simulado)', min: 0.5, central: 1.1, max: 1.8 },
] as const

const ESPECIES: { especie: string; variedades: string[]; peso: number }[] = [
  { especie: 'Cereza', variedades: ['Lapins', 'Santina', 'Regina', 'Sweetheart'], peso: 5 },
  { especie: 'Manzana', variedades: ['Gala', 'Fuji', 'Granny Smith', 'Pink Lady'], peso: 4 },
  { especie: 'Pera', variedades: ['Packham', 'Abate Fetel', 'Forelle'], peso: 2 },
  { especie: 'Arándano', variedades: ['Duke', 'Legacy', 'Brigitta'], peso: 2 },
  { especie: 'Kiwi', variedades: ['Hayward'], peso: 1 },
  { especie: 'Palta', variedades: ['Hass'], peso: 1 },
  { especie: 'Nectarina', variedades: ['August Red', 'Venus'], peso: 1 },
]

// "Sim." en el nombre: si alguien saca una captura, no pasa por un cliente real.
const CLIENTES: { cliente: string; plantas: string[]; peso: number }[] = [
  {
    cliente: 'Frutícola Los Andes (Sim.)',
    plantas: ['Planta Los Andes', 'Planta San Felipe'],
    peso: 4,
  },
  {
    cliente: 'Exportadora Valle Central (Sim.)',
    plantas: ['Planta Rancagua', 'Planta Rengo', 'Planta Requínoa'],
    peso: 5,
  },
  { cliente: 'Agrícola Del Maule (Sim.)', plantas: ['Planta Talca', 'Planta Curicó'], peso: 3 },
  { cliente: 'Packing Sur (Sim.)', plantas: ['Planta Chillán'], peso: 2 },
  { cliente: 'Frutas del Pacífico (Sim.)', plantas: ['Planta Linderos', 'Planta Buin'], peso: 3 },
  { cliente: 'Cooperativa Cachapoal (Sim.)', plantas: ['Planta Peumo'], peso: 1 },
]

const TIPOS_SERVICIO = ['Línea de proceso', 'Drencher', 'Termonebulización']
const TIPOS_APLICACION = ['Ducha', 'Aspersión', 'Termonebulización', 'Cera']
const POSICIONES = ['Entrada línea', 'Salida línea', 'Bins', 'Cámara']

function elegirPonderado<T extends { peso: number }>(lista: T[], u: number): T {
  const total = lista.reduce((s, x) => s + x.peso, 0)
  let r = u * total
  for (const x of lista) {
    r -= x.peso
    if (r < 0) return x
  }
  return lista[lista.length - 1]
}

/** Semana ISO (1-53) de una fecha UTC. */
function semanaIso(fecha: Date): number {
  const d = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()))
  const dia = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dia)
  const inicioAno = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - inicioAno.getTime()) / 86400000 + 1) / 7)
}

function iso(fecha: Date): string {
  return fecha.toISOString().slice(0, 10)
}

/**
 * `resultados` filas de resultado (cada solicitud trae 1 a 3 ingredientes), con
 * fechas repartidas en los 12 meses anteriores a `hoy`. Un ~8 % cae fuera del
 * rango objetivo y un ~4 % viene como "ND" (sin valor numérico), igual que en
 * los datos reales.
 */
export function generarDatosSimulados(
  resultados = 1000,
  semilla = 20260928,
  hoy = new Date(),
): DatosSimulados {
  const azar = crearAzar(semilla)
  const filas: FilaReporte[] = []
  const finUtc = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())
  const DIAS = 365
  let solicitud = 0

  while (filas.length < resultados) {
    solicitud += 1
    const cliente = elegirPonderado(CLIENTES, azar.siguiente())
    const especie = elegirPonderado(ESPECIES, azar.siguiente())
    // Más muestras en temporada (nov-mar): se nota la estacionalidad en el gráfico.
    let fecha: Date
    do {
      fecha = new Date(finUtc - Math.floor(azar.siguiente() * DIAS) * 86400000)
    } while ([3, 4, 5, 6, 7, 8].includes(fecha.getUTCMonth()) && azar.siguiente() < 0.55)

    const base = {
      solicitud_id: -solicitud,
      nro_solicitud: `SIM-${String(solicitud).padStart(4, '0')}`,
      laboratorio: 'Agrofresh',
      fecha_muestreo: iso(fecha),
      fecha_entrada: iso(fecha),
      especie: especie.especie,
      variedad: azar.elegir(especie.variedades),
      semana_muestreo: semanaIso(fecha),
      mes: fecha.getUTCMonth() + 1,
      temporada: fecha.getUTCMonth() >= 6 ? fecha.getUTCFullYear() + 1 : fecha.getUTCFullYear(),
      tipo_servicio: azar.elegir(TIPOS_SERVICIO),
      posicion_muestreo: azar.elegir(POSICIONES),
      cliente: cliente.cliente,
      planta: azar.elegir(cliente.plantas),
      tipo_aplicacion: azar.elegir(TIPOS_APLICACION),
    }

    const cuantos = 1 + Math.floor(azar.siguiente() * 3)
    const usados = new Set<string>()
    for (let i = 0; i < cuantos && filas.length < resultados; i++) {
      const ing = azar.elegir(INGREDIENTES)
      if (usados.has(ing.codigo)) continue
      usados.add(ing.codigo)
      if (azar.siguiente() < 0.04) {
        filas.push({ ...base, ingrediente: ing.codigo, valor_num: null, valor_texto: 'ND' })
        continue
      }
      // Casi todo dentro del rango, con una cola a ambos lados.
      const ancho = (ing.max - ing.min) / 2
      let valor = ing.central + azar.normal() * ancho * 0.45
      if (azar.siguiente() < 0.08)
        valor =
          azar.siguiente() < 0.5
            ? ing.min * (0.3 + azar.siguiente() * 0.6)
            : ing.max * (1.05 + azar.siguiente() * 0.5)
      valor = Math.max(0.01, Math.round(valor * 1000) / 1000)
      filas.push({ ...base, ingrediente: ing.codigo, valor_num: valor, valor_texto: null })
    }
  }

  const analitos: Analito[] = INGREDIENTES.map((ing, i) => ({
    id: -(i + 1),
    codigo: ing.codigo,
    nombre: ing.nombre,
    categoria: 'Fungicida',
    laboratorio: 'Agrofresh',
    unidad: 'ppm',
    limite_deteccion: null,
    limite_cuantificacion: null,
    matriz: null,
    activo: true,
    limite_min: null,
    limite_central: null,
    limite_max: null,
  }))

  const limites: LimiteAnalito[] = INGREDIENTES.map((ing, i) => ({
    id: -(i + 1),
    analito_id: -(i + 1),
    especie: '',
    tipo_servicio: '',
    limite_min: ing.min,
    limite_central: ing.central,
    limite_max: ing.max,
  }))

  return {
    filas,
    analitos,
    limites,
    totalSolicitudes: new Set(filas.map((f) => f.solicitud_id)).size,
  }
}
