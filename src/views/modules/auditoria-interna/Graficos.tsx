import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  LinearScale,
  Tooltip,
} from 'chart.js'
import type { Plugin, ScriptableContext } from 'chart.js'
import type { ClienteServicio, LaboratorioResumen, Totales } from '@/features/auditoriaInterna'
import { ESTADOS, ORDEN_ESTADOS } from './estados'
import { colorDeTipo } from './coloresTipo'
import styles from './Graficos.module.css'

Chart.register(ArcElement, DoughnutController, BarController, BarElement, CategoryScale, LinearScale, Tooltip)

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

const TOOLTIP = {
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
}

// ── donas por laboratorio ───────────────────────────────────────────────

/** Una dona: cómo van las solicitudes de un laboratorio (o de todos). El % del
 * centro es lo concretado; el resto de los estados se lee en la leyenda. */
export function DonaLaboratorio({
  titulo,
  resumen,
  destacada,
}: {
  titulo: string
  resumen: Totales
  /** la dona de «todos» se marca como el total */
  destacada?: boolean
}) {
  const ref = useGrafico(
    (canvas) =>
      new Chart(canvas, {
        type: 'doughnut',
        data: {
          labels: ORDEN_ESTADOS.map((e) => ESTADOS[e].texto),
          datasets: [
            {
              data: [resumen.concretadas, resumen.sinReport, resumen.pendientes],
              backgroundColor: ORDEN_ESTADOS.map((e) => ESTADOS[e].color),
              borderColor: SUPERFICIE,
              borderWidth: 2,
              hoverOffset: 3,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '72%',
          animation: { duration: 350 },
          plugins: {
            legend: { display: false },
            tooltip: {
              ...TOOLTIP,
              callbacks: {
                label: (c) => ` ${nf.format(Number(c.raw))}  ${c.label}`,
                footer: () => `Total  ${nf.format(resumen.emitidas)}`,
              },
            },
          },
        },
      }),
    [resumen.concretadas, resumen.sinReport, resumen.pendientes, resumen.emitidas],
  )
  const cantidades: Record<string, number> = {
    concretada: resumen.concretadas,
    sin_report: resumen.sinReport,
    pendiente: resumen.pendientes,
  }
  return (
    <section className={`${styles.dona} ${destacada ? styles.donaTotal : ''}`} aria-label={`Estado de las solicitudes: ${titulo}`}>
      <h3>{titulo}</h3>
      <div className={styles.donaLienzo}>
        <canvas ref={ref} role="img" aria-label={`${titulo}: ${Math.round(resumen.porcentajeConcretado)}% concretadas`} />
        <div className={styles.donaCentro} aria-hidden="true">
          <b>{Math.round(resumen.porcentajeConcretado)}<small>%</small></b>
          <span>concretadas</span>
        </div>
      </div>
      <p className={styles.donaTotalTexto}>
        <b>{nf.format(resumen.concretadas)}</b> de {nf.format(resumen.emitidas)} solicitudes
      </p>
      <ul className={styles.donaLeyenda}>
        {ORDEN_ESTADOS.map((e) => (
          <li key={e}>
            <span className={styles.muestra} style={{ background: ESTADOS[e].color }} />
            {ESTADOS[e].texto}
            <b>{nf.format(cantidades[e])}</b>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ── total por laboratorio (barras apiladas) ─────────────────────────────

/** Redondeo de 4px SOLO en el extremo libre de la pila, plano contra la base. */
function redondeoPila(valores: number[][]) {
  return (ctx: ScriptableContext<'bar'>) => {
    const i = ctx.dataIndex
    const d = ctx.datasetIndex
    if (!valores[d][i]) return 0
    if (valores.slice(d + 1).some((serie) => serie[i] > 0)) return 0
    return { topLeft: 0, topRight: 4, bottomLeft: 0, bottomRight: 4 }
  }
}

/** Escribe el total al final de cada barra apilada: el valor va en la punta. */
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

export function GraficoTotalPorLaboratorio({ laboratorios }: { laboratorios: LaboratorioResumen[] }) {
  const series = {
    concretada: laboratorios.map((l) => l.concretadas),
    sin_report: laboratorios.map((l) => l.sinReport),
    pendiente: laboratorios.map((l) => l.pendientes),
  }
  const valores = ORDEN_ESTADOS.map((e) => series[e])
  const ref = useGrafico(
    (canvas) =>
      new Chart(canvas, {
        type: 'bar',
        data: {
          labels: laboratorios.map((l) => l.laboratorio),
          datasets: ORDEN_ESTADOS.map((e, idx) => ({
            label: ESTADOS[e].texto,
            data: series[e],
            backgroundColor: ESTADOS[e].color,
            borderColor: SUPERFICIE,
            borderWidth: 2,
            borderSkipped: false as const,
            borderRadius: redondeoPila(valores),
            maxBarThickness: 26,
            stack: 'estados',
            order: idx,
          })),
        },
        plugins: [totalEnLaPunta],
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 350 },
          interaction: { mode: 'index', intersect: false },
          layout: { padding: { right: 36 } },
          plugins: {
            legend: { display: false },
            tooltip: {
              ...TOOLTIP,
              filter: (item) => (item.parsed.x ?? 0) > 0,
              callbacks: {
                label: (c) => ` ${nf.format(c.parsed.x ?? 0)}  ${c.dataset.label ?? ''}`,
                footer: (items) => `Total  ${nf.format(items.reduce((s, it) => s + (it.parsed.x ?? 0), 0))}`,
              },
            },
          },
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
    [laboratorios],
  )
  return <canvas ref={ref} role="img" aria-label="Total de solicitudes por laboratorio, según su estado" />
}

// ── análisis vs informes por cliente y tipo de servicio ─────────────────

/** Por cliente, hasta 4 barras: para cada tipo de servicio elegido, los
 * análisis pedidos (color pleno) y los informes concretados (el mismo color,
 * más claro). El número va en la punta de cada barra. */
export function GraficoClienteServicio({ clientes, tipos }: { clientes: ClienteServicio[]; tipos: string[] }) {
  const datasets = tipos.flatMap((tipo) => [
    {
      tipo, clave: 'analisis' as const, label: `${tipo} · análisis`,
      data: clientes.map((c) => c.tipos[tipo]?.analisis ?? 0), color: colorDeTipo(tipo),
    },
    {
      tipo, clave: 'informes' as const, label: `${tipo} · informes`,
      data: clientes.map((c) => c.tipos[tipo]?.informes ?? 0), color: `${colorDeTipo(tipo)}66`,
    },
  ])
  const valorEnLaPunta: Plugin<'bar'> = {
    id: 'valorEnLaPunta',
    afterDatasetsDraw(chart) {
      const { ctx } = chart
      ctx.save()
      ctx.font = '600 11px "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif'
      ctx.fillStyle = TINTA
      ctx.textBaseline = 'middle'
      chart.data.datasets.forEach((d, di) => {
        chart.getDatasetMeta(di).data.forEach((el, i) => {
          const v = Number((d.data as number[])[i]) || 0
          if (v > 0) ctx.fillText(nf.format(v), el.x + 6, el.y)
        })
      })
      ctx.restore()
    },
  }
  const ref = useGrafico(
    (canvas) =>
      new Chart(canvas, {
        type: 'bar',
        data: {
          labels: clientes.map((c) => c.cliente),
          datasets: datasets.map((d) => ({
            label: d.label,
            data: d.data,
            backgroundColor: d.color,
            borderColor: SUPERFICIE,
            borderWidth: 1,
            borderRadius: { topLeft: 0, topRight: 4, bottomLeft: 0, bottomRight: 4 },
            borderSkipped: false as const,
            barThickness: 11,
          })),
        },
        plugins: [valorEnLaPunta],
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 350 },
          interaction: { mode: 'index', intersect: false },
          layout: { padding: { right: 30 } },
          datasets: { bar: { categoryPercentage: 0.86, barPercentage: 0.96 } },
          plugins: {
            legend: { display: false },
            tooltip: {
              ...TOOLTIP,
              callbacks: { label: (c) => ` ${nf.format(c.parsed.x ?? 0)}  ${c.dataset.label ?? ''}` },
            },
          },
          scales: {
            x: {
              beginAtZero: true,
              border: { display: false },
              grid: { color: REJILLA, lineWidth: 1 },
              ticks: { color: TINTA_SUAVE, font: { size: 11 }, precision: 0, maxTicksLimit: 6, padding: 6 },
            },
            y: {
              grid: { display: false },
              border: { color: REJILLA },
              ticks: { color: TINTA, font: { size: 12 } },
            },
          },
        },
      }),
    [clientes, tipos.join('|')],
  )
  return <canvas ref={ref} role="img" aria-label="Análisis pedidos e informes concretados por cliente y tipo de servicio" />
}

// ── piezas comunes ──────────────────────────────────────────────────────

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

/** Leyenda del gráfico por cliente: color = tipo de servicio; pleno = análisis,
 * claro = informes. Así ningún dato depende solo del color. */
export function LeyendaTipos({ tipos }: { tipos: string[] }) {
  return (
    <ul className={styles.leyenda} aria-label="Leyenda">
      {tipos.map((t) => (
        <li key={t} className={styles.leyendaTipo}>
          <span className={styles.pareja}>
            <span className={styles.muestra} style={{ background: colorDeTipo(t) }} />
            <span className={styles.muestra} style={{ background: `${colorDeTipo(t)}66` }} />
          </span>
          {t}
          <em>análisis · informes</em>
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
  leyenda,
  controles,
  children,
}: {
  titulo: string
  subtitulo: string
  alto: number
  tabla: { columnas: string[]; filas: (string | number)[][] }
  leyenda: ReactNode
  /** botones propios del gráfico (por ejemplo, el tipo de servicio) */
  controles?: ReactNode
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
        <div className={styles.acciones}>
          {controles}
          <button type="button" className={styles.alternar} aria-pressed={verTabla} onClick={() => setVerTabla((v) => !v)}>
            {verTabla ? 'Ver gráfico' : 'Ver tabla'}
          </button>
        </div>
      </header>
      {leyenda}
      {verTabla ? (
        <div className={styles.tablaCaja} style={{ maxHeight: Math.min(alto, 420) }}>
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

