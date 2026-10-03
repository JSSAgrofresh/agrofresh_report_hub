/**
 * Amarre informe → OT en Converter (public/modules/converter.html). Si el PDF
 * trae la OT («N° Solicitud: OT-…»), esa manda y NUNCA se adivina por planta y
 * fecha: adivinar dejó 2026-1878-PC en OT-QUI0039 y 2026-1886-PC en OT-QUI0033.
 */
import { describe, expect, it } from 'vitest'
import html from '../../../../public/modules/converter.html?raw'

interface Abierta { archivo: string; numero_solicitud: string; laboratorio: string; ship_to: string; fecha_muestreo: string }
interface Amarre {
  fijar: (a: Abierta[] | null) => void
  sugerirOT: (inf: { datos: Record<string, unknown> }, tomadas: Set<string>) => string
}

function cargar(): Amarre {
  const logica = html.slice(html.indexOf('/* Lógica del conversor'), html.indexOf('/* ============ interfaz'))
  const fechas = html.slice(html.indexOf('// aFecha() deja las fechas'), html.indexOf('async function llamarIngest'))
  const ini = html.indexOf('/* ============ auditoría interna')
  const fin = html.indexOf('function etiquetaOT')
  expect(ini).toBeGreaterThan(0)
  expect(fin).toBeGreaterThan(ini)
  // Sin la parte que llama a la red ni a la pantalla.
  const amarre = html.slice(ini, fin).replace(/async function cargarAbiertas[\s\S]*?\n}\n/, '')
  return new Function(`${logica}\n${fechas}\n${amarre}\nreturn { fijar: (a) => { abiertas = a }, sugerirOT }`)() as Amarre
}

const ABIERTAS: Abierta[] = [
  { archivo: 'OT-QUI0039.xlsx', numero_solicitud: 'OT-QUI0039', laboratorio: 'QUITECA', ship_to: 'DOLE PLANTA CODEGUA', fecha_muestreo: '2026-09-29' },
  { archivo: 'OT-QUI0025.xlsx', numero_solicitud: 'OT-QUI0025', laboratorio: 'QUITECA', ship_to: 'DOLE PLANTA CODEGUA', fecha_muestreo: '2026-09-23' },
]
const informe = (extra: Record<string, unknown>) => ({
  datos: { Laboratorio: 'Quiteca', 'Ship To': 'DOLE PLANTA CODEGUA', 'Fecha Muestreo': '22-09-2026', ...extra },
})

describe('amarre del informe con su OT', () => {
  it('si el PDF trae la OT, se usa esa', () => {
    const a = cargar()
    a.fijar(ABIERTAS)
    expect(a.sugerirOT(informe({ OT: 'OT-QUI0025' }), new Set())).toBe('OT-QUI0025.xlsx')
  })

  it('si la OT del PDF no está libre, NO adivina otra de la misma planta', () => {
    const a = cargar()
    // Lo que pasó de verdad: OT-QUI0024 ya tenía un informe (por error) y la
    // única OT libre de esa planta era OT-QUI0039: el método viejo la elegía.
    a.fijar([ABIERTAS[0]])
    expect(a.sugerirOT(informe({ OT: 'OT-QUI0024' }), new Set())).toBe('')
  })

  it('sin OT en el PDF sigue sugiriendo por planta y fecha (solo si no hay duda)', () => {
    const a = cargar()
    a.fijar(ABIERTAS)
    expect(a.sugerirOT(informe({ OT: null, 'Fecha Muestreo': '23-09-2026' }), new Set())).toBe('OT-QUI0025.xlsx')
    expect(a.sugerirOT(informe({ OT: null, 'Fecha Muestreo': '01-01-2026' }), new Set())).toBe('')
  })
})
