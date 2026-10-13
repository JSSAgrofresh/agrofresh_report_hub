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
import type { LaboratorioResumen, PanelAnalisis, Totales } from '@/features/auditoriaInterna'
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

/** Un panel por laboratorio y análisis (ALS · FSMA, Quiteca · Análisis de residuos en fruta…) con
 * sus mejores clientes: cuántos análisis pidió cada uno y cuántos ya tienen informe. */
export function GraficoAnalisisPorLaboratorio({ paneles, nombre }: { paneles: PanelAnalisis[]; nombre: string }) {
  return (
    <div className={styles.paneles}>
      {paneles.map((p) => {
        const color = COLOR_LAB[p.laboratorio] ?? '#6b7770'
        const maximo = Math.max(1, ...p.filas.map((f) => f.analisis))
        return (
          <section key={`${p.laboratorio}|${p.analisis}`} className={styles.panelAnalisis} style={{ borderTopColor: color }} aria-label={`${NOMBRE_LAB[p.laboratorio] ?? p.laboratorio}: ${p.analisis}`}>
            <header>
              <span className={styles.laboratorio}>
                <i style={{ background: color }} />
                {NOMBRE_LAB[p.laboratorio] ?? p.laboratorio}
              </span>
              <h4>{p.analisis}</h4>
              <p>
                <b>{nf.format(p.total)}</b> análisis pedidos · <b>{nf.format(p.informes)}</b> con informe
              </p>
            </header>
            <ol>
              {p.filas.map((f, i) => (
                <li key={f.grupo} className={i < 3 ? styles.top : undefined}>
                  <span className={styles.puesto} data-puesto={i < 3 ? i + 1 : undefined}>{i + 1}</span>
                  <span className={styles.nombreFila} title={f.grupo}>{f.grupo}</span>
                  <span
                    className={styles.pistaAnalisis}
                    style={{ width: `${(f.analisis / maximo) * 100}%`, background: `${color}30` }}
                    role="img"
                    aria-label={`${f.grupo}: ${f.informes} de ${f.analisis} con informe`}
                  >
                    <span style={{ width: `${(f.informes / f.analisis) * 100}%`, background: color }} />
                  </span>
                  <span className={styles.contador}>
                    <b>{nf.format(f.analisis)}</b>
                    <small>{f.informes} con informe</small>
                  </span>
                </li>
              ))}
            </ol>
            {p.nGrupos > p.filas.length && (
              <p className={styles.masFilas}>y {nf.format(p.nGrupos - p.filas.length)} {nombre.toLowerCase()} más</p>
            )}
          </section>
        )
      })}
    </div>
  )
}

/** La misma información en tabla: laboratorio · análisis · grupo, con sus análisis e informes. */
export function TablaGrupoLaboratorio({ paneles, nombre }: { paneles: PanelAnalisis[]; nombre: string }) {
  return (
    <div className={styles.tablaGrupo}>
      <table>
        <thead>
          <tr>
            <th>Laboratorio</th>
            <th>Análisis</th>
            <th>{nombre}</th>
            <th className={styles.num}>Análisis pedidos</th>
            <th className={styles.num}>Con informe</th>
            <th>Avance</th>
          </tr>
        </thead>
        <tbody>
          {paneles.flatMap((p) =>
            p.filas.map((f, i) => {
              const color = COLOR_LAB[p.laboratorio] ?? '#6b7770'
              const pct = Math.round((f.informes / f.analisis) * 100)
              return (
                <tr key={`${p.laboratorio}|${p.analisis}|${f.grupo}`} className={i === 0 ? styles.inicioPanel : undefined}>
                  <td>{i === 0 && <><span className={styles.puntoLab} style={{ background: color }} />{NOMBRE_LAB[p.laboratorio] ?? p.laboratorio}</>}</td>
                  <td className={styles.analisisTabla}>{i === 0 ? p.analisis : ''}</td>
                  <th scope="row" title={f.grupo}>{f.grupo}</th>
                  <td className={styles.num}><b>{nf.format(f.analisis)}</b></td>
                  <td className={styles.num}>{nf.format(f.informes)}</td>
                  <td>
                    <span className={styles.celdaLab}>
                      <span className={styles.pista} style={{ background: `${color}26` }}>
                        <span className={styles.relleno} style={{ width: `${pct}%`, background: color }} />
                      </span>
                      {pct}%
                    </span>
                  </td>
                </tr>
              )
            }),
          )}
        </tbody>
      </table>
    </div>
  )
}

/** Leyenda del gráfico por análisis: color = laboratorio; barra llena = informes
 * concretados, clara = análisis aún sin informe. Siempre salen los cuatro. */
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
      <li className={styles.leyendaTipo}><em>largo = análisis pedidos · lleno = con informe</em></li>
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
  vistaTabla,
  children,
}: {
  titulo: string
  subtitulo: string
  /** Sin `alto`, el contenido manda (listas); con él, el lienzo de un gráfico. */
  alto?: number
  tabla: { columnas: string[]; filas: (string | number)[][] }
  leyenda: ReactNode
  /** botones propios del gráfico (por ejemplo, el tipo de servicio) */
  controles?: ReactNode
  /** Si viene, reemplaza la tabla genérica al pulsar «Ver tabla». */
  vistaTabla?: ReactNode
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
      {verTabla && vistaTabla ? (
        vistaTabla
      ) : verTabla ? (
        <div className={styles.tablaCaja} style={{ maxHeight: Math.min(alto ?? 420, 420) }}>
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
        <div className={styles.lienzo} style={alto ? { height: alto } : undefined}>{children}</div>
      )}
    </section>
  )
}

