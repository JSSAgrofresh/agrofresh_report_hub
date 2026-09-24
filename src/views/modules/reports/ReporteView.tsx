import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'
import type { ChartDataset, TooltipItem } from 'chart.js'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { BuscableSelect } from '@/components/ui/BuscableSelect'
import { IconFrasco } from '@/components/ui/icons'
import { MultiSelectFiltro } from '@/components/ui/MultiSelectFiltro'
import { CalendarioRango } from '@/components/ui/CalendarioRango'
import type { RangoFechas } from '@/components/ui/CalendarioRango'
import { areaDeModulo } from '@/constants/areas'
import { useAuth } from '@/features/auth'
import { listarEspeciesActivas, listarValores } from '@/features/listados'
import type { ValorLista } from '@/features/listados'
import { HttpError } from '@/services/http/client'
import { formatDateCL, formatDecimalCL } from '@/lib/locale'
import {
  FILTROS_VACIOS,
  aplicarFiltros,
  calcularEstadisticas,
  calcularLimitesControl,
  clientesDeSucursal,
  colorDeIngrediente,
  contarFiltrosActivos,
  contarFueraDeIntervalo,
  descargarDatosExcel,
  histograma,
  listarAnalitos,
  listarLimites,
  mismoValor,
  obtenerDatosReporte,
  opcionesDe,
  proximaHoraProgramada,
  useActualizacionProgramada,
} from '@/features/reportes'
import type {
  Analito,
  FilaReporte,
  FiltrosReporte,
  LimiteAnalito,
  Observacion,
  OpcionFiltro,
  TramoHistograma,
} from '@/features/reportes'
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
  Filler,
)

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

/** '#2f7d32' + 0.1 -> 'rgba(47, 125, 50, 0.1)'. Si el color no es hex, se deja igual. */
function conAlfa(color: string, alfa: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim())
  if (!m) return color
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`
}

function unique(valores: (string | number | null | undefined)[]): string[] {
  return [...new Set(valores.filter((v) => v !== null && v !== undefined && v !== '').map(String))].sort((a, b) =>
    a.localeCompare(b, 'es', { numeric: true }),
  )
}

/** Especie es casi siempre una sola palabra: si la variante más frecuente vino
 * toda en minúscula o toda en mayúscula (dato tal cual, sin homogenizar), se
 * pareja a "Primera letra mayúscula" para que la lista se vea consistente. No
 * se usa para tipo de servicio porque ahí sí importan las mayúsculas internas
 * (ej. "Linea de Proceso"). */
function capitalizarPrimeraLetra(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

type Vista = 'residual' | 'control'
type Estado = 'cargando' | 'ok' | 'error'

type Filtros = FiltrosReporte

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function nombreMes(mes: string): string {
  return MESES[Number(mes) - 1] ?? mes
}

/** Texto de una opción de un desplegable nativo: el valor y cuántas
 * solicitudes trae, para saber antes de elegir si hay algo que ver. */
function textoOpcion(o: OpcionFiltro, etiqueta: (v: string) => string = (v) => v): string {
  return `${etiqueta(o.valor)} (${o.conteo.toLocaleString('es-CL')})`
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

/** Para la tabla de Diagnofruit: si el patógeno se detectó en la muestra
 * (valor numérico > 0, o un texto que no sea "ND"/"0"/vacío), se resalta la
 * celda -es la lectura que le importa al laboratorio, más que el número exacto-. */
const TEXTOS_NO_DETECTADO = new Set(['', 'nd', 'no detectado', '0', 'bld'])

function esDetectado(o: Observacion | undefined): boolean {
  if (!o) return false
  if (o.ppm != null) return o.ppm > 0
  const texto = (o.valorTexto ?? '').trim().toLowerCase()
  return !TEXTOS_NO_DETECTADO.has(texto)
}

const ETIQUETAS_FILTRO: Record<keyof Filtros, string> = {
  laboratorio: 'Laboratorio',
  cliente: 'Sold To',
  planta: 'Ship To',
  tipoServicio: 'Servicio',
  crop: 'Especie',
  variedad: 'Variedad',
  ingredientes: 'Ingrediente',
  tipoAplicacion: 'Aplicación',
  semana: 'Semana',
  mes: 'Mes',
  rango: 'Fechas',
}

/** Un "chip" por filtro puesto, para ver de un vistazo qué está aplicado y
 * quitarlo con un clic (los desplegables solo muestran el valor recortado). */
function chipsDeFiltros(f: Filtros, clienteFijo: boolean): { campo: keyof Filtros; etiqueta: string; valor: string }[] {
  const chips: { campo: keyof Filtros; etiqueta: string; valor: string }[] = []
  ;(Object.keys(ETIQUETAS_FILTRO) as (keyof Filtros)[]).forEach((campo) => {
    if (clienteFijo && (campo === 'cliente' || campo === 'planta')) return
    const valor =
      campo === 'ingredientes'
        ? f.ingredientes.join(', ')
        : campo === 'rango'
          ? f.rango
            ? `${formatDateCL(f.rango.desde)} – ${formatDateCL(f.rango.hasta)}`
            : ''
          : campo === 'mes'
            ? f.mes && nombreMes(f.mes)
            : f[campo]
    if (valor) chips.push({ campo, etiqueta: ETIQUETAS_FILTRO[campo], valor })
  })
  return chips
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
  // Especie y Variedad de los filtros salen de Listados -la fuente de verdad
  // oficial-, no de lo que ya haya cargado en el reporte: así el filtro
  // ofrece todo lo que existe de verdad, no solo lo que por casualidad ya
  // tiene datos hoy. Sold To/Ship To NO -ver comentario en `opciones`-.
  const [especiesOficiales, setEspeciesOficiales] = useState<ValorLista[]>([])
  const [variedadesOficiales, setVariedadesOficiales] = useState<string[]>([])
  const [modalAnalitos, setModalAnalitos] = useState(false)
  const [detalle, setDetalle] = useState<{ titulo: string; filas: Observacion[] } | null>(null)
  const [descargandoDatos, setDescargandoDatos] = useState(false)
  const [vistaGrafico, setVistaGrafico] = useState<'promedios' | 'individual'>('promedios')

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
    listarEspeciesActivas()
      .then(setEspeciesOficiales)
      .catch(() => setEspeciesOficiales([]))
  }, [clienteFijo])

  useEffect(() => {
    // Todas las variedades, sin acotar por especie: se usan solo para mostrar
    // el nombre oficial. La cascada Especie → Variedad la hacen los propios
    // datos (ver `opciones`), así "June Gold" de Durazno y de Manzana nunca
    // se mezclan.
    listarValores('variedad')
      .then((vs) => setVariedadesOficiales(unique(vs.map((v) => v.valor))))
      .catch(() => setVariedadesOficiales([]))
  }, [])

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
        posicionMuestreo: f.posicion_muestreo,
        laboratorio: f.laboratorio,
        crop: f.especie,
        variedad: f.variedad,
        semana: f.semana_muestreo,
        mes: f.mes,
      }
    })
  }, [filas])

  // Cada desplegable ofrece lo que queda con TODOS LOS DEMÁS filtros puestos
  // (facetas), con cuántas solicitudes trae cada opción. Antes Especie y
  // Variedad listaban todo Listados: con un Sold To elegido, casi todas daban
  // 0 resultados. Ahora Listados solo pone el nombre oficial.
  //
  // Sold To/Ship To salen de los datos (COALESCE(cliente.nombre, sold_to_raw)
  // en el backend): una solicitud sin planta resuelta cae al texto crudo, y
  // ese texto puede venir escrito distinto al oficial ("AG Servicios SpA" vs
  // "A.G. SERVICIOS SPA"). `claveFiltro` los junta en una sola opción.
  const opciones = useMemo(() => {
    const de = (
      campo: Parameters<typeof opcionesDe>[1],
      config: Parameters<typeof opcionesDe>[2] = {},
    ): OpcionFiltro[] => opcionesDe(aplicarFiltros(observaciones, filtros, campo), campo, config)
    return {
      ingredientes: de('ingredientes', { seleccionados: filtros.ingredientes }),
      clientes: de('cliente', { seleccionados: [filtros.cliente] }),
      plantas: de('planta', { seleccionados: [filtros.planta] }),
      tiposAplicacion: de('tipoAplicacion', { formatear: capitalizarPrimeraLetra, seleccionados: [filtros.tipoAplicacion] }),
      tiposServicio: de('tipoServicio', { formatear: capitalizarPrimeraLetra, seleccionados: [filtros.tipoServicio] }),
      laboratorios: de('laboratorio', { formatear: capitalizarPrimeraLetra, seleccionados: [filtros.laboratorio] }),
      crops: de('crop', { canonicos: especiesOficiales.map((e) => e.valor), seleccionados: [filtros.crop] }),
      variedades: de('variedad', { canonicos: variedadesOficiales, seleccionados: [filtros.variedad] }),
      semanas: de('semana', { orden: 'numero', seleccionados: [filtros.semana] }),
      meses: de('mes', { orden: 'numero', seleccionados: [filtros.mes] }),
    }
  }, [observaciones, filtros, especiesOficiales, variedadesOficiales])

  const conteoPorValor = useMemo(() => {
    const mapa = (lista: OpcionFiltro[]) => new Map(lista.map((o) => [o.valor, o.conteo]))
    return { clientes: mapa(opciones.clientes), plantas: mapa(opciones.plantas), ingredientes: mapa(opciones.ingredientes) }
  }, [opciones])

  const filtradas = useMemo(() => aplicarFiltros(observaciones, filtros), [observaciones, filtros])
  const nFiltros = contarFiltrosActivos(filtros)

  const registrosFiltrados = useMemo(() => new Set(filtradas.map((o) => o.solicitudId)).size, [filtradas])

  // Diagnofruit no reporta ppm de un residuo contra un límite: cuantifica
  // patógenos (levaduras, botrytis, etc.), cada uno en su propia unidad, así
  // que el gráfico de línea/dona de las otras vistas no tiene nada que
  // comparar. Acá se muestra una tabla ancha en vez de eso: una fila por
  // solicitud (fecha + zona de muestreo) y una columna por analito.
  const esDiagnofruit = Boolean(filtros.laboratorio) && mismoValor(filtros.laboratorio, 'Diagnofruit')

  const gruposDiagnofruit = useMemo(() => {
    if (!esDiagnofruit) return []
    const porSolicitud = new Map<
      number,
      {
        nro: string
        fecha: string | null
        zona: string | null
        patogenos: { codigo: string; nombre: string; texto: string; detectado: boolean }[]
      }
    >()
    filtradas.forEach((o) => {
      if (!o.ingrediente) return
      let grupo = porSolicitud.get(o.solicitudId)
      if (!grupo) {
        grupo = { nro: o.nroSolicitud, fecha: o.fecha, zona: o.posicionMuestreo, patogenos: [] }
        porSolicitud.set(o.solicitudId, grupo)
      }
      // El código del analito (LEV, BOT…) no dice nada al leerlo: se busca su
      // nombre en el catálogo de Diagnofruit y, si por algún motivo no está
      // -código nuevo sin catalogar todavía-, se muestra tal cual llegó.
      const nombre =
        analitos.find((a) => a.codigo === o.ingrediente && mismoValor(a.laboratorio, 'Diagnofruit'))?.nombre ??
        o.ingrediente
      const texto = o.ppm != null ? formatDecimalCL(o.ppm, 2) : o.valorTexto ?? '—'
      grupo.patogenos.push({ codigo: o.ingrediente, nombre, texto, detectado: esDetectado(o) })
    })
    return [...porSolicitud.values()].sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''))
  }, [esDiagnofruit, filtradas, analitos])

  // El gráfico de barras de abajo es un resumen de la misma tabla, no un dato
  // aparte: cuántas muestras dieron positivo/negativo para cada patógeno, de
  // los que de verdad se analizaron con los filtros de arriba puestos. El
  // color de cada patógeno es el mismo `colorDeIngrediente` que usa el resto
  // de Report -así un mismo código siempre se ve del mismo color, esté en la
  // tabla, en el gráfico o en el filtro "Ingrediente Activo"-.
  const resumenPatogenosDiagnofruit = useMemo(() => {
    if (!esDiagnofruit) return []
    const porCodigo = new Map<string, { nombre: string; detectado: number; noDetectado: number }>()
    gruposDiagnofruit.forEach((grupo) => {
      grupo.patogenos.forEach((p) => {
        const entrada = porCodigo.get(p.codigo) ?? { nombre: p.nombre, detectado: 0, noDetectado: 0 }
        if (p.detectado) entrada.detectado += 1
        else entrada.noDetectado += 1
        porCodigo.set(p.codigo, entrada)
      })
    })
    return [...porCodigo.entries()]
      .map(([codigo, c]) => ({ codigo, color: colorDeIngrediente(codigo), ...c }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }, [esDiagnofruit, gruposDiagnofruit])

  const totalDetecciones = useMemo(
    () => resumenPatogenosDiagnofruit.reduce((acc, r) => acc + r.detectado, 0),
    [resumenPatogenosDiagnofruit],
  )

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
    return candidatos.find((a) => mismoValor(a.laboratorio, filtros.laboratorio)) ?? candidatos[0]
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
      propios.find((l) => mismoValor(l.especie, especie) && mismoValor(l.tipo_servicio, servicio)),
      especie ? propios.find((l) => mismoValor(l.especie, especie) && l.tipo_servicio === '') : undefined,
      servicio ? propios.find((l) => l.especie === '' && mismoValor(l.tipo_servicio, servicio)) : undefined,
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
  const diagnoBarRef = useRef<HTMLCanvasElement>(null)
  const mainChart = useRef<Chart | null>(null)
  const donutChart = useRef<Chart | null>(null)
  const barChart = useRef<Chart | null>(null)
  const diagnoBarChart = useRef<Chart | null>(null)

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

    let etiquetas: string[]
    let datasets: ChartDataset<'line', (number | null)[]>[]
    let onClickGrafico: (_evt: unknown, elements: { datasetIndex: number; index: number }[]) => void
    // Cuántas muestras promedia cada punto (solo vista por promedios, un ingrediente).
    let muestrasPorPunto: number[] | null = null
    const inferior = limitesActivos.inferior
    const superior = limitesActivos.superior
    const hayLimites = inferior != null && superior != null
    // Con límites definidos, un punto fuera del intervalo se pinta rojo: se ve
    // el incumplimiento sin tener que comparar a ojo contra la línea punteada.
    const colorPunto = (v: number | null) =>
      hayLimites && v != null && (v < inferior || v > superior) ? colorDanger : colorLineaUnica

    if (vistaGrafico === 'individual') {
      // Vista individual: un punto por observación, sin agrupar por fecha.
      const sorted = [...filtradas]
        .filter((o) => o.ppm != null)
        .sort((a, b) => (a.fecha ?? '').localeCompare(b.fecha ?? '') || (a.nroSolicitud ?? '').localeCompare(b.nroSolicitud ?? ''))

      etiquetas = sorted.map((o) => (o.fecha ? formatDateCL(o.fecha) : 'Sin fecha'))

      if (comparandoVarios) {
        datasets = filtros.ingredientes.map((ingrediente) => {
          const color = colorDeIngrediente(ingrediente)
          return {
            label: ingrediente,
            data: sorted.map((o) => (o.ingrediente === ingrediente ? (o.ppm as number) : null)),
            borderColor: color,
            backgroundColor: color,
            borderWidth: 0,
            showLine: false,
            pointRadius: 3,
            pointHoverRadius: 5,
          }
        })
      } else {
        datasets = [
          {
            label: unidad,
            data: sorted.map((o) => o.ppm as number),
            borderColor: colorLineaUnica,
            backgroundColor: colorLineaUnica,
            pointBackgroundColor: sorted.map((o) => colorPunto(o.ppm)),
            pointBorderColor: sorted.map((o) => colorPunto(o.ppm)),
            borderWidth: 0,
            showLine: false,
            pointRadius: 3,
            pointHoverRadius: 5,
          },
          {
            label: 'Límite superior',
            data: sorted.map(() => limitesActivos.superior),
            borderColor: colorWarning,
            borderDash: [6, 4],
            borderWidth: 1.5,
            pointRadius: 0,
          },
          {
            label: 'Límite central',
            data: sorted.map(() => limitesActivos.central),
            borderColor: colorMuted,
            borderDash: [2, 3],
            borderWidth: 1.5,
            pointRadius: 0,
          },
          {
            label: 'Límite inferior',
            data: sorted.map(() => limitesActivos.inferior),
            borderColor: colorWarning,
            borderDash: [6, 4],
            borderWidth: 1.5,
            pointRadius: 0,
          },
        ]
      }

      onClickGrafico = (_evt, elements) => {
        if (!elements.length) return
        const { datasetIndex, index } = elements[0]
        if (comparandoVarios) {
          if (datasetIndex >= filtros.ingredientes.length) return
          const obs = sorted[index]
          if (obs) setDetalle({ titulo: `${filtros.ingredientes[datasetIndex] ?? ''} · ${etiquetas[index]}`, filas: [obs] })
        } else {
          if (datasetIndex !== 0) return
          const obs = sorted[index]
          if (obs) setDetalle({ titulo: `${obs.nroSolicitud} · ${etiquetas[index]}`, filas: [obs] })
        }
      }
    } else {
      // Vista por promedios (por defecto): un punto por fecha, valor = promedio del día.
      const claves = unique(filtradas.map((o) => o.fecha ?? 'Sin fecha')).sort()
      etiquetas = claves.map((k) => (k === 'Sin fecha' ? k : formatDateCL(k)))

      if (comparandoVarios) {
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
          return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
        })
        muestrasPorPunto = claves.map((k) => porFecha.get(k)?.length ?? 0)
        datasets = [
          {
            label: `Promedio ${unidad}`,
            data: promedios,
            borderColor: colorLineaUnica,
            backgroundColor: conAlfa(colorLineaUnica, 0.08),
            pointBackgroundColor: promedios.map((v) => colorPunto(v)),
            pointBorderColor: promedios.map((v) => colorPunto(v)),
            fill: 'origin',
            spanGaps: true,
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

      onClickGrafico = (_evt, elements) => {
        if (!elements.length) return
        const { datasetIndex, index } = elements[0]
        const fechaClave = unique(filtradas.map((o) => o.fecha ?? 'Sin fecha')).sort()[index]
        if (comparandoVarios) {
          const ingrediente = filtros.ingredientes[datasetIndex]
          const obs = filtradas.filter((o) => o.ingrediente === ingrediente && (o.fecha ?? 'Sin fecha') === fechaClave)
          if (obs.length) setDetalle({ titulo: `${ingrediente} · ${etiquetas[index]}`, filas: obs })
        } else {
          if (datasetIndex !== 0) return
          const obs = filtradas.filter((o) => (o.fecha ?? 'Sin fecha') === fechaClave)
          if (obs.length) setDetalle({ titulo: etiquetas[index], filas: obs })
        }
      }
    }

    mainChart.current?.destroy()
    mainChart.current = new Chart(mainRef.current, {
      type: 'line',
      data: { labels: etiquetas, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: vistaGrafico === 'individual' ? { mode: 'nearest', intersect: true } : { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 14,
              font: { size: 11 },
              // Una línea de límite sin valor no dibuja nada: tampoco va en la leyenda.
              filter: (item, data) => (data.datasets[item.datasetIndex ?? 0]?.data ?? []).some((v) => v != null),
            },
          },
          tooltip: {
            filter: (item: TooltipItem<'line'>) => item.raw != null,
            callbacks: {
              label: (ctx: TooltipItem<'line'>) => {
                const base = `${ctx.dataset.label}: ${formatDecimalCL(ctx.raw as number, 4)}`
                const n = ctx.datasetIndex === 0 ? muestrasPorPunto?.[ctx.dataIndex] : undefined
                return n ? `${base} (${n} muestra${n === 1 ? '' : 's'})` : base
              },
            },
          },
        },
        scales: {
          x: { ticks: { maxTicksLimit: 8, autoSkipPadding: 16, font: { size: 10 }, maxRotation: 0 }, grid: { display: false } },
          y: {
            beginAtZero: true,
            grid: { color: colorBorder },
            ticks: { callback: (v) => formatDecimalCL(Number(v), 2) },
            title: { display: true, text: unidad, font: { size: 11 }, color: colorMuted },
          },
        },
        onClick: onClickGrafico,
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
    colorDanger,
    unidad,
    vistaGrafico,
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
        cutout: '72%',
        plugins: {
          // La leyenda va aparte (HTML, con los números): así el centro de la
          // dona queda de verdad al centro y ahí se escribe el porcentaje.
          legend: { display: false },
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

  // Distribución de los valores medidos (histograma). Reemplaza al gráfico
  // "dentro/fuera" que repetía lo mismo que la dona: este sirve también sin
  // límites cargados, y con límites pinta en rojo los tramos que caen fuera.
  const tramos = useMemo(() => histograma(valores), [valores])

  useEffect(() => {
    if (!barRef.current) return
    const inferior = limitesActivos.inferior
    const superior = limitesActivos.superior
    const hayLimites = inferior != null && superior != null
    const colorTramo = (t: TramoHistograma) => {
      if (!hayLimites) return acento
      const medio = (t.desde + t.hasta) / 2
      return medio < inferior || medio > superior ? colorDanger : colorOk
    }
    const etiqueta = (t: TramoHistograma) =>
      t.desde === t.hasta ? formatDecimalCL(t.desde, 2) : `${formatDecimalCL(t.desde, 2)}–${formatDecimalCL(t.hasta, 2)}`
    barChart.current?.destroy()
    barChart.current = new Chart(barRef.current, {
      type: 'bar',
      data: {
        labels: tramos.map(etiqueta),
        datasets: [
          {
            label: 'Muestras',
            data: tramos.map((t) => t.conteo),
            backgroundColor: tramos.map(colorTramo),
            borderRadius: 3,
            categoryPercentage: 0.95,
            barPercentage: 0.95,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => `${items[0]?.label ?? ''} ${unidad}`,
              label: (ctx) => `${ctx.raw} muestra(s)`,
            },
          },
        },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: colorBorder }, title: { display: true, text: 'Muestras', font: { size: 11 }, color: colorMuted } },
          x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 45 }, title: { display: true, text: unidad, font: { size: 11 }, color: colorMuted } },
        },
        onClick: (_evt, elements) => {
          if (!elements.length) return
          const t = tramos[elements[0].index]
          if (!t) return
          const ultimo = elements[0].index === tramos.length - 1
          const obs = filtradas.filter(
            (o) => o.ppm != null && o.ppm >= t.desde && (ultimo ? o.ppm <= t.hasta : o.ppm < t.hasta),
          )
          if (obs.length) setDetalle({ titulo: `${etiqueta(t)} ${unidad}`, filas: obs })
        },
      },
    })
    return () => barChart.current?.destroy()
  }, [tramos, filtradas, limitesActivos.inferior, limitesActivos.superior, acento, unidad, colorOk, colorDanger, colorBorder, colorMuted])

  useEffect(() => {
    if (!esDiagnofruit || !diagnoBarRef.current) return
    diagnoBarChart.current?.destroy()
    diagnoBarChart.current = new Chart(diagnoBarRef.current, {
      type: 'bar',
      data: {
        labels: resumenPatogenosDiagnofruit.map((r) => r.nombre),
        datasets: [
          {
            label: 'Detectado',
            data: resumenPatogenosDiagnofruit.map((r) => r.detectado),
            backgroundColor: colorDanger,
            borderRadius: 4,
            maxBarThickness: 40,
          },
          {
            label: 'No detectado',
            data: resumenPatogenosDiagnofruit.map((r) => r.noDetectado),
            backgroundColor: colorOk,
            borderRadius: 4,
            maxBarThickness: 40,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 14, font: { size: 11 } } } },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: colorBorder }, stacked: true },
          x: {
            grid: { display: false },
            stacked: true,
            // Cada patógeno con su color representativo -el mismo que usa en la
            // tabla de arriba y en el filtro "Ingrediente Activo"- para que se
            // reconozca de un vistazo cuál barra es cuál sin mirar la leyenda.
            ticks: {
              color: (ctx) => resumenPatogenosDiagnofruit[ctx.index]?.color ?? colorMuted,
              font: { weight: 'bold' },
            },
          },
        },
        onClick: (_evt, elements) => {
          if (!elements.length) return
          const { datasetIndex, index } = elements[0]
          const fila = resumenPatogenosDiagnofruit[index]
          if (!fila) return
          const detectadoSel = datasetIndex === 0
          const obs = filtradas.filter((o) => o.ingrediente === fila.codigo && esDetectado(o) === detectadoSel)
          if (obs.length) {
            setDetalle({ titulo: `${fila.nombre} · ${detectadoSel ? 'Detectado' : 'No detectado'}`, filas: obs })
          }
        },
      },
    })
    return () => diagnoBarChart.current?.destroy()
  }, [esDiagnofruit, resumenPatogenosDiagnofruit, filtradas, colorDanger, colorOk, colorBorder, colorMuted])

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
        prev.planta && (!valor || clientesDeSucursal(observaciones, prev.planta).some((c) => mismoValor(c, valor)))
          ? prev.planta
          : '',
    }))
  }

  function cambiarPlanta(valor: string) {
    setFiltros((prev) => {
      // Elegir una sucursal sin cliente completa el Sold To si la sucursal es de
      // uno solo: el nombre de una planta puede repetirse entre clientes
      // ("Planta Rancagua"), y así queda a la vista de quién es.
      const duenos = valor && !prev.cliente ? clientesDeSucursal(observaciones, valor) : []
      return { ...prev, planta: valor, cliente: duenos.length === 1 ? duenos[0] : prev.cliente }
    })
  }

  function cambiarCrop(valor: string) {
    setFiltros((prev) => ({
      ...prev,
      crop: valor,
      // La variedad elegida se mantiene solo si existe en la nueva especie
      // -"June Gold" de Manzana no puede quedar puesta al cambiar a Durazno-.
      variedad:
        prev.variedad &&
        (!valor || observaciones.some((o) => mismoValor(o.crop, valor) && mismoValor(o.variedad, prev.variedad)))
          ? prev.variedad
          : '',
    }))
  }

  function quitarFiltro(campo: keyof Filtros) {
    if (campo === 'cliente') cambiarCliente('')
    else if (campo === 'crop') cambiarCrop('')
    else setFiltros((prev) => ({ ...prev, [campo]: FILTROS_VACIOS[campo] }))
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
          {!esDiagnofruit && (
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
          )}

          <section className={styles.filtrosCard} aria-label="Filtros">
            <div className={styles.filtrosCabecera}>
              <span className={styles.filtrosTitulo}>
                Filtros
                {nFiltros > 0 && <span className={styles.filtrosContador}>{nFiltros}</span>}
              </span>
              <span className={styles.filtrosResumen}>
                {registrosFiltrados.toLocaleString('es-CL')} de {totalSolicitudes.toLocaleString('es-CL')} solicitudes
              </span>
              {nFiltros > 0 && (
                <button className={styles.limpiar} onClick={() => setFiltros(FILTROS_VACIOS)}>
                  Limpiar filtros
                </button>
              )}
            </div>

            <div className={styles.filtros}>
              {/* Filtros principales primero: Laboratorio, Sold To, Ship To, Tipo de servicio, Especie —
                  son los que definen qué tipo de reporte/límites corresponde mostrar. El resto va después.
                  Cada opción lleva entre paréntesis cuántas solicitudes trae con los demás filtros puestos. */}
              <label className={styles.filtro}>
                <span>Laboratorio</span>
                <select value={filtros.laboratorio} onChange={(e) => actualizarFiltro('laboratorio', e.target.value)}>
                  <option value="">Todos</option>
                  {opciones.laboratorios.map((o) => (
                    <option key={o.valor} value={o.valor}>{textoOpcion(o)}</option>
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
                    opciones={opciones.clientes.map((o) => o.valor)}
                    valor={filtros.cliente}
                    onChange={cambiarCliente}
                    conteoDe={(v) => conteoPorValor.clientes.get(v)}
                  />
                  <BuscableSelect
                    etiqueta="Sucursal (Ship To)"
                    opciones={opciones.plantas.map((o) => o.valor)}
                    valor={filtros.planta}
                    onChange={cambiarPlanta}
                    conteoDe={(v) => conteoPorValor.plantas.get(v)}
                  />
                </>
              )}
              <label className={styles.filtro}>
                <span>Tipo de servicio</span>
                <select value={filtros.tipoServicio} onChange={(e) => actualizarFiltro('tipoServicio', e.target.value)}>
                  <option value="">Todos</option>
                  {opciones.tiposServicio.map((o) => (
                    <option key={o.valor} value={o.valor}>{textoOpcion(o)}</option>
                  ))}
                </select>
              </label>
              <label className={styles.filtro}>
                <span>Especie</span>
                <select value={filtros.crop} onChange={(e) => cambiarCrop(e.target.value)}>
                  <option value="">Todas</option>
                  {opciones.crops.map((o) => (
                    <option key={o.valor} value={o.valor}>{textoOpcion(o)}</option>
                  ))}
                </select>
              </label>
              <label className={styles.filtro}>
                <span>Variedad</span>
                <select value={filtros.variedad} onChange={(e) => actualizarFiltro('variedad', e.target.value)}>
                  <option value="">Todas</option>
                  {opciones.variedades.map((o) => (
                    <option key={o.valor} value={o.valor}>{textoOpcion(o)}</option>
                  ))}
                </select>
              </label>

              <MultiSelectFiltro
                etiqueta="Ingrediente Activo"
                opciones={opciones.ingredientes.map((o) => o.valor)}
                valores={filtros.ingredientes}
                onChange={(v) => setFiltros((prev) => ({ ...prev, ingredientes: v }))}
                colorDe={colorDeIngrediente}
                conteoDe={(v) => conteoPorValor.ingredientes.get(v)}
              />
              <label className={styles.filtro}>
                <span>Tipo aplicación</span>
                <select value={filtros.tipoAplicacion} onChange={(e) => actualizarFiltro('tipoAplicacion', e.target.value)}>
                  <option value="">Todos</option>
                  {opciones.tiposAplicacion.map((o) => (
                    <option key={o.valor} value={o.valor}>{textoOpcion(o)}</option>
                  ))}
                </select>
              </label>
              <label className={styles.filtro}>
                <span>Semana</span>
                <select value={filtros.semana} onChange={(e) => actualizarSemana(e.target.value)} disabled={Boolean(filtros.rango)}>
                  <option value="">Todas</option>
                  {opciones.semanas.map((o) => (
                    <option key={o.valor} value={o.valor}>{textoOpcion(o, (v) => `Semana ${v}`)}</option>
                  ))}
                </select>
              </label>
              <label className={styles.filtro}>
                <span>Mes</span>
                <select value={filtros.mes} onChange={(e) => actualizarMes(e.target.value)} disabled={Boolean(filtros.rango)}>
                  <option value="">Todos</option>
                  {opciones.meses.map((o) => (
                    <option key={o.valor} value={o.valor}>{textoOpcion(o, nombreMes)}</option>
                  ))}
                </select>
              </label>
              <CalendarioRango etiqueta="Rango de fechas" valor={filtros.rango} onChange={aplicarRango} />
            </div>

            {nFiltros > 0 && (
              <div className={styles.chips} aria-label="Filtros aplicados">
                {chipsDeFiltros(filtros, Boolean(clienteFijo)).map((chip) => (
                  <button
                    key={chip.campo}
                    type="button"
                    className={styles.chip}
                    onClick={() => quitarFiltro(chip.campo)}
                    title={`Quitar filtro ${chip.etiqueta}`}
                  >
                    <span className={styles.chipEtiqueta}>{chip.etiqueta}:</span> {chip.valor}
                    <span className={styles.chipX} aria-hidden="true">×</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {esDiagnofruit ? (
            <>
              <p className={styles.nota}>
                Diagnofruit cuantifica patógenos, cada uno en su propia unidad: no hay un único "ppm" que
                graficar contra un límite, así que la vista principal es una tabla en vez de una línea de
                tiempo. Respeta los mismos filtros de arriba que el resto de los reportes.
              </p>

              <div className={styles.stats}>
                <Card className={`${styles.statCard} ${styles.destacado}`}>
                  <span className={styles.statLbl}>Total de registros (solicitudes)</span>
                  <span className={styles.statNum}>{registrosFiltrados.toLocaleString('es-CL')}</span>
                  {nFiltros > 0 && (
                    <span className={styles.statSub}>de {totalSolicitudes.toLocaleString('es-CL')} en total</span>
                  )}
                </Card>
                <Card className={`${styles.statCard} ${styles.info}`}>
                  <span className={styles.statLbl}>Patógenos analizados</span>
                  <span className={styles.statNum}>{resumenPatogenosDiagnofruit.length}</span>
                </Card>
                <Card className={`${styles.statCard} ${styles.danger}`}>
                  <span className={styles.statLbl}>Detecciones</span>
                  <span className={styles.statNum}>{totalDetecciones.toLocaleString('es-CL')}</span>
                </Card>
              </div>

              <Card className={styles.panel}>
                <h3>
                  <span className={styles.tituloConIcono}>
                    <IconFrasco className={styles.iconoPanel} />
                    Resultados por solicitud
                  </span>
                </h3>
                {gruposDiagnofruit.length === 0 ? (
                  <p className={styles.nota}>No hay resultados de Diagnofruit para estos filtros.</p>
                ) : (
                  <div className={styles.tablaDiagnoCaja}>
                    <table className={styles.tablaDiagno}>
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Zona de muestreo</th>
                          <th>Patógeno</th>
                          <th>Resultado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gruposDiagnofruit.map((grupo) =>
                          grupo.patogenos.map((p, i) => (
                            <tr key={`${grupo.nro}-${p.nombre}-${i}`}>
                              {i === 0 && (
                                <>
                                  <td rowSpan={grupo.patogenos.length}>
                                    {grupo.fecha ? formatDateCL(grupo.fecha) : '—'}
                                  </td>
                                  <td rowSpan={grupo.patogenos.length}>{grupo.zona || '—'}</td>
                                </>
                              )}
                              <td>
                                <span className={styles.indicadorConPunto}>
                                  <span
                                    className={styles.puntoColor}
                                    style={{ background: colorDeIngrediente(p.codigo), color: colorDeIngrediente(p.codigo) }}
                                  />
                                  {p.nombre}
                                </span>
                              </td>
                              <td>
                                <Badge tone={p.detectado ? 'danger' : 'success'}>{p.texto}</Badge>
                              </td>
                            </tr>
                          )),
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              {gruposDiagnofruit.length > 0 && (
                <div className={styles.grid2}>
                  <Card className={styles.panel}>
                    <h3>
                      Detecciones por patógeno
                      <span className={styles.hintClic}>resumen de la tabla de arriba · clic en una barra para ver el detalle</span>
                    </h3>
                    <div className={styles.chartbox}>
                      <canvas ref={diagnoBarRef} />
                    </div>
                  </Card>
                  <Card className={styles.panel}>
                    <h3>Indicadores</h3>
                    <div className={styles.indicadores}>
                      {resumenPatogenosDiagnofruit.map((r) => (
                        <div key={r.codigo}>
                          <span className={styles.indicadorConPunto}>
                            <span className={styles.puntoColor} style={{ background: r.color, color: r.color }} />
                            {r.nombre}
                          </span>
                          <b className={r.detectado > 0 ? styles.celdaDetectada : undefined}>
                            {r.detectado} detectada{r.detectado === 1 ? '' : 's'} de {r.detectado + r.noDetectado}
                          </b>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              )}
            </>
          ) : (
            <>
              <p className={styles.nota}>
                <span className={styles.notaIcono} aria-hidden="true">i</span>
                {nota}
              </p>

              <div className={styles.stats}>
                <Card className={`${styles.statCard} ${styles.destacado}`}>
                  <span className={styles.statLbl}>Solicitudes</span>
                  <span className={styles.statNum}>{registrosFiltrados.toLocaleString('es-CL')}</span>
                  <span className={styles.statSub}>
                    {nFiltros > 0 ? `de ${totalSolicitudes.toLocaleString('es-CL')} en total` : 'sin filtros'}
                  </span>
                </Card>
                <Card className={styles.statCard}>
                  <span className={styles.statLbl}>Resultados con valor</span>
                  <span className={styles.statNum}>{valores.length.toLocaleString('es-CL')}</span>
                  <span className={styles.statSub}>análisis con ppm numérico</span>
                </Card>
                <Card className={styles.statCard}>
                  <span className={styles.statLbl}>
                    Promedio (<span className={styles.unidad}>{unidad}</span>)
                  </span>
                  <span className={styles.statNum}>{formatDecimalCL(stats.promedio, 4)}</span>
                  <span className={styles.statSub}>desv. estándar {formatDecimalCL(stats.desviacion, 4)}</span>
                </Card>
                <Card className={`${styles.statCard} ${styles.warn}`}>
                  <span className={styles.statLbl}>
                    {vista === 'residual' ? 'Límites residuales' : `Límites de control (±${sigma}σ)`}
                  </span>
                  {limitesActivos.inferior == null && limitesActivos.central == null && limitesActivos.superior == null ? (
                    <span className={styles.statVacio}>
                      {filtros.ingredientes.length === 1 ? 'Sin límites cargados' : 'Elige un ingrediente'}
                    </span>
                  ) : (
                    <dl className={styles.limitesMini}>
                      <div><dt>Inf.</dt><dd>{formatDecimalCL(limitesActivos.inferior, 2)}</dd></div>
                      <div><dt>Central</dt><dd>{formatDecimalCL(limitesActivos.central, 2)}</dd></div>
                      <div><dt>Sup.</dt><dd>{formatDecimalCL(limitesActivos.superior, 2)}</dd></div>
                    </dl>
                  )}
                </Card>
                <Card className={`${styles.statCard} ${styles.info}`}>
                  <span className={styles.statLbl}>Cumplimiento</span>
                  <span className={styles.statNum}>
                    {cumplimiento.porcentaje != null ? `${formatDecimalCL(cumplimiento.porcentaje, 1)}%` : '—'}
                  </span>
                  <span className={styles.statSub}>
                    {cumplimiento.porcentaje != null
                      ? `${cumplimiento.ok.toLocaleString('es-CL')} de ${cumplimiento.total.toLocaleString('es-CL')} dentro de rango`
                      : 'requiere límites'}
                  </span>
                </Card>
              </div>

              <div className={styles.grid2}>
                <Card className={styles.panel}>
                  <h3>
                    <span className={styles.h3Izq}>
                      {vista === 'residual' ? `Promedio de ${unidad} por fecha` : `${unidad} por fecha · límites de control`}
                      <button
                        className={styles.toggleVista}
                        onClick={() => setVistaGrafico((v) => (v === 'promedios' ? 'individual' : 'promedios'))}
                      >
                        {vistaGrafico === 'promedios' ? 'Ver todos los puntos' : 'Ver por promedio'}
                      </button>
                    </span>
                    <span className={styles.hintClic}>clic en un punto para ver el detalle</span>
                  </h3>
                  <div className={styles.chartbox}>
                    <canvas ref={mainRef} />
                  </div>
                </Card>
                <Card className={styles.panel}>
                  <h3>
                    Porcentaje de cumplimiento
                    {cumplimiento.porcentaje != null && <span className={styles.hintClic}>clic para ver el detalle</span>}
                  </h3>
                  {cumplimiento.porcentaje != null ? (
                    <>
                      <div className={styles.donutbox}>
                        <canvas ref={donutRef} />
                        <div className={styles.donutCentro}>
                          <b>{formatDecimalCL(cumplimiento.porcentaje, 1)}%</b>
                          <span>dentro de rango</span>
                        </div>
                      </div>
                      <div className={styles.leyendaDona}>
                        <span><i style={{ background: colorOk }} />Dentro de rango <b>{cumplimiento.ok.toLocaleString('es-CL')}</b></span>
                        <span><i style={{ background: colorDanger }} />Fuera de rango <b>{cumplimiento.fuera.toLocaleString('es-CL')}</b></span>
                      </div>
                    </>
                  ) : (
                    // Sin límites no hay con qué comparar: antes la dona salía 100 %
                    // verde "Dentro de rango", que se leía como cumplimiento total.
                    <div className={styles.panelVacio}>
                      <p className={styles.panelVacioTitulo}>Sin límites para comparar</p>
                      <p>
                        {filtros.ingredientes.length === 1
                          ? `${filtros.ingredientes[0]} no tiene límites residuales cargados para esta especie y tipo de servicio. Se cargan en «Gestionar analitos», o usa la vista por límite de control.`
                          : 'Elige un solo ingrediente activo para evaluar su cumplimiento, o usa la vista por límite de control.'}
                      </p>
                    </div>
                  )}
                </Card>
              </div>

              <div className={styles.grid2}>
                <Card className={styles.panel}>
                  <h3>
                    <span>
                      Distribución de valores (<span className={styles.unidad}>{unidad}</span>)
                    </span>
                    <span className={styles.hintClic}>clic en una barra para ver sus muestras</span>
                  </h3>
                  <div className={styles.chartbox}>
                    <canvas ref={barRef} />
                  </div>
                </Card>
                <Card className={styles.panel}>
                  <h3>Indicadores</h3>
                  <div className={styles.indicadores}>
                    <div><span>Solicitudes</span><b>{registrosFiltrados.toLocaleString('es-CL')}</b></div>
                    <div><span>Resultados con valor</span><b>{valores.length.toLocaleString('es-CL')}</b></div>
                    <div><span>Promedio</span><b>{formatDecimalCL(stats.promedio, 4)} <span className={styles.unidad}>{unidad}</span></b></div>
                    <div><span>Desviación estándar muestral</span><b>{formatDecimalCL(stats.desviacion, 4)}</b></div>
                    <div><span>Mínimo / máximo</span><b>{tramos.length ? `${formatDecimalCL(tramos[0].desde, 4)} / ${formatDecimalCL(tramos[tramos.length - 1].hasta, 4)}` : '—'}</b></div>
                    <div><span>Límite inferior</span><b>{formatDecimalCL(limitesActivos.inferior, 4)}</b></div>
                    <div><span>Línea central</span><b>{formatDecimalCL(limitesActivos.central, 4)}</b></div>
                    <div><span>Límite superior</span><b>{formatDecimalCL(limitesActivos.superior, 4)}</b></div>
                    {cumplimiento.porcentaje != null && (
                      <div><span>Cumplimiento</span><b>{formatDecimalCL(cumplimiento.porcentaje, 1)}% ({cumplimiento.ok}/{cumplimiento.total})</b></div>
                    )}
                  </div>
                </Card>
              </div>
            </>
          )}
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
