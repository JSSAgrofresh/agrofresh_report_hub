import { formatDateCL } from '@/lib/locale'

/**
 * Lógica pura de los gráficos de ALS en Report (línea de tiempo y serie de tiempo).
 *
 * ALS no mide residuos contra un límite: cada informe dice si el analito se detectó o no («<1», «ND») y, si se
 * detectó, cuánto. Por eso los gráficos muestran «hay / no hay» y el valor cuando lo hay. No juzgan si un valor es
 * bueno o malo: no hay límites cargados para ALS y no se inventan.
 */

/** Un resultado de un analito dentro de un informe, ya con su nombre y unidad de `analitosAls`. */
export interface ResultadoAlsVista {
  codigo: string
  nombre: string
  unidad: string
  orden: number
  /** Tal como lo escribió el laboratorio: «<1», «41», «>2400». */
  texto: string
  /** El número medido; `null` si el laboratorio no dio uno («<1», «ND»). Para «>2400» es 2400. */
  valor: number | null
  detectado: boolean
}

export interface InformeAlsVista {
  nro: string
  /** Fecha de muestreo, `aaaa-mm-dd`. */
  fecha: string | null
  resultados: ResultadoAlsVista[]
}

export interface ColorAnalito {
  fill: string
  /** Color del texto sobre `fill`, elegido para que se lea. */
  text: string
}

/** Verde y amarillo de la marca primero: Coliformes Totales y Escherichia coli salen siempre con esos dos. */
const PALETA: ColorAnalito[] = [
  { fill: '#6dad3c', text: '#10260a' },
  { fill: '#e8c32e', text: '#3b2f00' },
  { fill: '#4b7bd1', text: '#ffffff' },
  { fill: '#d9742a', text: '#ffffff' },
  { fill: '#2a9d8f', text: '#ffffff' },
  { fill: '#8a6f4d', text: '#ffffff' },
]
const SIN_COLOR: ColorAnalito = { fill: '#77837b', text: '#ffffff' }

/** El color depende del analito (su `orden` fijo), no de qué otros vengan en pantalla: el mismo analito siempre se ve igual. */
export function colorDeAnalitoAls(orden: number): ColorAnalito {
  return orden >= 1 && orden <= PALETA.length ? PALETA[orden - 1] : SIN_COLOR
}

/**
 * El número de un resultado escrito en texto: «>2400» → 2400 (se detectó, el laboratorio dio un tope); «<1», «ND»,
 * «No detectado» → `null`. Un texto que no es número ni límite («Presente») también da `null`.
 */
export function valorDeTexto(texto: string | null | undefined): number | null {
  const t = (texto ?? '').trim()
  const m = t.match(/^[>≥]\s*(\d+(?:[.,]\d+)?)$/)
  if (!m) return null
  const n = Number(m[1].replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export interface AnalitoLinea {
  codigo: string
  nombre: string
  unidad: string
  orden: number
  color: ColorAnalito
}

export interface InformeLinea {
  nro: string
  fecha: string | null
  /** `dd-mm-aaaa` o «Sin fecha». */
  fechaTxt: string
  porAnalito: Record<string, ResultadoAlsVista>
}

export interface DiaLinea {
  fecha: string | null
  etiqueta: string
  /** Posición (en `informes`) del primer y último informe de ese día. */
  desde: number
  hasta: number
  /** Días de calendario desde el día anterior con muestras; `null` en el primero y en «Sin fecha». */
  diasDesdeAnterior: number | null
}

export interface ModeloLinea {
  informes: InformeLinea[]
  analitos: AnalitoLinea[]
  /** Unidades distintas, en el orden de sus analitos: cada una tiene su propio eje en la serie de tiempo. */
  unidades: string[]
  dias: DiaLinea[]
}

const MS_DIA = 86_400_000
function diaUtc(fecha: string): number {
  return Date.UTC(Number(fecha.slice(0, 4)), Number(fecha.slice(5, 7)) - 1, Number(fecha.slice(8, 10)))
}

/** Los informes de más antiguo a más nuevo (por fecha de muestreo y, dentro del día, por N°), sus analitos y sus días. */
export function modeloLinea(informes: InformeAlsVista[]): ModeloLinea {
  const ordenados = [...informes].sort((a, b) => {
    if (a.fecha !== b.fecha) {
      if (a.fecha === null) return 1
      if (b.fecha === null) return -1
      return a.fecha < b.fecha ? -1 : 1
    }
    return a.nro.localeCompare(b.nro, 'es', { numeric: true })
  })

  const lineas: InformeLinea[] = ordenados.map((i) => ({
    nro: i.nro || '—',
    fecha: i.fecha,
    fechaTxt: i.fecha ? formatDateCL(i.fecha) : 'Sin fecha',
    porAnalito: Object.fromEntries(i.resultados.map((r) => [r.codigo, r])),
  }))

  const porCodigo = new Map<string, AnalitoLinea>()
  ordenados.forEach((i) =>
    i.resultados.forEach((r) => {
      if (!porCodigo.has(r.codigo))
        porCodigo.set(r.codigo, { codigo: r.codigo, nombre: r.nombre, unidad: r.unidad, orden: r.orden, color: colorDeAnalitoAls(r.orden) })
    }),
  )
  const analitos = [...porCodigo.values()].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'))
  const unidades = [...new Set(analitos.map((a) => a.unidad))]

  const dias: DiaLinea[] = []
  lineas.forEach((l, i) => {
    const ultimo = dias[dias.length - 1]
    if (ultimo && ultimo.fecha === l.fecha) {
      ultimo.hasta = i
      return
    }
    const anterior = ultimo?.fecha
    dias.push({
      fecha: l.fecha,
      etiqueta: l.fechaTxt,
      desde: i,
      hasta: i,
      diasDesdeAnterior: l.fecha && anterior ? Math.round((diaUtc(l.fecha) - diaUtc(anterior)) / MS_DIA) : null,
    })
  })
  return { informes: lineas, analitos, unidades, dias }
}

/** Hay un salto de eje (se dibuja cortado, con «N días después») cuando entre dos días con muestras pasa más de un día. */
export function hayCorte(dia: DiaLinea): boolean {
  return dia.diasDesdeAnterior !== null && dia.diasDesdeAnterior >= 2
}

/** Radio del círculo: crece con la raíz del valor (el área, con el valor) hasta `max`, el mayor de su unidad. */
export function radioDeValor(valor: number | null, max: number): number {
  if (valor === null || !(max > 0)) return 14
  return 8 + 20 * Math.sqrt(Math.min(Math.max(valor, 0) / max, 1))
}

/** Eje vertical con números redondos: hasta 4 intervalos de 1, 2 o 5 por una potencia de 10. */
export function escalaBonita(max: number): { max: number; marcas: number[] } {
  if (!(max > 0)) return { max: 4, marcas: [0, 1, 2, 3, 4] }
  const crudo = max / 4
  const pot = 10 ** Math.floor(Math.log10(crudo))
  const paso = [1, 2, 5, 10].map((k) => k * pot).find((p) => p >= crudo) ?? 10 * pot
  const intervalos = Math.ceil(max / paso)
  return { max: intervalos * paso, marcas: Array.from({ length: intervalos + 1 }, (_, i) => i * paso) }
}

/** Posición horizontal de cada informe: parejos, con un hueco extra donde el eje se corta. */
export function posicionesX(modelo: ModeloLinea, x0: number, paso: number, hueco: number): { xs: number[]; fin: number } {
  const corteAntesDe = new Set(modelo.dias.filter(hayCorte).map((d) => d.desde))
  const xs: number[] = []
  let x = x0 + paso / 2
  modelo.informes.forEach((_, i) => {
    if (corteAntesDe.has(i)) x += hueco
    xs.push(x)
    x += paso
  })
  return { xs, fin: x - paso / 2 }
}
