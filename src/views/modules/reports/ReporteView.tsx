import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
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
import type { ChartDataset, Plugin, TooltipItem } from 'chart.js'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { BuscableSelect } from '@/components/ui/BuscableSelect'
import { IconAlerta, IconArchivoPlano, IconFrasco, IconTrendingUp } from '@/components/ui/icons'
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
  calcularLimitesControl,
  claveFiltro,
  clientesDeSucursal,
  colorDeIngrediente,
  colorEspecieMarca,
  contarFiltrosActivos,
  descargarBdExcel,
  descargarDatosExcel,
  describirFiltros,
  generarDatosSimulados,
  informesConPuntos,
  listarAnalitos,
  solicitudesPor,
  listarLimites,
  mismoValor,
  obtenerDatosReporte,
  opcionesDe,
  pedidoBd,
  proximaHoraProgramada,
  tituloGrafico,
  useActualizacionProgramada,
} from '@/features/reportes'
import type {
  Analito,
  DatosSimulados,
  FilaReporte,
  FiltrosReporte,
  LimiteAnalito,
  Observacion,
  OpcionFiltro,
} from '@/features/reportes'
import { AnalitosAdminModal } from './AnalitosAdminModal'
import { DetalleObservacionesModal } from './DetalleObservacionesModal'
import { DescargaBdDialogo } from './DescargaBdDialogo'
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

/** Tarjeta de indicador: ícono en su pastilla de color, etiqueta, cifra y
 * una línea de contexto. `tono` colorea el ícono y el borde, nunca la cifra
 * -el texto va siempre en los tonos de texto, legible en cualquier caso-. */
function Kpi({
  icono,
  tono,
  etiqueta,
  destacado,
  children,
  sub,
}: {
  icono: ReactNode
  tono: string
  etiqueta: ReactNode
  destacado?: boolean
  children: ReactNode
  sub?: ReactNode
}) {
  return (
    <Card
      className={`${styles.statCard} ${destacado ? styles.destacado : ''}`}
      style={{ '--kpi': tono } as CSSProperties}
    >
      <div className={styles.kpiCabeza}>
        <span className={styles.kpiIcono} aria-hidden="true">
          {icono}
        </span>
        <span className={styles.statLbl}>{etiqueta}</span>
      </div>
      {children}
      {sub != null && <span className={styles.statSub}>{sub}</span>}
    </Card>
  )
}

/** `clienteFijo`: usado por el portal de cliente — cuando viene seteado, los
 * datos ya llegan filtrados por el backend (nunca se filtran solo en el
 * navegador) y los filtros de Cliente/Sucursal ni siquiera se muestran.
 * `plantaFija`: opcional, solo tiene sentido junto con clienteFijo — cuentas
 * creadas por Ship To (ej. "Dole Codegua") en vez de por Sold To completo.
 * `onCropChange`: usado por el portal de cliente (y el encabezado del admin)
 * para cambiar la imagen de fondo según la especie elegida en el filtro.
 * `onClienteChange`: el encabezado del admin muestra el Sold To filtrado.
 * `vistaControl`: la vista por límite de control es un gráfico INTERNO y vive
 * solo en Auditoría interna, que monta este componente con esta bandera. Sin
 * ella -Report y portal de cliente- solo existe la vista por límite residual. */
export function ReporteView({
  clienteFijo,
  plantaFija,
  onCropChange,
  vistaControl = false,
  onClienteChange,
}: {
  clienteFijo?: string
  plantaFija?: string
  onCropChange?: (crop: string) => void
  vistaControl?: boolean
  onClienteChange?: (cliente: string) => void
} = {}) {
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
  const vista: Vista = vistaControl ? 'control' : 'residual'
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
  const [avisoBd, setAvisoBd] = useState(false)
  const [descargandoBd, setDescargandoBd] = useState(false)
  // Datos de prueba (solo admin): viven en este estado y en ningún otro lado.
  // Se pierden al salir de Report, al recargar y al actualizar -a propósito:
  // nunca pueden mezclarse con los reales-.
  const [simulacion, setSimulacion] = useState<DatosSimulados | null>(null)
  const cambiarCropRef = useRef<(v: string) => void>(() => {})

  const obtenerTodo = useCallback(async () => {
    const [datos, catalogo, limitesCatalogo] = await Promise.all([
      obtenerDatosReporte(clienteFijo, plantaFija),
      listarAnalitos(),
      listarLimites(),
    ])
    return { filas: datos.filas, totalSolicitudes: datos.total_solicitudes, analitos: catalogo, limites: limitesCatalogo }
  }, [clienteFijo, plantaFija])

  function aplicarExito(r: { filas: FilaReporte[]; totalSolicitudes: number; analitos: Analito[]; limites: LimiteAnalito[] }) {
    setSimulacion(null)
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
    onClienteChange?.(filtros.cliente)
  }, [filtros.cliente, onClienteChange])

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
  // Nunca en el portal de cliente: un cliente no puede ver datos inventados.
  const puedeSimular = esGestor && !clienteFijo
  const simulando = puedeSimular && simulacion != null
  // Lo que se muestra: los datos simulados mientras la simulación está activa,
  // los reales el resto del tiempo. Todo lo de abajo lee de acá.
  const filasVista = simulando ? simulacion.filas : filas
  const analitosVista = simulando ? simulacion.analitos : analitos
  const limitesVista = simulando ? simulacion.limites : limites
  const totalVista = simulando ? simulacion.totalSolicitudes : totalSolicitudes

  // Una fila por cada solicitud filtrada (LEFT JOIN con resultado en el backend):
  // toda solicitud de la base aparece acá, tenga o no un resultado numérico —
  // "ppm" queda en null cuando no hay valor numérico (sin resultado todavía, o
  // un resultado cualitativo como "ND"), pero la solicitud igual se cuenta y
  // se puede ver en el detalle.
  const observaciones = useMemo<Observacion[]>(() => {
    if (!filasVista) return []
    return filasVista.map((f) => {
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
  }, [filasVista])

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
        analitosVista.find((a) => a.codigo === o.ingrediente && mismoValor(a.laboratorio, 'Diagnofruit'))?.nombre ??
        o.ingrediente
      const texto = o.ppm != null ? formatDecimalCL(o.ppm, 2) : o.valorTexto ?? '—'
      grupo.patogenos.push({ codigo: o.ingrediente, nombre, texto, detectado: esDetectado(o) })
    })
    return [...porSolicitud.values()].sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''))
  }, [esDiagnofruit, filtradas, analitosVista])

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
  const limitesControl = useMemo(() => calcularLimitesControl(valores, sigma), [valores, sigma])

  // Con el filtro de ingredientes vacío rigen TODOS los analitos disponibles:
  // así parte seleccionado completo, sin que la persona tenga que marcarlos. Al
  // desmarcar uno queda la lista explícita; marcar todos vuelve a vacío.
  const todosIngredientes = useMemo(() => opciones.ingredientes.map((o) => o.valor), [opciones.ingredientes])
  const ingredientesActivos = filtros.ingredientes.length > 0 ? filtros.ingredientes : todosIngredientes

  // Los límites residuales son por analito: solo tienen sentido con exactamente
  // uno en juego (elegido, o el único que hay con estos filtros).
  const analitoSeleccionado = useMemo(() => {
    if (ingredientesActivos.length !== 1) return null
    const codigo = ingredientesActivos[0]
    const candidatos = analitosVista.filter((a) => a.codigo === codigo)
    if (candidatos.length <= 1) return candidatos[0] ?? null
    return candidatos.find((a) => mismoValor(a.laboratorio, filtros.laboratorio)) ?? candidatos[0]
  }, [analitosVista, ingredientesActivos, filtros.laboratorio])

  // El límite correcto depende de especie y tipo de servicio, no solo del analito:
  // se busca primero la combinación exacta, y si no existe se va relajando hacia
  // los comodines ('' = "aplica a todas/todos") hasta encontrar algo definido.
  const limiteResidual = useMemo(() => {
    if (!analitoSeleccionado) return { inferior: null, central: null, superior: null }
    const propios = limitesVista.filter((l) => l.analito_id === analitoSeleccionado.id)
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
  }, [analitoSeleccionado, limitesVista, filtros.crop, filtros.tipoServicio])

  const limitesActivos = vista === 'residual' ? limiteResidual : limitesControl
  const unidad = analitoSeleccionado?.unidad ?? 'ppm'

  const nota = `Límites dinámicos: promedio ± ${sigma} × desviación estándar de las ${valores.length.toLocaleString('es-CL')} observación(es) filtradas.`

  // ── gráficos ──
  const mainRef = useRef<HTMLCanvasElement>(null)
  const diagnoBarRef = useRef<HTMLCanvasElement>(null)
  const mainChart = useRef<Chart | null>(null)
  const diagnoBarChart = useRef<Chart | null>(null)

  const colorOk = cssVar('--color-ok', '#2f7d32')
  const colorDanger = cssVar('--color-danger', '#b0271f')
  const colorWarning = cssVar('--color-warning', '#b4531f')
  const colorMuted = cssVar('--color-text-faint', '#77837b')
  const colorBorder = cssVar('--color-border', '#e1e5dc')

  // Gráfico central: una columna por informe (la fecha se repite tantas veces
  // como informes haya ese día) y sus analitos uno sobre otro según el ppm,
  // cada uno con su color. Nunca se promedia.
  const informes = useMemo(() => informesConPuntos(filtradas), [filtradas])
  const analitosGraficados = useMemo(
    () => [...new Set(informes.flatMap((i) => i.puntos.map((p) => p.ingrediente as string)))].sort((a, b) => a.localeCompare(b, 'es')),
    [informes],
  )
  const tituloPrincipal = tituloGrafico(filtros, !clienteFijo, vistaControl ? 'Límites de control' : 'Residuales')

  useEffect(() => {
    if (!mainRef.current) return
    const etiquetas = informes.map((i) => (i.fecha ? formatDateCL(i.fecha) : 'Sin fecha'))
    const nAnalitos = analitosGraficados.length

    const datasets: ChartDataset<'line', (number | null)[]>[] = analitosGraficados.map((ingrediente) => {
      const color = colorDeIngrediente(ingrediente)
      return {
        label: ingrediente,
        data: informes.map((i) => i.puntos.find((p) => p.ingrediente === ingrediente)?.ppm ?? null),
        borderColor: color,
        backgroundColor: color,
        borderWidth: 0,
        showLine: false,
        pointRadius: 4.5,
        pointHoverRadius: 6.5,
        pointHitRadius: 8,
      }
    })

    // Las líneas de límite solo tienen sentido con un único analito (residual)
    // o en la vista por límite de control, que es global.
    if (vistaControl || nAnalitos === 1) {
      const lineas: [string, number | null, string, number[]][] = [
        ['Límite superior', limitesActivos.superior, colorWarning, [6, 4]],
        ['Límite central', limitesActivos.central, colorMuted, [2, 3]],
        ['Límite inferior', limitesActivos.inferior, colorWarning, [6, 4]],
      ]
      lineas.forEach(([label, valor, color, dash]) =>
        datasets.push({
          label,
          data: informes.map(() => valor),
          borderColor: color,
          borderDash: dash,
          borderWidth: 1.5,
          pointRadius: 0,
          pointHitRadius: 0,
        }),
      )
    }

    // Una línea tenue por analito, del mismo color que sus puntos, que une sus
    // resultados de un informe al siguiente en orden de fecha (se salta los
    // informes donde ese analito no vino). Va DEBAJO de los puntos y de los
    // conectores, para que se lea la tendencia sin tapar ningún dato.
    const lineasPorAnalito: Plugin<'line'> = {
      id: 'lineasPorAnalito',
      beforeDatasetsDraw(chart) {
        const { ctx } = chart
        ctx.save()
        ctx.globalAlpha = 0.4
        ctx.lineWidth = 1.5
        ctx.lineJoin = 'round'
        ctx.setLineDash([])
        for (let di = 0; di < nAnalitos; di++) {
          if (!chart.isDatasetVisible(di)) continue
          const valores = chart.data.datasets[di].data
          const puntos = chart.getDatasetMeta(di).data.filter((_, idx) => valores[idx] != null)
          if (puntos.length < 2) continue
          ctx.strokeStyle = colorDeIngrediente(analitosGraficados[di])
          ctx.beginPath()
          puntos.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
          ctx.stroke()
        }
        ctx.restore()
      },
    }

    // Línea punteada negra que une los analitos de un mismo informe, de abajo
    // hacia arriba, para ver de un golpe cuáles pertenecen a la misma muestra.
    const conectores: Plugin<'line'> = {
      id: 'conectoresInforme',
      beforeDatasetsDraw(chart) {
        const { ctx } = chart
        ctx.save()
        ctx.strokeStyle = '#000000'
        ctx.lineWidth = 1
        ctx.setLineDash([3, 3])
        informes.forEach((_, idx) => {
          const ys: number[] = []
          let x = 0
          for (let di = 0; di < nAnalitos; di++) {
            if (!chart.isDatasetVisible(di) || chart.data.datasets[di].data[idx] == null) continue
            const punto = chart.getDatasetMeta(di).data[idx]
            if (!punto) continue
            ys.push(punto.y)
            x = punto.x
          }
          if (ys.length < 2) return
          ctx.beginPath()
          ctx.moveTo(x, Math.min(...ys))
          ctx.lineTo(x, Math.max(...ys))
          ctx.stroke()
        })
        ctx.restore()
      },
    }

    mainChart.current?.destroy()
    mainChart.current = new Chart(mainRef.current, {
      type: 'line',
      data: { labels: etiquetas, datasets },
      plugins: [lineasPorAnalito, conectores],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'nearest', intersect: true },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 10,
              usePointStyle: true,
              font: { size: 11 },
              // Una línea de límite sin valor no dibuja nada: tampoco va en la leyenda.
              filter: (item, data) => (data.datasets[item.datasetIndex ?? 0]?.data ?? []).some((v) => v != null),
            },
          },
          tooltip: {
            filter: (item: TooltipItem<'line'>) => item.raw != null,
            callbacks: {
              title: (items) => {
                const inf = informes[items[0]?.dataIndex ?? -1]
                return inf ? `${inf.nroSolicitud} · ${etiquetas[items[0].dataIndex]}` : ''
              },
              label: (ctx: TooltipItem<'line'>) => `${ctx.dataset.label}: ${formatDecimalCL(ctx.raw as number, 4)}`,
            },
          },
        },
        scales: {
          // Fechas en vertical: así caben todas aunque el día se repita.
          x: {
            ticks: { autoSkip: true, autoSkipPadding: 6, font: { size: 10 }, maxRotation: 90, minRotation: 90 },
            grid: { display: false },
          },
          y: {
            beginAtZero: true,
            grid: { color: colorBorder },
            ticks: { callback: (v) => formatDecimalCL(Number(v), 2) },
            title: { display: true, text: unidad, font: { size: 11 }, color: colorMuted },
          },
        },
        onClick: (_evt, elements) => {
          if (!elements.length) return
          const { datasetIndex, index } = elements[0]
          if (datasetIndex >= nAnalitos) return
          const inf = informes[index]
          if (inf) setDetalle({ titulo: `${inf.nroSolicitud} · ${etiquetas[index]}`, filas: inf.puntos })
        },
      },
    })
    return () => mainChart.current?.destroy()
  }, [
    informes,
    analitosGraficados,
    vistaControl,
    limitesActivos.superior,
    limitesActivos.central,
    limitesActivos.inferior,
    colorWarning,
    colorMuted,
    colorBorder,
    unidad,
  ])

  // ── desglose: especie, ingrediente y cliente/sucursal ──
  // El color de cada especie se fija UNA vez con todos los datos (no los
  // filtrados): así filtrar no repinta las especies que quedan. Pasado el
  // 7.º color, todo va a "Otras" en gris -nunca un tono inventado-.
  const colorEspecie = useMemo(() => {
    const mapa = new Map<string, string>()
    solicitudesPor(observaciones, 'crop')
      .slice(0, 7)
      .forEach((e, i) => mapa.set(claveFiltro(e.valor), colorEspecieMarca(i) ?? colorMuted))
    return mapa
  }, [observaciones, colorMuted])

  const porEspecie = useMemo(() => {
    const lista = solicitudesPor(filtradas, 'crop')
    const conColor = lista.filter((e) => colorEspecie.has(claveFiltro(e.valor)))
    const otras = lista.filter((e) => !colorEspecie.has(claveFiltro(e.valor)))
    const nOtras = otras.reduce((s, e) => s + e.n, 0)
    return [
      ...conColor.map((e) => ({ ...e, color: colorEspecie.get(claveFiltro(e.valor)) as string, otras: false })),
      ...(nOtras > 0 ? [{ valor: 'Otras', n: nOtras, color: colorMuted, otras: true }] : []),
    ]
  }, [filtradas, colorEspecie, colorMuted])
  const totalEspecies = porEspecie.reduce((s, e) => s + e.n, 0)

  const promedioPorIngrediente = useMemo(() => {
    const grupos = new Map<string, number[]>()
    filtradas.forEach((o) => {
      if (o.ppm == null || !o.ingrediente) return
      const arr = grupos.get(o.ingrediente) ?? []
      arr.push(o.ppm)
      grupos.set(o.ingrediente, arr)
    })
    return [...grupos.entries()]
      .map(([codigo, vs]) => ({ codigo, promedio: vs.reduce((a, b) => a + b, 0) / vs.length, n: vs.length }))
      .sort((a, b) => b.promedio - a.promedio)
  }, [filtradas])

  const especieRef = useRef<HTMLCanvasElement>(null)
  const ingredienteRef = useRef<HTMLCanvasElement>(null)
  const especieChart = useRef<Chart | null>(null)
  const ingredienteChart = useRef<Chart | null>(null)
  const colorSuperficie = cssVar('--color-surface', '#ffffff')

  useEffect(() => {
    if (!especieRef.current) return
    especieChart.current?.destroy()
    especieChart.current = new Chart(especieRef.current, {
      type: 'doughnut',
      data: {
        labels: porEspecie.map((e) => e.valor),
        datasets: [
          {
            data: porEspecie.map((e) => e.n),
            backgroundColor: porEspecie.map((e) => e.color),
            // Separación de 2 px entre porciones, del color de la tarjeta.
            borderColor: colorSuperficie,
            borderWidth: 2,
            hoverOffset: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '66%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const n = Number(ctx.raw)
                const pct = totalEspecies ? (n / totalEspecies) * 100 : 0
                return `${ctx.label}: ${n.toLocaleString('es-CL')} informe${n === 1 ? '' : 's'} (${formatDecimalCL(pct, 1)}%)`
              },
            },
          },
        },
        onClick: (_evt, elements) => {
          const e = elements.length ? porEspecie[elements[0].index] : undefined
          if (e && !e.otras) cambiarCropRef.current(e.valor)
        },
      },
    })
    return () => especieChart.current?.destroy()
  }, [porEspecie, totalEspecies, colorSuperficie])

  useEffect(() => {
    if (!ingredienteRef.current) return
    ingredienteChart.current?.destroy()
    ingredienteChart.current = new Chart(ingredienteRef.current, {
      type: 'bar',
      data: {
        labels: promedioPorIngrediente.map((r) => r.codigo),
        datasets: [
          {
            label: `Promedio ${unidad}`,
            data: promedioPorIngrediente.map((r) => r.promedio),
            backgroundColor: promedioPorIngrediente.map((r) => colorDeIngrediente(r.codigo)),
            borderRadius: 4,
            borderSkipped: 'start',
            maxBarThickness: 22,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        // Clic en cualquier parte de la fila, no solo sobre la barra: una
        // barra corta sería casi imposible de atinar.
        interaction: { mode: 'nearest', axis: 'y', intersect: false },
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const r = promedioPorIngrediente[ctx.dataIndex]
                return `${formatDecimalCL(r.promedio, 3)} ${unidad} · ${r.n.toLocaleString('es-CL')} resultado${r.n === 1 ? '' : 's'}`
              },
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: colorBorder },
            ticks: { callback: (v) => formatDecimalCL(Number(v), 1), font: { size: 10 } },
          },
          y: { grid: { display: false }, ticks: { font: { size: 11, weight: 'bold' } } },
        },
        onClick: (_evt, elements) => {
          const r = elements.length ? promedioPorIngrediente[elements[0].index] : undefined
          if (r) setFiltros((prev) => ({ ...prev, ingredientes: [r.codigo] }))
        },
      },
    })
    return () => ingredienteChart.current?.destroy()
  }, [promedioPorIngrediente, unidad, colorBorder])

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

  // Los gráficos llaman a estos cambios desde sus propios efectos: se pasan
  // por ref para no recrear cada gráfico en cada render.
  useEffect(() => {
    cambiarCropRef.current = cambiarCrop
  })

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

  function alternarSimulacion() {
    // Los filtros de los datos reales no sirven para los simulados (y al
    // revés): se parte limpio en los dos sentidos.
    setFiltros(FILTROS_VACIOS)
    setDetalle(null)
    setSimulacion(simulando ? null : generarDatosSimulados(1000, Math.floor(Math.random() * 1e9)))
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

  // La BD completa de resultados: solo personal interno, y nunca sobre datos simulados.
  const puedeDescargarBd = !clienteFijo && !simulando && user.tipoAcceso !== 'cliente'

  async function bajarBd(acotada: boolean) {
    const chips = chipsDeFiltros(filtros, false)
    setDescargandoBd(true)
    try {
      const { blob, nombre } = await descargarBdExcel(pedidoBd(filtradas, filtros, acotada, describirFiltros(chips)))
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = nombre ?? 'BD_Laboratorio.xlsx'
      a.click()
      URL.revokeObjectURL(url)
      setAvisoBd(false)
    } catch {
      setErrorMsg('No se pudo generar el Excel de la BD.')
      setAvisoBd(false)
    } finally {
      setDescargandoBd(false)
    }
  }

  /** Sin filtros baja directo; con filtros avisa primero que no es el total. */
  function pedirBd() {
    if (nFiltros === 0) void bajarBd(false)
    else setAvisoBd(true)
  }

  function limpiarYBajarBdCompleta() {
    setFiltros(FILTROS_VACIOS)
    void bajarBd(false)
  }

  return (
    <div className={styles.wrap} style={wrapStyle}>
      <div className={styles.cabecera}>
        <Header
          title={vistaControl ? 'Vista por límite de control' : clienteFijo ? `Report · ${clienteFijo}` : 'Report'}
          description={
            vistaControl
              ? 'Límites dinámicos de control (promedio ± N desviaciones estándar) sobre los resultados de la base de datos.'
              : clienteFijo
                ? `Control de residuos de ${clienteFijo}: límites residuales desde la base de datos.`
                : 'Control de residuos: límites residuales desde la base de datos.'
          }
        />
        <div className={styles.accionesCabecera}>
          {clienteFijo && (
            <Button variant="secondary" onClick={descargarDatos} disabled={descargandoDatos}>
              {descargandoDatos ? 'Generando…' : '⬇ Descargar mi historial (Excel)'}
            </Button>
          )}
          {puedeDescargarBd && (
            <Button
              variant="secondary"
              onClick={pedirBd}
              disabled={descargandoBd || filas === null}
              title={
                nFiltros > 0
                  ? 'Descarga la BD de resultados en Excel. Hay filtros aplicados: se te avisará antes.'
                  : 'Descarga toda la BD de resultados en Excel.'
              }
            >
              {descargandoBd ? 'Generando…' : nFiltros > 0 ? '⬇ Descargar BD (filtrada)' : '⬇ Descargar BD'}
            </Button>
          )}
          {puedeSimular && (
            <Button
              variant="secondary"
              onClick={alternarSimulacion}
              aria-pressed={simulando}
              title="Muestra 1.000 resultados inventados para probar cómo se ve el reporte. No se guarda nada."
            >
              {simulando ? '✕ Salir de la simulación' : '🧪 Simular 1.000 datos'}
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

      {avisoBd && (
        <DescargaBdDialogo
          chips={chipsDeFiltros(filtros, false)}
          solicitudesFiltradas={registrosFiltrados}
          solicitudesTotales={totalVista}
          descargando={descargandoBd}
          onDescargarFiltrada={() => void bajarBd(true)}
          onLimpiarYDescargarCompleta={limpiarYBajarBdCompleta}
          onCerrar={() => setAvisoBd(false)}
        />
      )}

      {simulando && (
        <div className={styles.bannerSim} role="status">
          <span className={styles.bannerSimIcono} aria-hidden="true">🧪</span>
          <div>
            <b>Datos simulados — no son reales.</b>{' '}
            {simulacion.filas.length.toLocaleString('es-CL')} resultados de{' '}
            {simulacion.totalSolicitudes.toLocaleString('es-CL')} solicitudes inventadas, con clientes y límites
            ficticios. No se guardan en ningún lado: desaparecen al salir de Report, al recargar o al actualizar.
          </div>
          <button type="button" className={styles.bannerSimBoton} onClick={alternarSimulacion}>
            Volver a los datos reales
          </button>
        </div>
      )}

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
      ) : filasVista && filasVista.length === 0 ? (
        <Card className={styles.vacioCard}>
          <p className={styles.vacioTitulo}>Todavía no hay datos cargados en la base.</p>
          <p className={styles.vacioTexto}>Usa el módulo Ingest para cargar resultados de laboratorio; en cuanto haya datos, aparecerán aquí automáticamente.</p>
        </Card>
      ) : filasVista ? (
        <>
          {vistaControl && !esDiagnofruit && (
            <div className={styles.toolbar}>
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
            </div>
          )}

          <section className={styles.filtrosCard} aria-label="Filtros">
            <div className={styles.filtrosCabecera}>
              <span className={styles.filtrosTitulo}>
                Filtros
                {nFiltros > 0 && <span className={styles.filtrosContador}>{nFiltros}</span>}
              </span>
              <span className={styles.filtrosResumen}>
                {registrosFiltrados.toLocaleString('es-CL')} de {totalVista.toLocaleString('es-CL')} solicitudes
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
                valores={ingredientesActivos}
                onChange={(v) => setFiltros((prev) => ({ ...prev, ingredientes: v.length >= todosIngredientes.length ? [] : v }))}
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
                    <span className={styles.statSub}>de {totalVista.toLocaleString('es-CL')} en total</span>
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
              {vistaControl && (
                <p className={styles.nota}>
                  <span className={styles.notaIcono} aria-hidden="true">i</span>
                  {nota}
                </p>
              )}

              <div className={`${styles.statsResiduales} ${vistaControl ? styles.conLimites : ''}`}>
                <Kpi
                  destacado
                  tono={acento}
                  icono={<IconArchivoPlano />}
                  etiqueta="Informes de análisis"
                  sub={nFiltros > 0 ? `de ${totalVista.toLocaleString('es-CL')} en total` : 'sin filtros'}
                >
                  <span className={styles.statNum}>{registrosFiltrados.toLocaleString('es-CL')}</span>
                </Kpi>
                <Kpi
                  tono="#4a3aa7"
                  icono={<IconTrendingUp />}
                  etiqueta={
                    <>
                      Promedios por analito (<span className={styles.unidad}>{unidad}</span>)
                    </>
                  }
                >
                  {promedioPorIngrediente.length === 0 ? (
                    <span className={styles.statVacio}>Sin resultados numéricos para estos filtros</span>
                  ) : (
                    <ul className={styles.promedios}>
                      {promedioPorIngrediente.map((r) => (
                        <li key={r.codigo} style={{ '--analito': colorDeIngrediente(r.codigo) } as CSSProperties}>
                          <span className={styles.promedioNombre}>
                            <i aria-hidden="true" />
                            {r.codigo}
                          </span>
                          <b>{formatDecimalCL(r.promedio, 4)}</b>
                          <span className={styles.promedioN}>
                            {r.n.toLocaleString('es-CL')} resultado{r.n === 1 ? '' : 's'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Kpi>
                {vistaControl && (
                  <Kpi tono={colorWarning} icono={<IconAlerta />} etiqueta={`Límites de control (±${sigma}σ)`}>
                    <dl className={styles.limitesMini}>
                      <div><dt>Inf.</dt><dd>{formatDecimalCL(limitesActivos.inferior, 2)}</dd></div>
                      <div><dt>Central</dt><dd>{formatDecimalCL(limitesActivos.central, 2)}</dd></div>
                      <div><dt>Sup.</dt><dd>{formatDecimalCL(limitesActivos.superior, 2)}</dd></div>
                    </dl>
                  </Kpi>
                )}
              </div>

              <Card className={styles.panel}>
                <h3>
                  <span className={styles.h3Izq}>{tituloPrincipal}</span>
                  <span className={styles.hintClic}>clic en un punto para ver el informe</span>
                </h3>
                <div className={styles.chartboxGrande}>
                  <canvas ref={mainRef} />
                </div>
              </Card>

              <div className={styles.grid2Iguales}>
                <Card className={styles.panel}>
                  <h3>
                    Informes por especie
                    <span className={styles.hintClic}>clic para filtrar</span>
                  </h3>
                  {porEspecie.length === 0 ? (
                    <div className={styles.panelVacioChico}>Sin especie informada en estas solicitudes.</div>
                  ) : (
                    <div className={styles.especieCaja}>
                      <div className={styles.donutChica}>
                        <canvas ref={especieRef} aria-label="Informes por especie" role="img" />
                        <div className={styles.donutCentro}>
                          <b>{porEspecie.filter((e) => !e.otras).length}</b>
                          <span>especie{porEspecie.filter((e) => !e.otras).length === 1 ? '' : 's'}</span>
                        </div>
                      </div>
                      <ul className={styles.leyendaLista}>
                        {porEspecie.map((e) => (
                          <li key={e.valor}>
                            <button
                              type="button"
                              disabled={e.otras}
                              onClick={() => cambiarCrop(e.valor)}
                              className={mismoValor(filtros.crop, e.valor) ? styles.leyendaActiva : undefined}
                            >
                              <i style={{ background: e.color }} />
                              <span className={styles.leyendaNombre}>{e.valor}</span>
                              <b>{totalEspecies ? formatDecimalCL((e.n / totalEspecies) * 100, 0) : 0}%</b>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Card>
                <Card className={styles.panel}>
                  <h3>
                    <span>Promedio por ingrediente</span>
                    <span className={styles.hintClic}>clic para elegirlo</span>
                  </h3>
                  {promedioPorIngrediente.length === 0 ? (
                    <div className={styles.panelVacioChico}>Sin resultados numéricos para estos filtros.</div>
                  ) : (
                    <div className={styles.chartboxChico}>
                      <canvas ref={ingredienteRef} aria-label="Promedio por ingrediente activo" role="img" />
                    </div>
                  )}
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
