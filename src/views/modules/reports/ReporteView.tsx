import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'
import type { ChartDataset } from 'chart.js'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { BuscableSelect } from '@/components/ui/BuscableSelect'
import { MultiSelectFiltro } from '@/components/ui/MultiSelectFiltro'
import { areaDeModulo } from '@/constants/areas'
import { useAuth } from '@/features/auth'
import { HttpError } from '@/services/http/client'
import { formatDateCL, formatDecimalCL } from '@/lib/locale'
import {
  calcularCumplimiento,
  calcularEstadisticas,
  calcularLimitesControl,
  colorDeIngrediente,
  contarFueraDeIntervalo,
  listarAnalitos,
  obtenerDatosReporte,
  proximaHoraProgramada,
  useActualizacionProgramada,
} from '@/features/reportes'
import type { Analito, FilaReporte, Observacion } from '@/features/reportes'
import { AnalitosAdminModal } from './AnalitosAdminModal'
import styles from './ReporteView.module.css'

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  ArcElement,
  DoughnutController,
  BarController,
  BarElement,
)

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

function unique(valores: (string | number | null | undefined)[]): string[] {
  return [...new Set(valores.filter((v) => v !== null && v !== undefined && v !== '').map(String))].sort((a, b) =>
    a.localeCompare(b, 'es', { numeric: true }),
  )
}

type Vista = 'residual' | 'control'
type Estado = 'cargando' | 'ok' | 'error'

interface Filtros {
  ingredientes: string[]
  cliente: string
  planta: string
  tipoAplicacion: string
  laboratorio: string
  crop: string
  semana: string
  mes: string
}

const FILTROS_VACIOS: Filtros = {
  ingredientes: [],
  cliente: '',
  planta: '',
  tipoAplicacion: '',
  laboratorio: '',
  crop: '',
  semana: '',
  mes: '',
}

function filtrosActivos(f: Filtros): boolean {
  return f.ingredientes.length > 0 || Boolean(f.cliente || f.planta || f.tipoAplicacion || f.laboratorio || f.crop || f.semana || f.mes)
}

const FMT_HORA = new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit' })

/** `clienteFijo`: usado por el portal de cliente — cuando viene seteado, los
 * datos ya llegan filtrados por el backend (nunca se filtran solo en el
 * navegador) y el filtro de Cliente ni siquiera se muestra. */
export function ReporteView({ clienteFijo }: { clienteFijo?: string } = {}) {
  const { user } = useAuth()
  const acento = areaDeModulo('reports')?.colorPrimario ?? '#6dad3c'
  const wrapStyle = { '--acento': acento } as CSSProperties

  const [filas, setFilas] = useState<FilaReporte[] | null>(null)
  const [totalSolicitudes, setTotalSolicitudes] = useState(0)
  const [analitos, setAnalitos] = useState<Analito[]>([])
  const [estado, setEstado] = useState<Estado>('cargando')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date | null>(null)
  const [proximaAuto, setProximaAuto] = useState<Date>(() => proximaHoraProgramada(new Date()))
  const [vista, setVista] = useState<Vista>('residual')
  const [sigma, setSigma] = useState(2)
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS)
  const [modalAnalitos, setModalAnalitos] = useState(false)

  const obtenerTodo = useCallback(async () => {
    const [datos, catalogo] = await Promise.all([obtenerDatosReporte(clienteFijo), listarAnalitos()])
    return { filas: datos.filas, totalSolicitudes: datos.total_solicitudes, analitos: catalogo }
  }, [clienteFijo])

  function aplicarExito(r: { filas: FilaReporte[]; totalSolicitudes: number; analitos: Analito[] }) {
    setFilas(r.filas)
    setTotalSolicitudes(r.totalSolicitudes)
    setAnalitos(r.analitos)
    setEstado('ok')
    setUltimaActualizacion(new Date())
    setProximaAuto(proximaHoraProgramada(new Date()))
  }

  function aplicarError(err: unknown) {
    setEstado('error')
    setErrorMsg(
      err instanceof HttpError
        ? `El backend respondió con un error (${err.status}).`
        : 'No se pudo conectar con el backend. Revisa que esté corriendo (ver backend/README.md).',
    )
  }

  async function cargar() {
    setEstado('cargando')
    setErrorMsg(null)
    try {
      aplicarExito(await obtenerTodo())
    } catch (err) {
      aplicarError(err)
    }
  }

  useEffect(() => {
    let cancelado = false
    obtenerTodo()
      .then((r) => {
        if (!cancelado) aplicarExito(r)
      })
      .catch((err: unknown) => {
        if (!cancelado) aplicarError(err)
      })
    return () => {
      cancelado = true
    }
  }, [obtenerTodo])
  useActualizacionProgramada(() => void cargar())

  const esGestor = user?.tipoAcceso === 'admin_general' || user?.tipoAcceso === 'admin_area'

  const observaciones = useMemo<Observacion[]>(() => {
    if (!filas) return []
    const out: Observacion[] = []
    filas.forEach((f) => {
      const ppm = f.valor_num == null ? null : Number(f.valor_num)
      if (ppm == null || Number.isNaN(ppm)) return
      out.push({
        ingrediente: f.ingrediente,
        ppm,
        fecha: f.fecha_muestreo ?? f.fecha_entrada,
        cliente: f.cliente,
        planta: f.planta,
        tipoAplicacion: f.tipo_aplicacion,
        laboratorio: f.laboratorio,
        crop: f.especie,
        semana: f.semana_muestreo,
        mes: f.mes,
      })
    })
    return out
  }, [filas])

  const opciones = useMemo(
    () => ({
      ingredientes: unique((filas ?? []).map((f) => f.ingrediente)),
      clientes: unique((filas ?? []).map((f) => f.cliente)),
      // Sucursales en cascada: si hay un cliente elegido, solo se muestran las suyas.
      plantas: unique(
        (filas ?? []).filter((f) => !filtros.cliente || f.cliente === filtros.cliente).map((f) => f.planta),
      ),
      tiposAplicacion: unique((filas ?? []).map((f) => f.tipo_aplicacion)),
      laboratorios: unique((filas ?? []).map((f) => f.laboratorio)),
      crops: unique((filas ?? []).map((f) => f.especie)),
      semanas: unique((filas ?? []).map((f) => f.semana_muestreo)),
      meses: unique((filas ?? []).map((f) => f.mes)),
    }),
    [filas, filtros.cliente],
  )

  const filtradas = useMemo(
    () =>
      observaciones.filter(
        (o) =>
          (filtros.ingredientes.length === 0 || filtros.ingredientes.includes(o.ingrediente)) &&
          (!filtros.cliente || o.cliente === filtros.cliente) &&
          (!filtros.planta || o.planta === filtros.planta) &&
          (!filtros.tipoAplicacion || o.tipoAplicacion === filtros.tipoAplicacion) &&
          (!filtros.laboratorio || o.laboratorio === filtros.laboratorio) &&
          (!filtros.crop || o.crop === filtros.crop) &&
          (!filtros.semana || String(o.semana ?? '') === filtros.semana) &&
          (!filtros.mes || String(o.mes ?? '') === filtros.mes),
      ),
    [observaciones, filtros],
  )

  const valores = useMemo(() => filtradas.map((o) => o.ppm), [filtradas])
  const stats = useMemo(() => calcularEstadisticas(valores), [valores])
  const limitesControl = useMemo(() => calcularLimitesControl(valores, sigma), [valores, sigma])

  // Los límites residuales son por analito: solo tienen sentido con exactamente
  // uno seleccionado. Con 0 o 2+, el gráfico principal sigue funcionando (ver
  // más abajo), pero los KPIs/límite no tienen un único analito al que referirse.
  const analitoSeleccionado = useMemo(() => {
    if (filtros.ingredientes.length !== 1) return null
    const codigo = filtros.ingredientes[0]
    const candidatos = analitos.filter((a) => a.codigo === codigo)
    if (candidatos.length <= 1) return candidatos[0] ?? null
    return candidatos.find((a) => a.laboratorio === filtros.laboratorio) ?? candidatos[0]
  }, [analitos, filtros.ingredientes, filtros.laboratorio])

  const limiteResidual = useMemo(
    () => ({
      inferior: analitoSeleccionado?.limite_min != null ? Number(analitoSeleccionado.limite_min) : null,
      central: analitoSeleccionado?.limite_central != null ? Number(analitoSeleccionado.limite_central) : null,
      superior: analitoSeleccionado?.limite_max != null ? Number(analitoSeleccionado.limite_max) : null,
    }),
    [analitoSeleccionado],
  )

  const limitesActivos = vista === 'residual' ? limiteResidual : limitesControl
  const cumplimiento = useMemo(
    () => calcularCumplimiento(valores, limitesActivos.superior),
    [valores, limitesActivos.superior],
  )
  const unidad = analitoSeleccionado?.unidad ?? 'ppm'

  const nota =
    filtros.ingredientes.length > 1
      ? `Comparando ${filtros.ingredientes.length} ingredientes (colores en la leyenda del gráfico). Los límites y el % de cumplimiento solo se muestran con un ingrediente a la vez — selecciona uno solo para verlos.`
      : vista === 'residual'
        ? filtros.ingredientes.length === 1
          ? `Ingrediente seleccionado: ${filtros.ingredientes[0]}. Las líneas de límite residual vienen de los valores configurados para este analito.`
          : 'Selecciona un ingrediente activo para ver sus límites residuales.'
        : `Límites dinámicos: promedio ± ${sigma} × desviación estándar de las ${valores.length.toLocaleString('es-CL')} observación(es) filtradas.`

  // ── gráficos ──
  const mainRef = useRef<HTMLCanvasElement>(null)
  const donutRef = useRef<HTMLCanvasElement>(null)
  const barRef = useRef<HTMLCanvasElement>(null)
  const mainChart = useRef<Chart | null>(null)
  const donutChart = useRef<Chart | null>(null)
  const barChart = useRef<Chart | null>(null)

  const colorOk = cssVar('--color-ok', '#2f7d32')
  const colorDanger = cssVar('--color-danger', '#b0271f')
  const colorWarning = cssVar('--color-warning', '#b4531f')
  const colorMuted = cssVar('--color-text-faint', '#77837b')
  const colorBorder = cssVar('--color-border', '#e1e5dc')

  const comparandoVarios = filtros.ingredientes.length > 1

  useEffect(() => {
    if (!mainRef.current) return

    // Todas las fechas que aparecen en los datos filtrados (comunes a todas las líneas).
    const claves = unique(filtradas.map((o) => o.fecha ?? 'Sin fecha')).sort()
    const etiquetas = claves.map((k) => (k === 'Sin fecha' ? k : formatDateCL(k)))

    let datasets: ChartDataset<'line', (number | null)[]>[]

    if (comparandoVarios) {
      // Una línea de color fijo por ingrediente — sin líneas de límite (son por analito único).
      datasets = filtros.ingredientes.map((ingrediente) => {
        const porFecha = new Map<string, number[]>()
        filtradas
          .filter((o) => o.ingrediente === ingrediente)
          .forEach((o) => {
            const clave = o.fecha ?? 'Sin fecha'
            const arr = porFecha.get(clave) ?? []
            arr.push(o.ppm)
            porFecha.set(clave, arr)
          })
        const color = colorDeIngrediente(ingrediente)
        return {
          label: ingrediente,
          data: claves.map((k) => {
            const arr = porFecha.get(k)
            if (!arr || arr.length === 0) return null
            return arr.reduce((a, b) => a + b, 0) / arr.length
          }),
          borderColor: color,
          backgroundColor: color,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.25,
          spanGaps: true,
        }
      })
    } else {
      const porFecha = new Map<string, number[]>()
      filtradas.forEach((o) => {
        const clave = o.fecha ?? 'Sin fecha'
        const arr = porFecha.get(clave) ?? []
        arr.push(o.ppm)
        porFecha.set(clave, arr)
      })
      const promedios = claves.map((k) => {
        const arr = porFecha.get(k) ?? []
        return arr.reduce((a, b) => a + b, 0) / arr.length
      })
      datasets = [
        {
          label: `Promedio ${unidad}`,
          data: promedios,
          borderColor: acento,
          backgroundColor: acento,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.25,
        },
        {
          label: 'Límite superior',
          data: claves.map(() => limitesActivos.superior),
          borderColor: colorWarning,
          borderDash: [6, 4],
          borderWidth: 1.5,
          pointRadius: 0,
        },
        {
          label: 'Límite central',
          data: claves.map(() => limitesActivos.central),
          borderColor: colorMuted,
          borderDash: [2, 3],
          borderWidth: 1.5,
          pointRadius: 0,
        },
        {
          label: 'Límite inferior',
          data: claves.map(() => limitesActivos.inferior),
          borderColor: colorWarning,
          borderDash: [6, 4],
          borderWidth: 1.5,
          pointRadius: 0,
        },
      ]
    }

    mainChart.current?.destroy()
    mainChart.current = new Chart(mainRef.current, {
      type: 'line',
      data: { labels: etiquetas, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 14, font: { size: 11 } } } },
        scales: {
          x: { ticks: { maxTicksLimit: 10, font: { size: 10 } }, grid: { display: false } },
          y: { beginAtZero: true, grid: { color: colorBorder } },
        },
      },
    })
    return () => mainChart.current?.destroy()
  }, [
    filtradas,
    comparandoVarios,
    filtros.ingredientes,
    limitesActivos.superior,
    limitesActivos.central,
    limitesActivos.inferior,
    acento,
    colorWarning,
    colorMuted,
    colorBorder,
    unidad,
  ])

  useEffect(() => {
    if (!donutRef.current) return
    const sinLimite = limitesActivos.superior == null
    const datos = sinLimite ? [valores.length, 0] : [cumplimiento.ok, cumplimiento.fuera]
    donutChart.current?.destroy()
    donutChart.current = new Chart(donutRef.current, {
      type: 'doughnut',
      data: { labels: ['Cumple', 'No cumple'], datasets: [{ data: datos, backgroundColor: [colorOk, colorDanger], borderWidth: 0 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 14, font: { size: 11 } } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.raw} muestra(s)` } },
        },
      },
    })
    return () => donutChart.current?.destroy()
  }, [valores, cumplimiento, limitesActivos.superior, colorOk, colorDanger])

  useEffect(() => {
    if (!barRef.current) return
    const { dentro, fuera } = contarFueraDeIntervalo(valores, limitesActivos.inferior, limitesActivos.superior)
    barChart.current?.destroy()
    barChart.current = new Chart(barRef.current, {
      type: 'bar',
      data: {
        labels: ['Dentro del intervalo', 'Fuera del intervalo'],
        datasets: [{ label: 'Muestras', data: [dentro, fuera], backgroundColor: [colorOk, colorDanger], borderRadius: 4, maxBarThickness: 64 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: colorBorder } },
          x: { grid: { display: false } },
        },
      },
    })
    return () => barChart.current?.destroy()
  }, [valores, limitesActivos.inferior, limitesActivos.superior, colorOk, colorDanger, colorBorder])

  if (!user) return null

  function actualizarFiltro<K extends keyof Filtros>(clave: K, valor: string) {
    setFiltros((prev) => ({ ...prev, [clave]: valor }))
  }

  function cambiarCliente(valor: string) {
    setFiltros((prev) => ({
      ...prev,
      cliente: valor,
      // Si la sucursal actual no es de este cliente, se limpia (evita filtros imposibles).
      planta:
        prev.planta && !valor
          ? prev.planta
          : prev.planta &&
              unique(
                (filas ?? []).filter((f) => !valor || f.cliente === valor).map((f) => f.planta),
              ).includes(prev.planta)
            ? prev.planta
            : '',
    }))
  }

  return (
    <div className={styles.wrap} style={wrapStyle}>
      <div className={styles.cabecera}>
        <Header
          title={clienteFijo ? `Report · ${clienteFijo}` : 'Report'}
          description={
            clienteFijo
              ? `Control de residuos de ${clienteFijo}: límites residuales y de control desde la base de datos.`
              : 'Control de residuos: límites residuales y de control desde la base de datos.'
          }
        />
        <div className={styles.accionesCabecera}>
          {esGestor && (
            <Button variant="secondary" onClick={() => setModalAnalitos(true)}>
              ⚙ Gestionar analitos
            </Button>
          )}
          <div className={styles.actualizarBloque}>
            <button className={styles.btnActualizar} onClick={() => void cargar()} disabled={estado === 'cargando'}>
              {estado === 'cargando' ? '⏳ Actualizando…' : '🔄 Actualizar'}
            </button>
            <div className={styles.horas}>
              {ultimaActualizacion && <span>Última: {FMT_HORA.format(ultimaActualizacion)}</span>}
              <span>Próxima auto: {FMT_HORA.format(proximaAuto)}</span>
            </div>
          </div>
        </div>
      </div>

      {estado === 'error' && (
        <p className={styles.error}>
          ⚠ {errorMsg} <button className={styles.reintentar} onClick={() => void cargar()}>Reintentar</button>
        </p>
      )}

      {estado === 'cargando' && !filas ? (
        <div className={styles.stats}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className={styles.statCard}>
              <Skeleton style={{ width: '60%', height: '11px', marginBottom: '8px' }} />
              <Skeleton style={{ width: '40%', height: '22px' }} />
            </Card>
          ))}
        </div>
      ) : filas && filas.length === 0 ? (
        <Card className={styles.vacioCard}>
          <p className={styles.vacioTitulo}>Todavía no hay datos cargados en la base.</p>
          <p className={styles.vacioTexto}>Usa el módulo Ingest para cargar resultados de laboratorio; en cuanto haya datos, aparecerán aquí automáticamente.</p>
        </Card>
      ) : filas ? (
        <>
          <div className={styles.toolbar}>
            <div className={styles.tabs}>
              <button className={`${styles.tab} ${vista === 'residual' ? styles.tabActivo : ''}`} onClick={() => setVista('residual')}>
                Vista por límite residual
              </button>
              <button className={`${styles.tab} ${vista === 'control' ? styles.tabActivo : ''}`} onClick={() => setVista('control')}>
                Vista por límite de control
              </button>
            </div>
            {vista === 'control' && (
              <div className={styles.sigmaControl}>
                <span>N° desviaciones</span>
                <select value={sigma} onChange={(e) => setSigma(Number(e.target.value))}>
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className={styles.filtros}>
            <MultiSelectFiltro
              etiqueta="Ingrediente Activo"
              opciones={opciones.ingredientes}
              valores={filtros.ingredientes}
              onChange={(v) => setFiltros((prev) => ({ ...prev, ingredientes: v }))}
              colorDe={colorDeIngrediente}
            />
            {!clienteFijo && (
              <BuscableSelect
                etiqueta="Cliente"
                opciones={opciones.clientes}
                valor={filtros.cliente}
                onChange={cambiarCliente}
              />
            )}
            <BuscableSelect
              etiqueta="Sucursal"
              opciones={opciones.plantas}
              valor={filtros.planta}
              onChange={(v) => actualizarFiltro('planta', v)}
            />
            <label className={styles.filtro}>
              <span>Tipo aplicación</span>
              <select value={filtros.tipoAplicacion} onChange={(e) => actualizarFiltro('tipoAplicacion', e.target.value)}>
                <option value="">Todos</option>
                {opciones.tiposAplicacion.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className={styles.filtro}>
              <span>Laboratorio</span>
              <select value={filtros.laboratorio} onChange={(e) => actualizarFiltro('laboratorio', e.target.value)}>
                <option value="">Todos</option>
                {opciones.laboratorios.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className={styles.filtro}>
              <span>Especie / CROP</span>
              <select value={filtros.crop} onChange={(e) => actualizarFiltro('crop', e.target.value)}>
                <option value="">Todas</option>
                {opciones.crops.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className={styles.filtro}>
              <span>Semana</span>
              <select value={filtros.semana} onChange={(e) => actualizarFiltro('semana', e.target.value)}>
                <option value="">Todas</option>
                {opciones.semanas.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className={styles.filtro}>
              <span>Mes</span>
              <select value={filtros.mes} onChange={(e) => actualizarFiltro('mes', e.target.value)}>
                <option value="">Todos</option>
                {opciones.meses.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            {filtrosActivos(filtros) && (
              <button className={styles.limpiar} onClick={() => setFiltros(FILTROS_VACIOS)}>
                Limpiar filtros
              </button>
            )}
          </div>

          <p className={styles.nota}>{nota}</p>

          <div className={styles.stats}>
            <Card className={`${styles.statCard} ${styles.destacado}`}>
              <span className={styles.statLbl}>Total de registros (solicitudes)</span>
              <span className={styles.statNum}>{totalSolicitudes.toLocaleString('es-CL')}</span>
            </Card>
            <Card className={styles.statCard}>
              <span className={styles.statLbl}>Observaciones (filtradas)</span>
              <span className={styles.statNum}>{valores.length.toLocaleString('es-CL')}</span>
            </Card>
            <Card className={styles.statCard}>
              <span className={styles.statLbl}>Promedio ({unidad})</span>
              <span className={styles.statNum}>{formatDecimalCL(stats.promedio, 4)}</span>
            </Card>
            <Card className={styles.statCard}>
              <span className={styles.statLbl}>Desv. estándar</span>
              <span className={styles.statNum}>{formatDecimalCL(stats.desviacion, 4)}</span>
            </Card>
            <Card className={`${styles.statCard} ${styles.warn}`}>
              <span className={styles.statLbl}>Límite inferior</span>
              <span className={styles.statNum}>{formatDecimalCL(limitesActivos.inferior, 4)}</span>
            </Card>
            <Card className={styles.statCard}>
              <span className={styles.statLbl}>Límite central</span>
              <span className={styles.statNum}>{formatDecimalCL(limitesActivos.central, 4)}</span>
            </Card>
            <Card className={`${styles.statCard} ${styles.warn}`}>
              <span className={styles.statLbl}>Límite superior</span>
              <span className={styles.statNum}>{formatDecimalCL(limitesActivos.superior, 4)}</span>
            </Card>
            <Card className={`${styles.statCard} ${styles.info}`}>
              <span className={styles.statLbl}>Cumplimiento</span>
              <span className={styles.statNum}>{cumplimiento.porcentaje != null ? `${formatDecimalCL(cumplimiento.porcentaje, 1)}%` : '—'}</span>
            </Card>
          </div>

          <div className={styles.grid2}>
            <Card className={styles.panel}>
              <h3>{vista === 'residual' ? `Promedio de ${unidad} por fecha` : `${unidad} por fecha · límites de control`}</h3>
              <div className={styles.chartbox}>
                <canvas ref={mainRef} />
              </div>
            </Card>
            <Card className={styles.panel}>
              <h3>Porcentaje de cumplimiento</h3>
              <div className={styles.chartbox}>
                <canvas ref={donutRef} />
              </div>
            </Card>
          </div>

          <div className={styles.grid2}>
            <Card className={styles.panel}>
              <h3>Distribución de cumplimiento</h3>
              <div className={styles.chartbox}>
                <canvas ref={barRef} />
              </div>
            </Card>
            <Card className={styles.panel}>
              <h3>Indicadores</h3>
              <div className={styles.indicadores}>
                <div><span>Observaciones</span><b>{valores.length.toLocaleString('es-CL')}</b></div>
                <div><span>Promedio</span><b>{formatDecimalCL(stats.promedio, 4)} {unidad}</b></div>
                <div><span>Desviación estándar muestral</span><b>{formatDecimalCL(stats.desviacion, 4)}</b></div>
                <div><span>Límite inferior</span><b>{formatDecimalCL(limitesActivos.inferior, 4)}</b></div>
                <div><span>Línea central</span><b>{formatDecimalCL(limitesActivos.central, 4)}</b></div>
                <div><span>Límite superior</span><b>{formatDecimalCL(limitesActivos.superior, 4)}</b></div>
                {cumplimiento.porcentaje != null && (
                  <div><span>Cumplimiento residual</span><b>{formatDecimalCL(cumplimiento.porcentaje, 1)}% ({cumplimiento.ok}/{cumplimiento.total})</b></div>
                )}
              </div>
            </Card>
          </div>
        </>
      ) : null}

      {modalAnalitos && (
        <AnalitosAdminModal analitos={analitos} onCambio={setAnalitos} onCerrar={() => setModalAnalitos(false)} />
      )}
    </div>
  )
}
