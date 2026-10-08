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
import { LABORATORIOS_GRAFICO, NOMBRE_LAB, nombreTipo, tituloDonaTipo } from '@/features/auditoriaInterna'
import type { GrupoLaboratorios, LaboratorioResumen, Totales } from '@/features/auditoriaInterna'
import { ESTADOS, ESTADOS_DONA, ORDEN_ESTADOS } from './estados'
import { COLOR_LAB, colorDeTipo, tonosDeTipo } from './coloresTipo'
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

// ── donas por tipo de servicio ──────────────────────────────────────────

/** Una dona por tipo de servicio: cómo van sus solicitudes. El color es el del
 * tipo y el estado se lee por el tono; el % del centro es lo concretado. */
export function DonaTipoServicio({ tipo, resumen }: { tipo: string; resumen: Totales }) {
  const tonos = tonosDeTipo(tipo)
  // El PDF sin Report no se muestra aparte: cuenta como solicitud enviada.
  const enviadas = resumen.pendientes + resumen.sinReport
  const ref = useGrafico(
    (canvas) =>
      new Chart(canvas, {
        type: 'doughnut',
        data: {
          labels: ['Informes recibidos', 'Sin informe aún'],
          datasets: [
            {
              data: [resumen.concretadas, enviadas],
              backgroundColor: ESTADOS_DONA.map((e) => tonos[e]),
              borderColor: SUPERFICIE,
              borderWidth: 2,
              hoverOffset: 3,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '68%',
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
    [tipo, resumen.concretadas, enviadas, resumen.emitidas],
  )
  return (
    <section className={styles.dona} aria-label={`Estado de las solicitudes de ${nombreTipo(tipo)}`}>
      <h3>
        <span className={styles.puntoTipo} style={{ background: colorDeTipo(tipo) }} />
        {tituloDonaTipo(tipo)}
      </h3>
      {resumen.emitidas === 0 ? (
        <p className={styles.donaVacia}>Sin solicitudes de este tipo con los filtros actuales.</p>
      ) : (
        <>
          <div className={styles.donaLienzo}>
            <canvas ref={ref} role="img" aria-label={`${nombreTipo(tipo)}: ${Math.round(resumen.porcentajeConcretado)}% informes recibidos`} />
            <div className={styles.donaCentro} aria-hidden="true">
              <b style={{ color: colorDeTipo(tipo) }}>{Math.round(resumen.porcentajeConcretado)}<small>%</small></b>
              <span>informes recibidos</span>
            </div>
          </div>
          <p className={styles.donaTotalTexto}>
            <b>{nf.format(resumen.concretadas)}</b> de {nf.format(resumen.emitidas)} solicitudes
          </p>
          <ul className={styles.donaLeyenda}>
            <li>
              <span className={styles.muestra} style={{ background: 'transparent', border: `2px solid ${colorDeTipo(tipo)}` }} />
              Solicitudes hechas
              <b>{nf.format(resumen.emitidas)}</b>
            </li>
            <li>
              <span className={styles.muestra} style={{ background: tonos.concretada }} />
              Informes recibidos
              <b>{nf.format(resumen.concretadas)}</b>
            </li>
            <li>
              <span className={styles.muestra} style={{ background: tonos.pendiente }} />
              Sin informe aún
              <b>{nf.format(enviadas)}</b>
            </li>
          </ul>
        </>
      )}
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

// ── análisis vs informes por grupo, con los 4 laboratorios ──────────────

/** Rol de cada dataset, por su índice: el tooltip y las etiquetas lo consultan. */
interface MetaBarra {
  lab: string
  rol: 'informes' | 'resto'
}

/** Escribe, dentro de cada barra, el % de informes concretados sobre lo pedido;
 * si la barra es muy corta para el texto, va justo a su derecha. Al final de
 * la barra va «informes / análisis». */
function etiquetasDeLaboratorio(grupos: GrupoLaboratorios[], metas: MetaBarra[]): Plugin<'bar'> {
  return {
    id: 'etiquetasDeLaboratorio',
    afterDatasetsDraw(chart) {
      const { ctx } = chart
      ctx.save()
      ctx.font = '600 10.5px "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif'
      ctx.textBaseline = 'middle'
      grupos.forEach((g, i) => {
        LABORATORIOS_GRAFICO.forEach((lab) => {
          const par = g.labs[lab]
          if (!par || par.analisis === 0) return
          const iInf = metas.findIndex((m) => m.lab === lab && m.rol === 'informes')
          const iRes = metas.findIndex((m) => m.lab === lab && m.rol === 'resto')
          const elInf = chart.getDatasetMeta(iInf).data[i]
          const elRes = chart.getDatasetMeta(iRes).data[i]
          if (!elInf || !elRes) return
          const x0 = chart.scales.x.getPixelForValue(0)
          const x1 = par.informes === par.analisis ? elInf.x : elRes.x
          const y = elInf.y
          const pct = `${Math.round((par.informes / par.analisis) * 100)}%`
          const ancho = x1 - x0
          if (ancho >= ctx.measureText(pct).width + 10) {
            // Dentro: sobre lo sólido es blanco; si casi no hay sólido, tinta.
            const solido = elInf.x - x0
            ctx.fillStyle = par.informes > 0 && solido >= ancho / 2 ? '#fff' : TINTA
            ctx.textAlign = 'center'
            ctx.fillText(pct, x0 + ancho / 2, y)
            ctx.textAlign = 'left'
            ctx.fillStyle = TINTA_SUAVE
            ctx.fillText(`${par.informes}/${par.analisis}`, x1 + 6, y)
          } else {
            ctx.fillStyle = TINTA
            ctx.textAlign = 'left'
            ctx.fillText(`${pct}  ${par.informes}/${par.analisis}`, x1 + 6, y)
          }
        })
      })
      ctx.restore()
    },
  }
}

/** Por grupo (Sold To, Ship To, especie o tipo de servicio), una barra por cada
 * uno de los cuatro laboratorios: su largo son los análisis pedidos, la parte
 * sólida los informes concretados y el % de adentro es esa proporción. */
export function GraficoGrupoLaboratorio({ grupos }: { grupos: GrupoLaboratorios[] }) {
  const metas: MetaBarra[] = LABORATORIOS_GRAFICO.flatMap((lab) => [
    { lab, rol: 'informes' as const },
    { lab, rol: 'resto' as const },
  ])
  const ref = useGrafico(
    (canvas) =>
      new Chart(canvas, {
        type: 'bar',
        data: {
          labels: grupos.map((g) => g.grupo),
          datasets: metas.map((m) => {
            const color = COLOR_LAB[m.lab]
            return {
              label: `${NOMBRE_LAB[m.lab]} · ${m.rol === 'informes' ? 'informes' : 'sin informe'}`,
              data: grupos.map((g) => {
                const par = g.labs[m.lab]
                if (!par) return null
                const v = m.rol === 'informes' ? par.informes : par.analisis - par.informes
                return v > 0 ? v : null // un 0 no se dibuja (ni su borde)
              }),
              backgroundColor: m.rol === 'informes' ? color : `${color}40`,
              borderColor: SUPERFICIE,
              borderWidth: 0,
              borderRadius: 0,
              borderSkipped: false as const,
              stack: m.lab,
              barThickness: 15,
            }
          }),
        },
        plugins: [etiquetasDeLaboratorio(grupos, metas)],
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 350 },
          interaction: { mode: 'index', intersect: false },
          layout: { padding: { right: 64 } },
          datasets: { bar: { categoryPercentage: 0.9, barPercentage: 1 } },
          plugins: {
            legend: { display: false },
            tooltip: {
              ...TOOLTIP,
              // una línea por laboratorio con datos (se muestra desde la parte «informes»)
              filter: (item) => {
                const m = metas[item.datasetIndex]
                return m.rol === 'informes' && (grupos[item.dataIndex]?.labs[m.lab]?.analisis ?? 0) > 0
              },
              callbacks: {
                label: (c) => {
                  const m = metas[c.datasetIndex]
                  const par = grupos[c.dataIndex].labs[m.lab]
                  const pct = Math.round((par.informes / par.analisis) * 100)
                  return ` ${NOMBRE_LAB[m.lab]}: ${nf.format(par.informes)} de ${nf.format(par.analisis)} (${pct}%)`
                },
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
    [grupos],
  )
  return <canvas ref={ref} role="img" aria-label="Análisis pedidos e informes concretados, con su porcentaje, por laboratorio" />
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

/** Leyenda del gráfico por grupo: color = laboratorio; sólido = informes
 * concretados, claro = análisis aún sin informe. Siempre salen los cuatro. */
export function LeyendaLaboratorios() {
  return (
    <ul className={styles.leyenda} aria-label="Leyenda">
      {LABORATORIOS_GRAFICO.map((l) => (
        <li key={l} className={styles.leyendaTipo}>
          <span className={styles.pareja}>
            <span className={styles.muestra} style={{ background: COLOR_LAB[l] }} />
            <span className={styles.muestra} style={{ background: `${COLOR_LAB[l]}40` }} />
          </span>
          {NOMBRE_LAB[l]}
        </li>
      ))}
      <li className={styles.leyendaTipo}><em>sólido = informes · claro = sin informe · % dentro de la barra = informes / análisis</em></li>
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

