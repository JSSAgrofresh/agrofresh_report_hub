import { useEffect, useMemo, useRef } from 'react'
import type { CSSProperties } from 'react'
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'
import { Card } from '@/components/ui/Card'
import {
  calcularKpis,
  cargasPorMes,
  cronologico,
  fechaDeCarga,
  fechaDeCarpeta,
  nombreEquipo,
  opcionesDeCampo,
  resumenPorEquipo,
} from '@/features/postventa'
import type { FiltroCargas, Periodo, ResumenCargaTrace } from '@/features/postventa'
import { formatDateCL } from '@/lib/locale'
import styles from './PostVentaResumen.module.css'

Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Filler,
  Legend,
  Tooltip,
)

// Los mismos tonos del detalle de una carga: pH azul, ORP naranjo. Manual y
// correo, los mismos del borde de cada carga en la lista de la izquierda.
const COLOR_PH = '#1C7FA6'
const COLOR_MV = '#eb6834'
const COLOR_MANUAL = '#6DAD3C'
const COLOR_EMAIL = '#4AADE0'
const COLOR_GRILLA = '#e1e5dc'
const COLOR_EJE = '#77837b'

const PERIODOS: { valor: Periodo; texto: string }[] = [
  { valor: 'todo', texto: 'Todo' },
  { valor: '365', texto: '12 meses' },
  { valor: '90', texto: '90 días' },
  { valor: '30', texto: '30 días' },
]

const MESES_CORTOS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
]

function num(v: number | null | undefined, decimales: number): string {
  if (v == null || Number.isNaN(v)) return '—'
  return v.toLocaleString('es-CL', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })
}

/** Nombre corto de una carga para ejes y tooltips. */
function nombreCarga(c: ResumenCargaTrace): string {
  if (c.equipo) return nombreEquipo(c.equipo)
  return [c.cliente, c.planta].filter(Boolean).join(' · ') || 'Carga sin datos'
}

/** Tarjeta de indicador con degradado. El texto va siempre en blanco sobre
 * tonos oscuros: el extremo claro de cada degradado sigue sobre 4:1 con el
 * blanco (la cifra es grande y en negrita), y el texto chico queda a la
 * izquierda, sobre el extremo oscuro. */
function Tile({
  etiqueta,
  valor,
  detalle,
  desde,
  hasta,
  textual,
}: {
  etiqueta: string
  valor: string
  detalle?: string
  desde?: string
  hasta?: string
  /** El valor es una fecha, no una cifra: va más chico para caber en una línea. */
  textual?: boolean
}) {
  const estilo =
    desde && hasta ? ({ '--desde': desde, '--hasta': hasta } as CSSProperties) : undefined
  return (
    <div className={`${styles.tile} ${estilo ? styles.tileColor : ''}`} style={estilo}>
      <span className={styles.tileEtiqueta}>{etiqueta}</span>
      <span className={`${styles.tileValor} ${textual ? styles.tileValorTexto : ''}`}>{valor}</span>
      {detalle && <span className={styles.tileDetalle}>{detalle}</span>}
    </div>
  )
}

/** Evolución de una medida (pH u ORP) entre cargas: un punto por carga, su
 * promedio. Cada medida en su propio gráfico: nunca comparten eje. */
function GraficoEvolucion({
  titulo,
  nota,
  cargas,
  valorDe,
  color,
  decimales,
  onSeleccionar,
}: {
  titulo: string
  nota: string
  cargas: ResumenCargaTrace[]
  valorDe: (c: ResumenCargaTrace) => number | null
  color: string
  decimales: number
  onSeleccionar: (carpeta: string) => void
}) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const chart = useRef<Chart | null>(null)
  const seleccionarRef = useRef(onSeleccionar)
  useEffect(() => {
    seleccionarRef.current = onSeleccionar
  })

  useEffect(() => {
    if (!ref.current) return
    chart.current?.destroy()
    const etiquetas = cargas.map((c) => {
      const f = fechaDeCarga(c)
      return f ? formatDateCL(f) : c.carpeta
    })
    chart.current = new Chart(ref.current, {
      type: 'line',
      data: {
        labels: etiquetas,
        datasets: [
          {
            label: titulo,
            data: cargas.map(valorDe),
            borderColor: color,
            backgroundColor: `${color}1F`,
            pointBackgroundColor: color,
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            borderWidth: 2,
            pointRadius: cargas.length > 80 ? 2 : 4,
            pointHoverRadius: 7,
            tension: 0.3,
            spanGaps: true,
            fill: 'origin',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => {
                const c = cargas[items[0]?.dataIndex ?? 0]
                return c ? `${fechaDeCarpeta(c.carpeta)} · ${nombreCarga(c)}` : ''
              },
              label: (ctx) => `${titulo}: ${num(ctx.parsed.y, decimales)}`,
              afterLabel: (ctx) => {
                const c = cargas[ctx.dataIndex]
                return c
                  ? `${c.n_registros.toLocaleString('es-CL')} mediciones · clic para abrir`
                  : ''
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: COLOR_EJE, maxTicksLimit: 7, maxRotation: 0, font: { size: 10 } },
          },
          y: {
            grid: { color: COLOR_GRILLA },
            border: { display: false },
            ticks: { color: COLOR_EJE, callback: (v) => num(Number(v), decimales === 0 ? 0 : 1) },
          },
        },
        onClick: (_evt, elements) => {
          const c = elements.length ? cargas[elements[0].index] : undefined
          if (c) seleccionarRef.current(c.carpeta)
        },
      },
    })
    return () => chart.current?.destroy()
  }, [titulo, cargas, valorDe, color, decimales])

  return (
    <Card className={styles.panel}>
      <div className={styles.panelCabeza}>
        <h3 className={styles.panelTitulo}>
          <i style={{ background: color }} aria-hidden="true" />
          {titulo}
        </h3>
        <span className={styles.panelNota}>{nota}</span>
      </div>
      <div className={styles.lienzo}>
        <canvas ref={ref} role="img" aria-label={titulo} />
      </div>
    </Card>
  )
}

function GraficoPorMes({ cargas }: { cargas: ResumenCargaTrace[] }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const chart = useRef<Chart | null>(null)
  const meses = useMemo(() => cargasPorMes(cargas), [cargas])

  useEffect(() => {
    if (!ref.current) return
    chart.current?.destroy()
    const etiqueta = (mes: string) => {
      const [a, m] = mes.split('-')
      return `${MESES_CORTOS[Number(m) - 1]} ${a.slice(2)}`
    }
    chart.current = new Chart(ref.current, {
      type: 'bar',
      data: {
        labels: meses.map((m) => etiqueta(m.mes)),
        datasets: [
          {
            label: 'Manual (Trace)',
            data: meses.map((m) => m.manual),
            backgroundColor: COLOR_MANUAL,
            borderRadius: 4,
            maxBarThickness: 34,
          },
          {
            label: 'Correo (automático)',
            data: meses.map((m) => m.email),
            backgroundColor: COLOR_EMAIL,
            borderRadius: 4,
            maxBarThickness: 34,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 10, boxHeight: 10, font: { size: 11 } },
          },
          tooltip: { mode: 'index', intersect: false },
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            ticks: { color: COLOR_EJE, font: { size: 10 } },
          },
          y: {
            stacked: true,
            beginAtZero: true,
            grid: { color: COLOR_GRILLA },
            border: { display: false },
            ticks: { color: COLOR_EJE, precision: 0 },
          },
        },
      },
    })
    return () => chart.current?.destroy()
  }, [meses])

  return (
    <Card className={styles.panel}>
      <div className={styles.panelCabeza}>
        <h3 className={styles.panelTitulo}>Cargas por mes</h3>
        <span className={styles.panelNota}>según cómo llegaron</span>
      </div>
      <div className={styles.lienzo}>
        <canvas ref={ref} role="img" aria-label="Cargas por mes" />
      </div>
    </Card>
  )
}

function TablaEquipos({
  cargas,
  equipoActivo,
  onEquipo,
}: {
  cargas: ResumenCargaTrace[]
  equipoActivo: string
  onEquipo: (equipo: string) => void
}) {
  const filas = useMemo(() => resumenPorEquipo(cargas), [cargas])
  const maximo = Math.max(1, ...filas.map((f) => f.cargas))
  return (
    <Card className={styles.panel}>
      <div className={styles.panelCabeza}>
        <h3 className={styles.panelTitulo}>Por equipo</h3>
        <span className={styles.panelNota}>clic para filtrar</span>
      </div>
      <div className={styles.equipos}>
        <div className={`${styles.equipoFila} ${styles.equipoCabeza}`}>
          <span>Equipo</span>
          <span>Cargas</span>
          <span>pH</span>
          <span>ORP</span>
        </div>
        {filas.slice(0, 8).map((f) => {
          const activo = equipoActivo && f.equipo.toLowerCase() === equipoActivo.toLowerCase()
          return (
            <button
              key={f.equipo}
              type="button"
              className={`${styles.equipoFila} ${activo ? styles.equipoActivo : ''}`}
              disabled={f.equipo === 'Sin equipo'}
              onClick={() => onEquipo(activo ? '' : f.equipo)}
              aria-pressed={Boolean(activo)}
            >
              <span className={styles.equipoNombre}>
                {f.equipo === 'Sin equipo' ? f.equipo : nombreEquipo(f.equipo)}
              </span>
              <span className={styles.equipoBarra}>
                <span style={{ width: `${(f.cargas / maximo) * 100}%` }} />
                <b>{f.cargas}</b>
              </span>
              <span className={styles.equipoNum}>{num(f.ph, 2)}</span>
              <span className={styles.equipoNum}>{num(f.mv, 0)}</span>
            </button>
          )
        })}
        {filas.length > 8 && <p className={styles.panelNota}>y {filas.length - 8} equipos más</p>}
      </div>
    </Card>
  )
}

/**
 * Vista general de Accu-Tab, arriba del detalle de una carga: filtros,
 * indicadores y la evolución entre cargas. Todo sale de la lista de cargas
 * que ya se pidió; no se baja ninguna medición extra.
 */
export function PostVentaResumen({
  todas,
  filtradas,
  filtro,
  onFiltro,
  onSeleccionar,
}: {
  todas: ResumenCargaTrace[]
  filtradas: ResumenCargaTrace[]
  filtro: FiltroCargas
  onFiltro: (f: FiltroCargas) => void
  onSeleccionar: (carpeta: string) => void
}) {
  const clientes = useMemo(() => opcionesDeCampo(todas, 'cliente'), [todas])
  const equipos = useMemo(() => opcionesDeCampo(todas, 'equipo'), [todas])
  const kpis = useMemo(() => calcularKpis(filtradas), [filtradas])
  const orden = useMemo(() => cronologico(filtradas), [filtradas])
  const hayFiltros = Boolean(filtro.cliente || filtro.equipo || filtro.periodo !== 'todo')

  return (
    <section className={styles.resumen} aria-label="Vista general">
      <div className={styles.barra}>
        <label className={styles.campo}>
          <span>Cliente</span>
          <select
            value={filtro.cliente}
            onChange={(e) => onFiltro({ ...filtro, cliente: e.target.value })}
          >
            <option value="">Todos</option>
            {clientes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.campo}>
          <span>Equipo</span>
          <select
            value={filtro.equipo}
            onChange={(e) => onFiltro({ ...filtro, equipo: e.target.value })}
          >
            <option value="">Todos</option>
            {equipos.map((e) => (
              <option key={e} value={e}>
                {nombreEquipo(e)}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.campo}>
          <span>Período</span>
          <div className={styles.segmentos} role="group" aria-label="Período">
            {PERIODOS.map((p) => (
              <button
                key={p.valor}
                type="button"
                aria-pressed={filtro.periodo === p.valor}
                className={filtro.periodo === p.valor ? styles.segmentoActivo : undefined}
                onClick={() => onFiltro({ ...filtro, periodo: p.valor })}
              >
                {p.texto}
              </button>
            ))}
          </div>
        </div>
        <span className={styles.conteo}>
          {filtradas.length.toLocaleString('es-CL')} de {todas.length.toLocaleString('es-CL')}{' '}
          cargas
        </span>
        {hayFiltros && (
          <button
            type="button"
            className={styles.limpiar}
            onClick={() => onFiltro({ cliente: '', equipo: '', periodo: 'todo' })}
          >
            Limpiar
          </button>
        )}
      </div>

      <div className={styles.tiles}>
        <Tile
          etiqueta="Cargas"
          valor={kpis.cargas.toLocaleString('es-CL')}
          detalle={`${kpis.porCorreo} por correo · ${kpis.cargas - kpis.porCorreo} manuales`}
        />
        <Tile
          etiqueta="Mediciones"
          valor={kpis.mediciones.toLocaleString('es-CL')}
          detalle="lecturas pH + ORP"
          desde="#3a2f8f"
          hasta="#5b47c4"
        />
        <Tile
          etiqueta="Equipos"
          valor={kpis.equipos.toLocaleString('es-CL')}
          detalle={`${kpis.clientes} cliente${kpis.clientes === 1 ? '' : 's'}`}
          desde="#0d3f52"
          hasta="#15627f"
        />
        <Tile
          etiqueta="pH promedio"
          valor={num(kpis.phPromedio, 2)}
          detalle="ponderado por mediciones"
          desde="#145f7c"
          hasta="#1C7FA6"
        />
        <Tile
          etiqueta="ORP promedio"
          valor={kpis.mvPromedio == null ? '—' : `${num(kpis.mvPromedio, 0)} mV`}
          detalle="ponderado por mediciones"
          desde="#a3401a"
          hasta="#c95424"
        />
        <Tile
          textual
          etiqueta="Última carga"
          valor={kpis.ultima ? formatDateCL(kpis.ultima) : '—'}
          detalle={kpis.ultima ? 'fecha de guardado' : undefined}
          desde="#0f5f58"
          hasta="#16857a"
        />
      </div>

      {filtradas.length === 0 ? (
        <Card className={styles.vacio}>No hay cargas con estos filtros.</Card>
      ) : (
        <div className={styles.grilla}>
          <GraficoEvolucion
            titulo="pH promedio por carga"
            nota="clic en un punto para abrir la carga"
            cargas={orden}
            valorDe={valorPh}
            color={COLOR_PH}
            decimales={2}
            onSeleccionar={onSeleccionar}
          />
          <GraficoEvolucion
            titulo="ORP promedio por carga (mV)"
            nota="en gráfico aparte: no comparte escala con el pH"
            cargas={orden}
            valorDe={valorMv}
            color={COLOR_MV}
            decimales={0}
            onSeleccionar={onSeleccionar}
          />
          <GraficoPorMes cargas={filtradas} />
          <TablaEquipos
            cargas={filtradas}
            equipoActivo={filtro.equipo}
            onEquipo={(equipo) => onFiltro({ ...filtro, equipo })}
          />
        </div>
      )}
    </section>
  )
}

// Fuera del componente: una función nueva en cada render recrearía el gráfico.
const valorPh = (c: ResumenCargaTrace) => c.ph_promedio
const valorMv = (c: ResumenCargaTrace) => c.mv_promedio
