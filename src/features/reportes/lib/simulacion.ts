import { crearAzar } from '@/lib/azar'
import { limitesDeEspecie } from './limitesResiduales'
import type { Analito, FichaInforme, FilaReporte, LimiteAnalito, Observacion } from './tipos'

/**
 * Datos de prueba para ver Report con volumen de verdad (hoy la base tiene
 * pocas solicitudes). Todo vive en memoria: nunca se manda al backend, nunca se
 * guarda, y desaparece al recargar la página (o al volver a los datos reales).
 * Simula los tres análisis de Report: residuos (AgroFresh), FSMA (ALS) y
 * fitopatología (Diagnofruit).
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

// Ingredientes de residuos. Los códigos son los del catálogo real para que cada uno salga con su color de siempre. Los
// rangos NO son inventados: cada especie usa los límites residuales reales (`LIMITES_RESIDUALES`), y solo aparecen los
// analitos que esa tabla evalúa para ella.
const INGREDIENTES = [
  { codigo: 'IMZ', nombre: 'Imazalil (simulado)' },
  { codigo: 'FDL', nombre: 'Fludioxonil (simulado)' },
  { codigo: 'PYR', nombre: 'Pirimetanil (simulado)' },
  { codigo: 'TBZ', nombre: 'Tiabendazol (simulado)' },
  { codigo: 'DPA', nombre: 'Difenilamina (simulado)' },
  { codigo: 'AZOX', nombre: 'Azoxistrobina (simulado)' },
  { codigo: 'TEBU', nombre: 'Tebuconazol (simulado)' },
] as const

const ESPECIES: { especie: string; variedades: string[]; peso: number }[] = [
  { especie: 'Cerezas', variedades: ['Lapins', 'Santina', 'Regina', 'Sweetheart'], peso: 5 },
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

const CODIGOS_ALS = [
  { codigo: 'COLIF100', nombre: 'Coliformes Totales (simulado)', unidad: 'UFC/100 mL' },
  { codigo: 'ECOLI100', nombre: 'Escherichia coli (simulado)', unidad: 'UFC/100 mL' },
] as const

const CODIGOS_FITO = [
  { codigo: 'LEV', nombre: 'Levaduras (simulado)', unidad: 'UFC/mL' },
  { codigo: 'BOT', nombre: 'Botrytis (simulado)', unidad: 'conidia/mL' },
  { codigo: 'ALT', nombre: 'Alternaria (simulado)', unidad: 'conidia/mL' },
  { codigo: 'GEO', nombre: 'Geotrichum (simulado)', unidad: 'esporas/mL' },
  { codigo: 'PEN', nombre: 'Penicillium (simulado)', unidad: 'conidia/mL' },
] as const

/**
 * `resultados` filas de resultado en total, repartidas entre los tres análisis: 60 % residuos, 20 % FSMA (ALS) y 20 %
 * fitopatología (Diagnofruit). Fechas repartidas en los 12 meses anteriores a `hoy`. En residuos, un ~8 % cae fuera del
 * rango objetivo y un ~4 % viene como "ND"; en FSMA la mayoría es «<1» (no detectado) con algunos recuentos y «>2400»;
 * en fitopatología la mayoría es «ND» con algunos conteos y «>100», igual que en los datos reales.
 */
export function generarDatosSimulados(
  resultados = 300,
  semilla = 20260928,
  hoy = new Date(),
): DatosSimulados {
  const azar = crearAzar(semilla)
  const filas: FilaReporte[] = []
  const finUtc = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())
  const DIAS = 365
  let solicitud = 0
  const nResiduos = Math.round(resultados * 0.6)
  const nFsma = Math.round(resultados * 0.2)
  const topeResiduos = nResiduos
  const topeFsma = nResiduos + nFsma
  const topeFito = resultados

  /** Una solicitud nueva: cliente, fecha (más muestras en temporada, nov-mar) y su numeración. */
  function nuevaBase(laboratorio: string, conEspecie: boolean, soloConLimites = false) {
    solicitud += 1
    const cliente = elegirPonderado(CLIENTES, azar.siguiente())
    const especie = elegirPonderado(
      soloConLimites ? ESPECIES.filter((e) => limitesDeEspecie(e.especie) != null) : ESPECIES,
      azar.siguiente(),
    )
    let fecha: Date
    do {
      fecha = new Date(finUtc - Math.floor(azar.siguiente() * DIAS) * 86400000)
    } while ([3, 4, 5, 6, 7, 8].includes(fecha.getUTCMonth()) && azar.siguiente() < 0.55)
    return {
      solicitud_id: -solicitud,
      nro_solicitud: `SIM-${String(solicitud).padStart(4, '0')}`,
      laboratorio,
      fecha_muestreo: iso(fecha),
      fecha_entrada: iso(fecha),
      // ALS no informa especie ni variedad.
      especie: conEspecie ? especie.especie : null,
      variedad: conEspecie ? azar.elegir(especie.variedades) : null,
      semana_muestreo: semanaIso(fecha),
      mes: fecha.getUTCMonth() + 1,
      temporada: fecha.getUTCMonth() >= 6 ? fecha.getUTCFullYear() + 1 : fecha.getUTCFullYear(),
      tipo_servicio: azar.elegir(TIPOS_SERVICIO),
      posicion_muestreo: azar.elegir(POSICIONES),
      cliente: cliente.cliente,
      planta: azar.elegir(cliente.plantas),
      tipo_aplicacion: azar.elegir(TIPOS_APLICACION),
    }
  }

  // Residuos (AgroFresh).
  while (filas.length < topeResiduos) {
    const base = nuevaBase('Agrofresh', true, true)
    // Solo los analitos que la tabla de límites evalúa para la especie de este informe.
    const rangos = limitesDeEspecie(base.especie) ?? {}
    const codigos = Object.keys(rangos)
    const cuantos = Math.min(codigos.length, 1 + Math.floor(azar.siguiente() * 3))
    const usados = new Set<string>()
    for (let i = 0; i < cuantos && filas.length < topeResiduos; i++) {
      const codigo = azar.elegir(codigos)
      if (usados.has(codigo)) continue
      usados.add(codigo)
      if (azar.siguiente() < 0.04) {
        filas.push({ ...base, ingrediente: codigo, valor_num: null, valor_texto: 'ND' })
        continue
      }
      // Dentro del rango de su especie (la franja del medio, sin pegarse a los bordes); solo ~4 % se escapa, a un lado u otro.
      const { min, max } = rangos[codigo]
      let valor = min + (max - min) * (0.2 + azar.siguiente() * 0.6)
      if (azar.siguiente() < 0.04) valor = azar.siguiente() < 0.5 ? min * (0.6 + azar.siguiente() * 0.35) : max * (1.05 + azar.siguiente() * 0.3)
      valor = Math.max(0.01, Math.round(valor * 1000) / 1000)
      filas.push({ ...base, ingrediente: codigo, valor_num: valor, valor_texto: null })
    }
  }

  // FSMA (ALS): cada informe trae Coliformes Totales y E. coli.
  while (filas.length < topeFsma) {
    const base = nuevaBase('ALS (Corthon)', false)
    for (const a of CODIGOS_ALS) {
      if (filas.length >= topeFsma) break
      const u = azar.siguiente()
      if (u < 0.78) filas.push({ ...base, ingrediente: a.codigo, valor_num: null, valor_texto: '<1' })
      else if (u < 0.95) filas.push({ ...base, ingrediente: a.codigo, valor_num: 1 + Math.floor(azar.siguiente() * 300), valor_texto: null })
      else filas.push({ ...base, ingrediente: a.codigo, valor_num: null, valor_texto: '>2400' })
    }
  }

  // Fitopatología (Diagnofruit): cada informe trae los cinco patógenos.
  while (filas.length < topeFito) {
    const base = nuevaBase('Diagnofruit', true)
    for (const a of CODIGOS_FITO) {
      if (filas.length >= topeFito) break
      const u = azar.siguiente()
      if (u < 0.55) filas.push({ ...base, ingrediente: a.codigo, valor_num: null, valor_texto: 'ND' })
      else if (u < 0.93) filas.push({ ...base, ingrediente: a.codigo, valor_num: 1 + Math.floor(azar.siguiente() * 250), valor_texto: null })
      else filas.push({ ...base, ingrediente: a.codigo, valor_num: null, valor_texto: '>100' })
    }
  }

  const analitos: Analito[] = [
    ...INGREDIENTES.map((ing) => ({ codigo: ing.codigo, nombre: ing.nombre, categoria: 'Fungicida', laboratorio: 'Agrofresh', unidad: 'ppm' })),
    ...CODIGOS_ALS.map((a) => ({ codigo: a.codigo, nombre: a.nombre, categoria: 'Microbiología', laboratorio: 'Als', unidad: a.unidad })),
    ...CODIGOS_FITO.map((a) => ({ codigo: a.codigo, nombre: a.nombre, categoria: 'Fitopatología', laboratorio: 'Diagnofruit', unidad: a.unidad })),
  ].map((a, i) => ({
    id: -(i + 1),
    ...a,
    limite_deteccion: null,
    limite_cuantificacion: null,
    matriz: null,
    activo: true,
    limite_min: null,
    limite_central: null,
    limite_max: null,
  }))

  // Límites: los reales de la tabla del laboratorio, por especie (solo residuos; ALS y Diagnofruit no tienen franja).
  const limites: LimiteAnalito[] = []
  for (const e of ESPECIES) {
    const rangos = limitesDeEspecie(e.especie)
    if (!rangos) continue
    for (const [codigo, r] of Object.entries(rangos)) {
      const analito = analitos.find((x) => x.codigo === codigo && x.laboratorio === 'Agrofresh')
      if (!analito) continue
      limites.push({
        id: -(limites.length + 1),
        analito_id: analito.id,
        especie: e.especie,
        tipo_servicio: '',
        limite_min: r.min,
        limite_central: (r.min + r.max) / 2,
        limite_max: r.max,
      })
    }
  }

  return {
    filas,
    analitos,
    limites,
    totalSolicitudes: new Set(filas.map((f) => f.solicitud_id)).size,
  }
}

const MUESTREADORES = ['Claudia Guerrero', 'Melissa Molina', 'Barly Fuentes', 'Carlos Rojas']

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha.slice(0, 10)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/**
 * La ficha de un informe simulado, con la misma forma que `GET /reportes/informe/{id}`: resultados, datos del informe
 * (laboratorio, fechas, línea, lote, muestreador…) y sin PDF. Se arma con las filas del informe y datos de apoyo que se
 * derivan de su número, así el mismo informe siempre muestra lo mismo. Nada viaja al servidor.
 */
export function fichaSimulada(filas: Observacion[], analitos: Analito[]): FichaInforme {
  const base = filas[0]
  const n = Math.abs(base.solicitudId)
  const fecha = base.fecha ?? '2026-01-01'
  const porCodigo = new Map(analitos.map((a) => [a.codigo, a]))
  const esAls = (base.laboratorio ?? '').toLowerCase().startsWith('als')
  return {
    solicitud: {
      id: base.solicitudId,
      nro_solicitud: base.nroSolicitud,
      cliente: base.cliente,
      planta: base.planta,
      laboratorio: base.laboratorio,
      tipo_aplicacion: base.tipoAplicacion,
      especie: base.crop,
      variedad: base.variedad,
      fecha_muestreo: fecha,
      hora_muestreo: `${String(8 + (n % 9)).padStart(2, '0')}:${String((n * 7) % 60).padStart(2, '0')}`,
      fecha_recepcion: sumarDias(fecha, 1),
      fecha_entrada: sumarDias(fecha, 1),
      fecha_analisis: sumarDias(fecha, 2),
      fecha_informe: sumarDias(fecha, 3),
      semana_muestreo: base.semana,
      posicion_muestreo: base.posicionMuestreo,
      tipo_muestra: esAls ? 'Agua' : 'Fruta',
      nro_linea: String(1 + (n % 4)),
      lote: String(1000 + ((n * 37) % 9000)),
      kg_procesados: base.laboratorio === 'Agrofresh' ? String(2 + (n % 3)) : null,
      nombre_muestreador: MUESTREADORES[n % MUESTREADORES.length],
      solicitante: 'AGROFRESH',
      referencia: `OT-SIM${String(n).padStart(4, '0')}`,
    },
    resultados: filas.map((f) => {
      const a = f.ingrediente ? porCodigo.get(f.ingrediente) : undefined
      return {
        codigo: f.ingrediente,
        nombre: a?.nombre ?? f.ingrediente,
        categoria: a?.categoria ?? null,
        unidad: a?.unidad ?? 'ppm',
        valor_num: f.ppm,
        valor_texto: f.valorTexto,
        producto: null,
        dosis: null,
        gasto: null,
        tipo_aplicacion: f.tipoAplicacion,
        linea_proceso: null,
      }
    }),
    carga: null,
    toma: null,
    pdf: { disponible: false },
  }
}
