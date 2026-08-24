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
import { CalendarioRango } from '@/components/ui/CalendarioRango'
import type { RangoFechas } from '@/components/ui/CalendarioRango'
import { areaDeModulo } from '@/constants/areas'
import { useAuth } from '@/features/auth'
import { listarClientes, listarPlantas } from '@/features/catalogo'
import type { Planta } from '@/features/catalogo'
import { listarEspeciesActivas, listarValores } from '@/features/listados'
import type { ValorLista } from '@/features/listados'
import { HttpError } from '@/services/http/client'
import { formatDateCL, formatDecimalCL } from '@/lib/locale'
import {
  calcularEstadisticas,
  calcularLimitesControl,
  colorDeIngrediente,
  contarFueraDeIntervalo,
  descargarDatosExcel,
  listarAnalitos,
  listarLimites,
  obtenerDatosReporte,
  proximaHoraProgramada,
  useActualizacionProgramada,
} from '@/features/reportes'
import type { Analito, FilaReporte, LimiteAnalito, Observacion } from '@/features/reportes'
import { AnalitosAdminModal } from './AnalitosAdminModal'
import { DetalleObservacionesModal } from './DetalleObservacionesModal'
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

/** Igual que unique(), pero agrupa sin importar mayúsculas/minúsculas y elige
 * como etiqueta la variante que más se repite en los datos reales — así
 * "cromatografía" y "Cromatografía" no aparecen duplicados en el filtro,
 * mientras la homogenización de fondo (fuera de esta pantalla) sigue pendiente. */
function uniqueCanonico(valores: (string | number | null | undefined)[]): string[] {
  const porClave = new Map<string, Map<string, number>>()
  valores.forEach((v) => {
    if (v === null || v === undefined) return
    const s = String(v).trim()
    if (!s) return
    const clave = s.toLowerCase()
    const variantes = porClave.get(clave) ?? new Map<string, number>()
    variantes.set(s, (variantes.get(s) ?? 0) + 1)
    porClave.set(clave, variantes)
  })
  const canonicos: string[] = []
  porClave.forEach((variantes) => {
    let mejor = ''
    let mejorConteo = -1
    variantes.forEach((n, variante) => {
      if (n > mejorConteo) {
        mejor = variante
        mejorConteo = n
      }
    })
    canonicos.push(mejor)
  })
  return canonicos.sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
}

/** Especie es casi siempre una sola palabra: si la variante más frecuente vino
 * toda en minúscula o toda en mayúscula (dato tal cual, sin homogenizar), se
 * pareja a "Primera letra mayúscula" para que la lista se vea consistente. No
 * se usa para tipo de servicio porque ahí sí importan las mayúsculas internas
 * (ej. "Linea de Proceso"). */
function capitalizarPrimeraLetra(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

function igual(a: string | null | undefined, b: string): boolean {
  return (a ?? '').trim().toLowerCase() === b.trim().toLowerCase()
}

type Vista = 'residual' | 'control'
type Estado = 'cargando' | 'ok' | 'error'

interface Filtros {
  ingredientes: string[]
  cliente: string
  planta: string
  tipoAplicacion: string
  tipoServicio: string
  laboratorio: string
  crop: string
  variedad: string
  semana: string
  mes: string
  rango: RangoFechas | null
}

const FILTROS_VACIOS: Filtros = {
  ingredientes: [],
  cliente: '',
  planta: '',
  tipoAplicacion: '',
  tipoServicio: '',
  laboratorio: '',
  crop: '',
  variedad: '',
  semana: '',
  mes: '',
  rango: null,
}

function filtrosActivos(f: Filtros): boolean {
  return (
    f.ingredientes.length > 0 ||
    Boolean(
      f.cliente || f.planta || f.tipoAplicacion || f.tipoServicio || f.laboratorio || f.crop || f.variedad || f.semana || f.mes || f.rango,
    )
  )
}

/** Observaciones dentro (o fuera) del intervalo [inferior, superior]; sin ambos
 * límites definidos, todo cuenta como "dentro" (no hay con qué comparar). Las
 * filas sin ppm numérico no entran a ninguno de los dos grupos (no hay valor
 * que comparar), igual que en los conteos de la dona/barra. */
function filtrarPorRango(lista: Observacion[], inferior: number | null, superior: number | null, dentro: boolean) {
  return lista.filter((o) => {
    if (o.ppm == null) return false
    const estaDentro = inferior == null || superior == null ? true : o.ppm >= inferior && o.ppm <= superior
    return dentro ? estaDentro : !estaDentro
  })
}

const FMT_HORA = new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit' })

/** `clienteFijo`: usado por el portal de cliente — cuando viene seteado, los
 * datos ya llegan filtrados por el backend (nunca se filtran solo en el
 * navegador) y los filtros de Cliente/Sucursal ni siquiera se muestran.
 * `plantaFija`: opcional, solo tiene sentido junto con clienteFijo — cuentas
 * creadas por Ship To (ej. "Dole Codegua") en vez de por Sold To completo.
 * `onCropChange`: usado por el portal de cliente para cambiar la imagen de
 * fondo del encabezado según la especie elegida en el filtro. */
export function ReporteView({
  clienteFijo,
  plantaFija,
  onCropChange,
}: { clienteFijo?: string; plantaFija?: string; onCropChange?: (crop: string) => void } = {}) {
  const { user } = useAuth()
  const acento = areaDeModulo('reports')?.colorPrimario ?? '#6dad3c'
  const wrapStyle = { '--acento': acento } as CSSProperties

  const [filas, setFilas] = useState<FilaReporte[] | null>(null)
  const [totalSolicitudes, setTotalSolicitudes] = useState(0)
  const [analitos, setAnalitos] = useState<Analito[]>([])
  const [limites, setLimites] = useState<LimiteAnalito[]>([])
  const [estado, setEstado] = useState<Estado>('cargando')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date | null>(null)
  const [proximaAuto, setProximaAuto] = useState<Date>(() => proximaHoraProgramada(new Date()))
  const [vista, setVista] = useState<Vista>('residual')
  const [sigma, setSigma] = useState(2)
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS)
  // Sold To, Ship To, Especie y Variedad de los filtros salen de Listados
  // -la fuente de verdad oficial-, no de lo que ya haya cargado en el
  // reporte: así el filtro ofrece todo lo que existe de verdad, no solo lo
  // que por casualidad ya tiene datos hoy.
  const [clientesOficiales, setClientesOficiales] = useState<string[]>([])
  const [plantasOficiales, setPlantasOficiales] = useState<Planta[]>([])
  const [especiesOficiales, setEspeciesOficiales] = useState<ValorLista[]>([])
  const [variedadesOficiales, setVariedadesOficiales] = useState<string[]>([])
  const [modalAnalitos, setModalAnalitos] = useState(false)
  const [detalle, setDetalle] = useState<{ titulo: string; filas: Observacion[] } | null>(null)
  const [descargandoDatos, setDescargandoDatos] = useState(false)

  const obtenerTodo = useCallback(async () => {
    const [datos, catalogo, limitesCatalogo] = await Promise.all([
      obtenerDatosReporte(clienteFijo, plantaFija),
      listarAnalitos(),
      listarLimites(),
    ])
    return { filas: datos.filas, totalSolicitudes: datos.total_solicitudes, analitos: catalogo, limites: limitesCatalogo }
  }, [clienteFijo, plantaFija])

  function aplicarExito(r: { filas: FilaReporte[]; totalSolicitudes: number; analitos: Analito[]; limites: LimiteAnalito[] }) {
    setFilas(r.filas)
    setTotalSolicitudes(r.totalSolicitudes)
    setAnalitos(r.analitos)
    setLimites(r.limites)
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

  useEffect(() => {
    onCropChange?.(filtros.crop)
  }, [filtros.crop, onCropChange])

  useEffect(() => {
    // El portal de cliente (clienteFijo) oculta estos dos selects -sus datos
    // ya vienen acotados desde el backend-, así que ni siquiera se pide el
    // catálogo completo: no tiene por qué llegarle al navegador de un
    // cliente la lista entera de Sold To/Ship To de los demás.
    if (!clienteFijo) {
      listarClientes()
        .then((cs) => setClientesOficiales(cs.filter((c) => c.activo).map((c) => c.nombre)))
        .catch(() => setClientesOficiales([]))
      listarPlantas()
        .then((ps) => setPlantasOficiales(ps.filter((p) => p.activo)))
        .catch(() => setPlantasOficiales([]))
    }
    listarEspeciesActivas()
      .then(setEspeciesOficiales)
      .catch(() => setEspeciesOficiales([]))
  }, [clienteFijo])

  useEffect(() => {
    const especie = especiesOficiales.find((e) => e.valor === filtros.crop)
    listarValores('variedad', especie ? { especieId: especie.id } : undefined)
      .then((vs) => setVariedadesOficiales(vs.map((v) => v.valor)))
      .catch(() => setVariedadesOficiales([]))
  }, [filtros.crop, especiesOficiales])

  const esGestor = user?.tipoAcceso === 'admin_general' || user?.tipoAcceso === 'admin_area'

  // Una fila por cada solicitud filtrada (LEFT JOIN con resultado en el backend):
  // toda solicitud de la base aparece acá, tenga o no un resultado numérico —
  // "ppm" queda en null cuando no hay valor numérico (sin resultado todavía, o
  // un resultado cualitativo como "ND"), pero la solicitud igual se cuenta y
  // se puede ver en el detalle.
  const observaciones = useMemo<Observacion[]>(() => {
    if (!filas) return []
    return filas.map((f) => {
      const num = f.valor_num == null ? null : Number(f.valor_num)
      return {
        solicitudId: f.solicitud_id,
        nroSolicitud: f.nro_solicitud,
        ingrediente: f.ingrediente,
        ppm: num == null || Number.isNaN(num) ? null : num,
        valorTexto: f.valor_texto,
        fecha: f.fecha_muestreo ?? f.fecha_entrada,
        cliente: f.cliente,
        planta: f.planta,
        tipoAplicacion: f.tipo_aplicacion,
        tipoServicio: f.tipo_servicio,
        laboratorio: f.laboratorio,
        crop: f.especie,
        variedad: f.variedad,
        semana: f.semana_muestreo,
        mes: f.mes,
      }
    })
  }, [filas])

  const opciones = useMemo(
    () => ({
      ingredientes: unique((filas ?? []).map((f) => f.ingrediente)),
      // Sold To/Ship To/Especie/Variedad salen de Listados (clientesOficiales/
      // plantasOficiales/especiesOficiales/variedadesOficiales), no de `filas`:
      // el filtro tiene que ofrecer todo lo oficial, no solo lo que ya tiene
      // datos cargados hoy.
      clientes: clientesOficiales,
      // Sucursales en cascada: si hay un cliente elegido, solo se muestran las suyas.
      plantas: plantasOficiales
        .filter((p) => !filtros.cliente || p.cliente_nombre === filtros.cliente)
        .map((p) => p.nombre),
      tiposAplicacion: uniqueCanonico((filas ?? []).map((f) => f.tipo_aplicacion)).map(capitalizarPrimeraLetra),
      // Homogenización pendiente en la carga (dato pasa tal cual del Excel): acá se
      // agrupa sin importar mayúsculas/minúsculas para que el filtro no repita el
      // mismo valor dos veces por un tema de casing (ej. "cromatografía" y "Cromatografía"),
      // y siempre se muestra con primera letra mayúscula y el resto en minúscula
      // -homogenización solo visual, el dato real cargado no se toca-.
      tiposServicio: uniqueCanonico((filas ?? []).map((f) => f.tipo_servicio)).map(capitalizarPrimeraLetra),
      laboratorios: uniqueCanonico((filas ?? []).map((f) => f.laboratorio)).map(capitalizarPrimeraLetra),
      crops: especiesOficiales.map((e) => e.valor),
      // Variedades en cascada: si hay una especie elegida, solo las suyas
      // -"June Gold" de Durazno y de Manzana nunca se mezclan-.
      variedades: variedadesOficiales,
      semanas: unique((filas ?? []).map((f) => f.semana_muestreo)),
      meses: unique((filas ?? []).map((f) => f.mes)),
    }),
    [filas, filtros.cliente, clientesOficiales, plantasOficiales, especiesOficiales, variedadesOficiales],
  )

  const filtradas = useMemo(
    () =>
      observaciones.filter(
        (o) =>
          (filtros.ingredientes.length === 0 ||
            (o.ingrediente != null && filtros.ingredientes.includes(o.ingrediente))) &&
          (!filtros.cliente || o.cliente === filtros.cliente) &&
          (!filtros.planta || o.planta === filtros.planta) &&
          (!filtros.tipoAplicacion || igual(o.tipoAplicacion, filtros.tipoAplicacion)) &&
          (!filtros.tipoServicio || igual(o.tipoServicio, filtros.tipoServicio)) &&
          (!filtros.laboratorio || igual(o.laboratorio, filtros.laboratorio)) &&
          (!filtros.crop || igual(o.crop, filtros.crop)) &&
          (!filtros.variedad || igual(o.variedad, filtros.variedad)) &&
          // Semana/Mes y el calendario son mutuamente excluyentes (ver actualizarSemana/
          // actualizarMes/aplicarRango): solo uno de los dos grupos tiene valor a la vez.
          (!filtros.semana || String(o.semana ?? '') === filtros.semana) &&
          (!filtros.mes || String(o.mes ?? '') === filtros.mes) &&
          (!filtros.rango || (o.fecha != null && o.fecha >= filtros.rango.desde && o.fecha <= filtros.rango.hasta)),
      ),
    [observaciones, filtros],
  )

  const registrosFiltrados = useMemo(() => new Set(filtradas.map((o) => o.solicitudId)).size, [filtradas])

  // Solo las filas con un ppm numérico entran a las estadísticas y los gráficos
  // de valores; las que no tienen resultado (o vienen como texto tipo "ND") ya
  // se cuentan en registrosFiltrados, pero no hay ppm que promediar/graficar.
  const valores = useMemo(
    () => filtradas.map((o) => o.ppm).filter((v): v is number => v != null),
    [filtradas],
  )
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
    return candidatos.find((a) => igual(a.laboratorio, filtros.laboratorio)) ?? candidatos[0]
  }, [analitos, filtros.ingredientes, filtros.laboratorio])

  // El límite correcto depende de especie y tipo de servicio, no solo del analito:
  // se busca primero la combinación exacta, y si no existe se va relajando hacia
  // los comodines ('' = "aplica a todas/todos") hasta encontrar algo definido.
  const limiteResidual = useMemo(() => {
    if (!analitoSeleccionado) return { inferior: null, central: null, superior: null }
    const propios = limites.filter((l) => l.analito_id === analitoSeleccionado.id)
    const especie = filtros.crop
    const servicio = filtros.tipoServicio
    const candidatos = [
      propios.find((l) => igual(l.especie, especie) && igual(l.tipo_servicio, servicio)),
      especie ? propios.find((l) => igual(l.especie, especie) && l.tipo_servicio === '') : undefined,
      servicio ? propios.find((l) => l.especie === '' && igual(l.tipo_servicio, servicio)) : undefined,
      propios.find((l) => l.especie === '' && l.tipo_servicio === ''),
    ]
    const encontrado = candidatos.find((l) => l !== undefined)
    return {
      inferior: encontrado?.limite_min != null ? Number(encontrado.limite_min) : null,
      central: encontrado?.limite_central != null ? Number(encontrado.limite_central) : null,
      superior: encontrado?.limite_max != null ? Number(encontrado.limite_max) : null,
    }
  }, [analitoSeleccionado, limites, filtros.crop, filtros.tipoServicio])

  const limitesActivos = vista === 'residual' ? limiteResidual : limitesControl
  // Una sola definición de "cumplimiento" para el KPI, la dona y la barra: dentro
  // del intervalo [límite inferior, límite superior] cuando ambos están definidos.
  const distribucionRango = useMemo(
    () => contarFueraDeIntervalo(valores, limitesActivos.inferior, limitesActivos.superior),
    [valores, limitesActivos.inferior, limitesActivos.superior],
  )
  const cumplimiento = useMemo(() => {
    const total = valores.length
    if (limitesActivos.superior == null || total === 0) {
      return { ok: distribucionRango.dentro, fuera: distribucionRango.fuera, total, porcentaje: null }
    }
    return {
      ok: distribucionRango.dentro,
      fuera: distribucionRango.fuera,
      total,
      porcentaje: (distribucionRango.dentro / total) * 100,
    }
  }, [distribucionRango, valores.length, limitesActivos.superior])
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
  // Con un solo ingrediente activo seleccionado, la línea/puntos usan su color fijo
  // (el mismo de la leyenda del multi-selector); con "todos" mezclados no hay un
  // único color que tenga sentido, así que se usa el color del área.
  const colorLineaUnica = filtros.ingredientes.length === 1 ? colorDeIngrediente(filtros.ingredientes[0]) : acento

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
          .filter((o) => o.ingrediente === ingrediente && o.ppm != null)
          .forEach((o) => {
            const clave = o.fecha ?? 'Sin fecha'
            const arr = porFecha.get(clave) ?? []
            arr.push(o.ppm as number)
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
        if (o.ppm == null) return
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
          borderColor: colorLineaUnica,
          backgroundColor: colorLineaUnica,
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
        onClick: (_evt, elements) => {
          if (!elements.length) return
          const { datasetIndex, index } = elements[0]
          const fechaClave = claves[index]
          if (comparandoVarios) {
            const ingrediente = filtros.ingredientes[datasetIndex]
            const obs = filtradas.filter((o) => o.ingrediente === ingrediente && (o.fecha ?? 'Sin fecha') === fechaClave)
            if (obs.length) setDetalle({ titulo: `${ingrediente} · ${etiquetas[index]}`, filas: obs })
          } else {
            if (datasetIndex !== 0) return // clic en una línea de límite: no hay detalle que mostrar
            const obs = filtradas.filter((o) => (o.fecha ?? 'Sin fecha') === fechaClave)
            if (obs.length) setDetalle({ titulo: etiquetas[index], filas: obs })
          }
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
    colorLineaUnica,
    colorWarning,
    colorMuted,
    colorBorder,
    unidad,
  ])

  useEffect(() => {
    if (!donutRef.current) return
    const datos = [cumplimiento.ok, cumplimiento.fuera]
    donutChart.current?.destroy()
    donutChart.current = new Chart(donutRef.current, {
      type: 'doughnut',
      data: {
        labels: ['Dentro de rango', 'Fuera de rango'],
        datasets: [{ data: datos, backgroundColor: [colorOk, colorDanger], borderWidth: 0 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 14, font: { size: 11 } } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.raw} muestra(s)` } },
        },
        onClick: (_evt, elements) => {
          if (!elements.length) return
          const dentro = elements[0].index === 0
          const obs = filtrarPorRango(filtradas, limitesActivos.inferior, limitesActivos.superior, dentro)
          if (obs.length) setDetalle({ titulo: dentro ? 'Dentro de rango' : 'Fuera de rango', filas: obs })
        },
      },
    })
    return () => donutChart.current?.destroy()
  }, [filtradas, cumplimiento, limitesActivos.inferior, limitesActivos.superior, colorOk, colorDanger])

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
        onClick: (_evt, elements) => {
          if (!elements.length) return
          const dentroSel = elements[0].index === 0
          const obs = filtrarPorRango(filtradas, limitesActivos.inferior, limitesActivos.superior, dentroSel)
          if (obs.length) setDetalle({ titulo: dentroSel ? 'Dentro del intervalo' : 'Fuera del intervalo', filas: obs })
        },
      },
    })
    return () => barChart.current?.destroy()
  }, [filtradas, valores, limitesActivos.inferior, limitesActivos.superior, colorOk, colorDanger, colorBorder])

  if (!user) return null

  function actualizarFiltro<K extends keyof Filtros>(clave: K, valor: string) {
    setFiltros((prev) => ({ ...prev, [clave]: valor }))
  }

  // Semana/Mes y el calendario son excluyentes: usar uno limpia el otro.
  function actualizarSemana(valor: string) {
    setFiltros((prev) => ({ ...prev, semana: valor, rango: valor ? null : prev.rango }))
  }

  function actualizarMes(valor: string) {
    setFiltros((prev) => ({ ...prev, mes: valor, rango: valor ? null : prev.rango }))
  }

  function aplicarRango(rango: RangoFechas | null) {
    setFiltros((prev) => ({ ...prev, rango, semana: rango ? '' : prev.semana, mes: rango ? '' : prev.mes }))
  }

  function cambiarCliente(valor: string) {
    setFiltros((prev) => ({
      ...prev,
      cliente: valor,
      // Si la sucursal actual no es de este cliente, se limpia (evita filtros imposibles).
      planta:
        prev.planta && plantasOficiales.some((p) => p.nombre === prev.planta && (!valor || p.cliente_nombre === valor))
          ? prev.planta
          : '',
    }))
  }

  function cambiarCrop(valor: string) {
    setFiltros((prev) => ({
      ...prev,
      crop: valor,
      // La variedad elegida puede no existir en la nueva especie -se limpia
      // para no dejar un filtro imposible (ej. "June Gold" de Manzana
      // quedando puesto al cambiar a Durazno)-.
      variedad: '',
    }))
  }

  async function descargarDatos() {
    setDescargandoDatos(true)
    try {
      const { blob, nombre } = await descargarDatosExcel(clienteFijo, plantaFija)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = nombre ?? 'datos.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setErrorMsg('No se pudo generar el Excel.')
    } finally {
      setDescargandoDatos(false)
    }
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
          {clienteFijo && (
            <Button variant="secondary" onClick={descargarDatos} disabled={descargandoDatos}>
              {descargandoDatos ? 'Generando…' : '⬇ Descargar mi historial (Excel)'}
            </Button>
          )}
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
            {/* Filtros principales primero: Laboratorio, Sold To, Ship To, Tipo de servicio, Especie —
                son los que definen qué tipo de reporte/límites corresponde mostrar. El resto va después. */}
            <label className={styles.filtro}>
              <span>Laboratorio</span>
              <select value={filtros.laboratorio} onChange={(e) => actualizarFiltro('laboratorio', e.target.value)}>
                <option value="">Todos</option>
                {opciones.laboratorios.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            {/* Para cuentas de cliente (clienteFijo) los datos ya vienen acotados desde
                el backend a ese Sold To/Ship To: mostrar estos dos filtros no aportaría
                nada (siempre habría un solo valor posible) y solo confundiría. Se
                mantienen para admin general/admin de área, que sí navegan entre clientes. */}
            {!clienteFijo && (
              <>
                <BuscableSelect
                  etiqueta="Cliente (Sold To)"
                  opciones={opciones.clientes}
                  valor={filtros.cliente}
                  onChange={cambiarCliente}
                />
                <BuscableSelect
                  etiqueta="Sucursal (Ship To)"
                  opciones={opciones.plantas}
                  valor={filtros.planta}
                  onChange={(v) => actualizarFiltro('planta', v)}
                />
              </>
            )}
            <label className={styles.filtro}>
              <span>Tipo de servicio</span>
              <select value={filtros.tipoServicio} onChange={(e) => actualizarFiltro('tipoServicio', e.target.value)}>
                <option value="">Todos</option>
                {opciones.tiposServicio.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className={styles.filtro}>
              <span>Especie</span>
              <select value={filtros.crop} onChange={(e) => cambiarCrop(e.target.value)}>
                <option value="">Todas</option>
                {opciones.crops.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className={styles.filtro}>
              <span>Variedad</span>
              <select value={filtros.variedad} onChange={(e) => actualizarFiltro('variedad', e.target.value)}>
                <option value="">Todas</option>
                {opciones.variedades.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>

            <MultiSelectFiltro
              etiqueta="Ingrediente Activo"
              opciones={opciones.ingredientes}
              valores={filtros.ingredientes}
              onChange={(v) => setFiltros((prev) => ({ ...prev, ingredientes: v }))}
              colorDe={colorDeIngrediente}
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
              <span>Semana</span>
              <select value={filtros.semana} onChange={(e) => actualizarSemana(e.target.value)} disabled={Boolean(filtros.rango)}>
                <option value="">Todas</option>
                {opciones.semanas.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className={styles.filtro}>
              <span>Mes</span>
              <select value={filtros.mes} onChange={(e) => actualizarMes(e.target.value)} disabled={Boolean(filtros.rango)}>
                <option value="">Todos</option>
                {opciones.meses.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <CalendarioRango etiqueta="Rango de fechas" valor={filtros.rango} onChange={aplicarRango} />
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
              <span className={styles.statNum}>{registrosFiltrados.toLocaleString('es-CL')}</span>
              {filtrosActivos(filtros) && (
                <span className={styles.statSub}>de {totalSolicitudes.toLocaleString('es-CL')} en total</span>
              )}
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
              <h3>
                {vista === 'residual' ? `Promedio de ${unidad} por fecha` : `${unidad} por fecha · límites de control`}
                <span className={styles.hintClic}>clic en un punto para ver el detalle</span>
              </h3>
              <div className={styles.chartbox}>
                <canvas ref={mainRef} />
              </div>
            </Card>
            <Card className={styles.panel}>
              <h3>
                Porcentaje de cumplimiento
                <span className={styles.hintClic}>clic para ver el detalle</span>
              </h3>
              <div className={styles.chartbox}>
                <canvas ref={donutRef} />
              </div>
            </Card>
          </div>

          <div className={styles.grid2}>
            <Card className={styles.panel}>
              <h3>
                Distribución de cumplimiento
                <span className={styles.hintClic}>clic para ver el detalle</span>
              </h3>
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

      {detalle && (
        <DetalleObservacionesModal titulo={detalle.titulo} filas={detalle.filas} onCerrar={() => setDetalle(null)} />
      )}
    </div>
  )
}
