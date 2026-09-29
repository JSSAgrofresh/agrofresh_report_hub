import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  LinearScale,
  Tooltip,
} from 'chart.js'
import type { Plugin, ScriptableContext } from 'chart.js'
import type { ClienteTop, PuntoSemana } from '@/features/auditoriaInterna'
import { ESTADOS, ORDEN_ESTADOS } from './estados'
import styles from './Graficos.module.css'

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip)

const TINTA_SUAVE = '#77837b'
const TINTA = '#16201b'
const REJILLA = '#e1e5dc'
const SUPERFICIE = '#ffffff'
const nf = new Intl.NumberFormat('es-CL')

/** Crea el gráfico al montar y lo destruye al cambiar los datos: un canvas no
 * admite dos Chart a la vez. */
function useGrafico(construir: (canvas: HTMLCanvasElement) => Chart, dependencias: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!ref.current) return
    const chart = construir(ref.current)
    return () => chart.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencias)
  return ref
}

/** Redondeo de 4px SOLO en el extremo libre de la pila (el último segmento con
 * datos), plano contra la base; los segmentos del medio quedan rectos. */
function redondeo(horizontal: boolean, valores: number[][]) {
  return (ctx: ScriptableContext<'bar'>) => {
    const i = ctx.dataIndex
    const d = ctx.datasetIndex
    if (!valores[d][i]) return 0
    const hayDespues = valores.slice(d + 1).some((serie) => serie[i] > 0)
    if (hayDespues) return 0
    return horizontal
      ? { topLeft: 0, topRight: 4, bottomLeft: 0, bottomRight: 4 }
      : { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 }
  }
}

function opcionesComunes(horizontal: boolean) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 350 },
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: TINTA,
        titleColor: '#fff',
        bodyColor: '#e6ebe4',
        footerColor: '#fff',
        padding: 10,
        cornerRadius: 8,
        boxPadding: 4,
        usePointStyle: true,
        titleFont: { weight: 600 as const },
        footerFont: { weight: 700 as const },
        // Los estados en cero no aportan: fuera del detalle.
        filter: (item: { parsed: { x: number | null; y: number | null } }) => ((horizontal ? item.parsed.x : item.parsed.y) ?? 0) > 0,
        callbacks: {
          // El valor lidera; el nombre del estado va después.
          label: (c: { parsed: { x: number | null; y: number | null }; dataset: { label?: string } }) =>
            ` ${nf.format((horizontal ? c.parsed.x : c.parsed.y) ?? 0)}  ${c.dataset.label ?? ''}`,
          footer: (items: { parsed: { x: number | null; y: number | null } }[]) => {
            const total = items.reduce((s, it) => s + ((horizontal ? it.parsed.x : it.parsed.y) ?? 0), 0)
            return `Total  ${nf.format(total)}`
          },
        },
      },
    },
  }
}

function conjuntos(series: Record<string, number[]>, horizontal: boolean) {
  const valores = ORDEN_ESTADOS.map((e) => series[e])
  return ORDEN_ESTADOS.map((e, idx) => ({
    label: ESTADOS[e].texto,
    data: series[e],
    backgroundColor: ESTADOS[e].color,
    // Un borde del color de la superficie hace de "hueco" de 2px entre segmentos y entre barras.
    borderColor: SUPERFICIE,
    borderWidth: 2,
    borderSkipped: false as const,
    borderRadius: redondeo(horizontal, valores),
    maxBarThickness: horizontal ? 20 : 24,
    stack: 'estados',
    order: idx,
  }))
}

export function GraficoSemanas({ puntos }: { puntos: PuntoSemana[] }) {
  const ref = useGrafico(
    (canvas) =>
      new Chart(canvas, {
        type: 'bar',
        data: {
          labels: puntos.map((p) => p.etiqueta),
          datasets: conjuntos(
            {
              concretada: puntos.map((p) => p.concretadas),
              sin_report: puntos.map((p) => p.sinReport),
              pendiente: puntos.map((p) => p.pendientes),
            },
            false,
          ),
        },
        options: {
          ...opcionesComunes(false),
          scales: {
            x: {
              stacked: true,
              grid: { display: false },
              border: { color: REJILLA },
              ticks: { color: TINTA_SUAVE, font: { size: 11 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 },
            },
            y: {
              stacked: true,
              beginAtZero: true,
              border: { display: false },
              grid: { color: REJILLA, lineWidth: 1 },
              ticks: { color: TINTA_SUAVE, font: { size: 11 }, precision: 0, maxTicksLimit: 5, padding: 8 },
            },
          },
        },
      }),
    [puntos],
  )
  return <canvas ref={ref} role="img" aria-label="Solicitudes emitidas por semana, según su estado" />
}

/** Escribe el total al final de cada barra horizontal: el valor va en la punta. */
const totalEnLaPunta: Plugin<'bar'> = {
  id: 'totalEnLaPunta',
  afterDatasetsDraw(chart) {
    const { ctx } = chart
    const n = chart.data.labels?.length ?? 0
    ctx.save()
    ctx.font = '600 12px "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif'
    ctx.fillStyle = TINTA
    ctx.textBaseline = 'middle'
    for (let i = 0; i < n; i++) {
      let total = 0
      let extremo = 0
      let y = 0
      chart.data.datasets.forEach((d, di) => {
        const v = Number((d.data as number[])[i]) || 0
        total += v
        const el = chart.getDatasetMeta(di).data[i]
        if (v > 0 && el) {
          extremo = Math.max(extremo, el.x)
          y = el.y
        }
      })
      if (total > 0) ctx.fillText(nf.format(total), extremo + 8, y)
    }
    ctx.restore()
  },
}

export function GraficoClientes({ clientes }: { clientes: ClienteTop[] }) {
  const ref = useGrafico(
    (canvas) =>
      new Chart(canvas, {
        type: 'bar',
        data: {
          labels: clientes.map((c) => c.cliente),
          datasets: conjuntos(
            {
              concretada: clientes.map((c) => c.concretadas),
              sin_report: clientes.map((c) => c.sinReport),
              pendiente: clientes.map((c) => c.pendientes),
            },
            true,
          ),
        },
        plugins: [totalEnLaPunta],
        options: {
          ...opcionesComunes(true),
          indexAxis: 'y',
          layout: { padding: { right: 36 } },
          scales: {
            x: {
              stacked: true,
              beginAtZero: true,
              border: { display: false },
              grid: { color: REJILLA, lineWidth: 1 },
              ticks: { color: TINTA_SUAVE, font: { size: 11 }, precision: 0, maxTicksLimit: 6, padding: 6 },
            },
            y: {
              stacked: true,
              grid: { display: false },
              border: { color: REJILLA },
              ticks: { color: TINTA, font: { size: 12 } },
            },
          },
        },
      }),
    [clientes],
  )
  return <canvas ref={ref} role="img" aria-label="Clientes con más solicitudes, según su estado" />
}

export function LeyendaEstados() {
  return (
    <ul className={styles.leyenda} aria-label="Leyenda de estados">
      {ORDEN_ESTADOS.map((e) => (
        <li key={e}>
          <span className={styles.muestra} style={{ background: ESTADOS[e].color }} />
          {ESTADOS[e].texto}
        </li>
      ))}
    </ul>
  )
}

/** Tarjeta de gráfico con su gemelo en tabla: los valores nunca dependen del
 * mouse ni del color. */
export function TarjetaGrafico({
  titulo,
  subtitulo,
  alto,
  tabla,
  children,
}: {
  titulo: string
  subtitulo: string
  alto: number
  tabla: { columnas: string[]; filas: (string | number)[][] }
  children: ReactNode
}) {
  const [verTabla, setVerTabla] = useState(false)
  return (
    <section className={styles.tarjeta}>
      <header className={styles.cabecera}>
        <div>
          <h3>{titulo}</h3>
          <p>{subtitulo}</p>
        </div>
        <button type="button" className={styles.alternar} aria-pressed={verTabla} onClick={() => setVerTabla((v) => !v)}>
          {verTabla ? 'Ver gráfico' : 'Ver tabla'}
        </button>
      </header>
      <LeyendaEstados />
      {verTabla ? (
        <div className={styles.tablaCaja} style={{ maxHeight: alto }}>
          <table className={styles.tabla}>
            <thead>
              <tr>{tabla.columnas.map((c, i) => <th key={c} className={i ? styles.num : undefined}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {tabla.filas.map((f, i) => (
                <tr key={i}>{f.map((v, j) => <td key={j} className={j ? styles.num : undefined}>{typeof v === 'number' ? nf.format(v) : v}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={styles.lienzo} style={{ height: alto }}>{children}</div>
      )}
    </section>
  )
}
