import type { SolicitudAuditoria } from './tipos'

/**
 * Solicitudes inventadas para ver el panel de Auditoría interna con volumen de
 * verdad. Todo vive en memoria de la pantalla: nunca va al backend y se pierde
 * al salir, recargar o apretar «Actualizar». Los clientes llevan «(Sim.)» y las
 * solicitudes «SIM-», para que una captura nunca pase por un dato real.
 */

/** Generador con semilla (mulberry32): misma semilla, mismos datos. */
function crearAzar(semilla: number) {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const CLIENTES = [
  { cliente: 'Frutícola Los Andes (Sim.)', plantas: ['Planta Los Andes', 'Planta San Felipe'], peso: 4 },
  { cliente: 'Exportadora Valle Central (Sim.)', plantas: ['Planta Rancagua', 'Planta Rengo'], peso: 5 },
  { cliente: 'Agrícola Del Maule (Sim.)', plantas: ['Planta Talca', 'Planta Curicó'], peso: 3 },
  { cliente: 'Packing Sur (Sim.)', plantas: ['Planta Chillán'], peso: 2 },
  { cliente: 'Frutas del Pacífico (Sim.)', plantas: ['Planta Linderos', 'Planta Buin'], peso: 3 },
]
const ESPECIES = [
  { especie: 'Cereza', variedad: 'Lapins' },
  { especie: 'Manzana', variedad: 'Gala' },
  { especie: 'Pera', variedad: 'Packham' },
  { especie: 'Arándano', variedad: 'Duke' },
  { especie: 'Kiwi', variedad: 'Hayward' },
]
const ANALITOS = ['IMZ', 'FDL', 'PYR', 'TBZ', 'DPA']
const DIAS = 270

const dos = (n: number) => String(n).padStart(2, '0')
const aIso = (d: Date, hora: number) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(hora)}:${dos((hora * 7) % 60)}:00`

/** `n` solicitudes repartidas en los últimos ~9 meses hasta `hoy`. */
export function simularSolicitudes(n = 1000, hoy: Date = new Date(), semilla = 20260930): SolicitudAuditoria[] {
  const azar = crearAzar(semilla)
  const elegir = <T,>(l: readonly T[]) => l[Math.floor(azar() * l.length)]
  const pesados = CLIENTES.flatMap((c) => Array<(typeof CLIENTES)[number]>(c.peso).fill(c))
  const salida: SolicitudAuditoria[] = []

  for (let i = 0; i < n; i++) {
    // Más solicitudes hacia los meses recientes, como un negocio que crece.
    const atras = Math.floor(Math.pow(azar(), 1.4) * DIAS)
    const dia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - atras)
    const c = elegir(pesados)
    const e = elegir(ESPECIES)
    const lab = azar() < 0.58 ? 'Quiteca' : 'Agrofresh'
    const r = azar()
    const estado = r < 0.55 ? 'concretada' : r < 0.63 ? 'sin_report' : 'pendiente'
    const emitida = aIso(dia, 8 + Math.floor(azar() * 9))
    const nro = `SIM-${String(i + 1).padStart(4, '0')}`
    const conInforme = estado !== 'pendiente'
    salida.push({
      archivo: `${nro}.xlsx`,
      numero_solicitud: nro,
      laboratorio: lab,
      sold_to: c.cliente,
      ship_to: elegir(c.plantas),
      especie: e.especie,
      variedad: e.variedad,
      tipo_servicio: azar() < 0.62 ? 'Línea de proceso' : 'Actimist',
      analitos: ANALITOS.filter(() => azar() < 0.45).slice(0, 4),
      fecha_solicitud: emitida.slice(0, 10),
      fecha_muestreo: emitida.slice(0, 10),
      emitida_en: emitida,
      informe: conInforme
        ? { id: -(i + 1), nro_informe: nro, nombre_archivo: `${nro}.pdf`, ruta: `${lab}/${nro}.pdf`, cargado_en: emitida, fecha_envio: null }
        : null,
      en_report: estado === 'concretada',
      concretada: estado === 'concretada',
    })
  }
  return salida
}
