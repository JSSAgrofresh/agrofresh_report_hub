import { FiltrosPegajosos } from '@/components/layout/portal/FiltrosPegajosos'
import FueraDeRango from './FueraDeRango'
import { columnasPorLaboratorio, laboratoriosDeInformes } from '@/features/reportes/lib/graficoResiduales'
import { DonaFueraDeRango } from './DonaFueraDeRango'
import { InformesFueraDeRango } from './InformesFueraDeRango'
import { ResultadosPorCliente } from './ResultadosPorCliente'
import type { DatasetFranja } from '@/features/reportes/lib/resaltarFranja'
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
import { ACENTO_SOBRIO, TINTA_SOBRIA, esPaletaSobria } from '@/lib/paleta'
import { Card } from '@/components/ui/Card'
import { useAnchoMaximo } from '@/hooks/useAnchoMaximo'
import { InfoTip } from '@/components/ui/InfoTip'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { BuscableSelect } from '@/components/ui/BuscableSelect'
import { IconAlerta, IconArchivoPlano, IconTrendingUp } from '@/components/ui/icons'
import {
  alTocarBoton,
  bloquesVisibles,
  estadoBotonesResidual,
  labResidual,
  nombreLaboratorio,
  type LabResidual,
} from '@/features/reportes/lib/bloquesAnalisis'
import { construirInformes } from '@/features/reportes/lib/informesPorLab'
import { BotonesLabResidual, CabeceraSeccion, SeccionInformes } from './SeccionesReport'
import { Kpi } from './Kpi'
import { MultiSelectFiltro } from '@/components/ui/MultiSelectFiltro'
import { CalendarioRango } from '@/components/ui/CalendarioRango'
import type { RangoFechas } from '@/components/ui/CalendarioRango'
import { areaDeModulo } from '@/constants/areas'
import { useAuth } from '@/features/auth'
import { listarEspeciesActivas, listarValores } from '@/features/listados'
import type { ValorLista } from '@/features/listados'
import { HttpError } from '@/services/http/client'
import { formatDateCL, formatDecimalCL } from '@/lib/locale'
import { servicioDeFila } from '@/lib/servicio'
import {
  FILTROS_VACIOS,
  aplicarFiltros,
  calcularLimitesControl,
  claveFiltro,
  clientesDeSucursal,
  especiesDeVariedad,
  laboratorioTabular,
  colorDeIngrediente,
  colorEspecieMarca,
  contarFiltrosActivos,
  descargarBdExcel,
  describirFiltros,
  generarDatosSimulados,
  informesConPuntos,
  CAMPOS_MULTI,
  MULTI_VACIOS,
  chipsMulti,
  contarMulti,
  cumpleMulti,
  especieDeInforme,
  limitesDeEspecie,
  posicionResidual,
  resaltarFranja,
  tituloLimites,
  trazarCurvaSuave,
  listarAnalitos,
  solicitudesPor,
  listarLimites,
  mismoValor,
  obtenerDatosReporte,
  obtenerVistaReport,
  opcionesDe,
  ingredienteAplica,
  pedidoBd,
  informeFueraDeRango,
  proximaHoraProgramada,
  tituloGrafico,
  useActualizacionProgramada,
} from '@/features/reportes'
import type {
  CampoMulti,
  FiltrosMulti,
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
import { GraficosPorAnalito } from './GraficosPorAnalito'
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

/** Trazo de la curva de cada laboratorio (el primero continuo, los demás con distinto punteado). */
const TRAZOS_LABORATORIO: number[][] = [[], [7, 4], [2, 3], [10, 3, 2, 3]]
function trazoDeLaboratorio(posicion: number): number[] {
  return TRAZOS_LABORATORIO[Math.max(posicion, 0) % TRAZOS_LABORATORIO.length]
}

type Vista = 'residual' | 'control'
type Estado = 'cargando' | 'ok' | 'error'

type Filtros = FiltrosReporte

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function nombreMes(mes: string): string {
  return MESES[Number(mes) - 1] ?? mes
}

/** Texto de una opción de un desplegable nativo: solo el valor (sin contador). */
function textoOpcion(o: OpcionFiltro, etiqueta: (v: string) => string = (v) => v): string {
  return etiqueta(o.valor)
}

const ETIQUETAS_FILTRO: Record<keyof Filtros, string> = {
  laboratorio: 'Laboratorio',
  cliente: 'Sold To',
  planta: 'Ship To',
  tipoServicio: 'Servicio',
  servicio: 'Tipo de servicio',
  nroLinea: 'N° de línea',
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
            : campo === 'laboratorio'
              ? nombreLaboratorio(f.laboratorio)
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
 * `onCropChange`: usado por el portal de cliente (y el encabezado del admin)
 * para cambiar la imagen de fondo según la especie elegida en el filtro.
 * `onClienteChange`: el encabezado del admin muestra el Sold To filtrado.
 * `vistaControl`: la vista por límite de control es un gráfico INTERNO y vive
 * solo en el Panel de control interno, que monta este componente con esta bandera. Sin
 * ella -Report y portal de cliente- solo existe la vista por límite residual. */
export function ReporteView({
  clienteFijo,
  plantaFija,
  onCropChange,
  vistaControl = false,
  limitesTabla = false,
  filtrosMultiples = false,
  selectorModo,
  sinEncabezado = false,
  onClienteChange,
  onEspeciesChange,
}: {
  clienteFijo?: string
  plantaFija?: string
  onCropChange?: (crop: string) => void
  vistaControl?: boolean
  /** «Vista de límites» en modo Límites residuales: franjas FIJAS (tabla del laboratorio, por especie) y el recuadro de informes fuera de rango. */
  limitesTabla?: boolean
  /** Vista de límites: Laboratorio, Sold To, Ship To, Especie, Variedad, Semana y Mes admiten varios valores a la vez. */
  filtrosMultiples?: boolean
  /** El selector «Límites residuales / Límites de control»; va arriba de los filtros, a la izquierda. */
  selectorModo?: ReactNode
  /** La pantalla ya trae su propio encabezado: no se dibuja el título de Report. */
  sinEncabezado?: boolean
  onClienteChange?: (cliente: string) => void
  /** Las especies que tienen datos (del Sold To filtrado, si hay uno), de la más frecuente a la menos: el encabezado las rota. */
  onEspeciesChange?: (especies: string[]) => void
} = {}) {
  const { user } = useAuth()
  const acento = esPaletaSobria() ? ACENTO_SOBRIO : (areaDeModulo('reports')?.colorPrimario ?? '#6dad3c')
  const wrapStyle = { '--acento': acento } as CSSProperties

  const [filas, setFilas] = useState<FilaReporte[] | null>(null)
  const [soloFuera, setSoloFuera] = useState(false)
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
  // Filtros de varios valores (solo «Vista de límites»): vacío = todos.
  const [multi, setMulti] = useState<FiltrosMulti>(MULTI_VACIOS)
  // Especie y Variedad de los filtros salen de Listados -la fuente de verdad
  // oficial-, no de lo que ya haya cargado en el reporte: así el filtro
  // ofrece todo lo que existe de verdad, no solo lo que por casualidad ya
  // tiene datos hoy. Sold To/Ship To NO -ver comentario en `opciones`-.
  const [especiesOficiales, setEspeciesOficiales] = useState<ValorLista[]>([])
  const [variedadesOficiales, setVariedadesOficiales] = useState<string[]>([])
  const [modalAnalitos, setModalAnalitos] = useState(false)
  const [detalle, setDetalle] = useState<{ titulo: string; filas: Observacion[] } | null>(null)
  const [avisoBd, setAvisoBd] = useState(false)
  const [descargandoBd, setDescargandoBd] = useState(false)
  // Datos de prueba (solo admin): viven en este estado y en ningún otro lado.
  // Se pierden al salir de Report, al recargar y al actualizar -a propósito:
  // nunca pueden mezclarse con los reales-.
  const [simulacion, setSimulacion] = useState<DatosSimulados | null>(null)
  const cambiarCropRef = useRef<(v: string) => void>(() => {})
  // ¿Se muestran los gráficos de ALS y Diagnofruit? Lo enciende el administrador principal en Administración General →
  // Funciones; hasta que se sepa (o si falla la lectura), apagados: queda solo la tabla.
  const [graficosInformes, setGraficosInformes] = useState(false)
  useEffect(() => {
    let cancelado = false
    obtenerVistaReport()
      .then((v) => {
        if (!cancelado) setGraficosInformes(v.graficos_informes === true)
      })
      .catch(() => {})
    return () => {
      cancelado = true
    }
  }, [])

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
  // Las especies de la cuenta, para el carrusel del encabezado cuando no hay una elegida.
  const especiesDeLaCuenta = useMemo(() => {
    const cuentas = new Map<string, Set<number>>()
    for (const o of filasVista ?? []) {
      if (!o.especie || (filtros.cliente && o.cliente !== filtros.cliente)) continue
      const ids = cuentas.get(o.especie) ?? new Set<number>()
      ids.add(o.solicitud_id)
      cuentas.set(o.especie, ids)
    }
    return [...cuentas.entries()].sort((a, b) => b[1].size - a[1].size).map(([e]) => e)
  }, [filasVista, filtros.cliente])
  const clavesEspecies = especiesDeLaCuenta.join('|')
  useEffect(() => {
    onEspeciesChange?.(clavesEspecies ? clavesEspecies.split('|') : [])
  }, [clavesEspecies, onEspeciesChange])

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
        // El tipo de servicio real (Línea de proceso, Actimist, Ecofog o RYD): el `tipo_servicio` viejo («Cromatografía») ya no se usa.
        tipoServicio: servicioDeFila(f.servicio, f.tipo_aplicacion),
        servicio: servicioDeFila(f.servicio, f.tipo_aplicacion),
        nroLinea: (f.nro_linea ?? '').trim() || null,
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
    ): OpcionFiltro[] => {
      let base = aplicarFiltros(observaciones, filtros, campo)
      // Ingrediente Activo ofrece solo los analitos de residuos (los de ALS y Diagnofruit tienen sus propios bloques).
      if (campo === 'ingredientes') base = base.filter((o) => ingredienteAplica(o, filtros))
      if (!filtrosMultiples) return opcionesDe(base, campo, config)
      const propio = (CAMPOS_MULTI as readonly string[]).includes(campo) ? (campo as CampoMulti) : undefined
      return opcionesDe(base.filter((o) => cumpleMulti(o, multi, propio)), campo, config)
    }
    // En la vista de límites lo elegido son listas; en Report, un solo valor.
    const elegidos = (c: CampoMulti, escalar: string) => (filtrosMultiples ? multi[c] : [escalar])
    return {
      ingredientes: de('ingredientes', { seleccionados: filtros.ingredientes }),
      clientes: de('cliente', { seleccionados: elegidos('cliente', filtros.cliente) }),
      plantas: de('planta', { seleccionados: elegidos('planta', filtros.planta) }),
      lineas: de('nroLinea', { seleccionados: elegidos('nroLinea', filtros.nroLinea) }),
      servicios: de('servicio', { seleccionados: elegidos('servicio', filtros.servicio) }),
      tiposServicio: de('tipoServicio', { formatear: capitalizarPrimeraLetra, seleccionados: [filtros.tipoServicio] }),
      laboratorios: de('laboratorio', { formatear: capitalizarPrimeraLetra, seleccionados: elegidos('laboratorio', filtros.laboratorio) }),
      crops: de('crop', { canonicos: especiesOficiales.map((e) => e.valor), seleccionados: elegidos('crop', filtros.crop) }),
      variedades: de('variedad', { canonicos: variedadesOficiales, seleccionados: elegidos('variedad', filtros.variedad) }),
      semanas: de('semana', { orden: 'numero', seleccionados: elegidos('semana', filtros.semana) }),
      meses: de('mes', { orden: 'numero', seleccionados: elegidos('mes', filtros.mes) }),
    }
  }, [observaciones, filtros, multi, filtrosMultiples, especiesOficiales, variedadesOficiales])

  // Report normal: los resultados van en bloques por TIPO DE ANÁLISIS, siempre hacia abajo y en este orden: análisis de
  // residuos (AgroFresh y Quiteca), análisis FSMA (ALS) y análisis de fitopatología (Diagnofruit). Sin elegir laboratorio
  // se ven los tres; eligiendo uno, solo el suyo. La «Vista de límites» del Panel de control interno (vistaControl / limitesTabla)
  // sigue siendo un solo gráfico de residuos, y ahí ALS y Diagnofruit solo se ven eligiéndolos (tabla).
  const modoBloques = !vistaControl && !limitesTabla
  const bloques = bloquesVisibles(filtros.laboratorio)
  // Cada bloque lleva su número correlativo (1, 2, 3 hacia abajo) en la esquina de su cabecera.
  const numeroDeBloque = (b: 'residuales' | 'fsma' | 'fito') => {
    const visibles = (['residuales', 'fsma', 'fito'] as const).filter((x) => bloques[x])
    return visibles.length > 1 ? visibles.indexOf(b) + 1 : undefined
  }
  // Los botones «Laboratorio AgroFresh / Laboratorio Quiteca» del bloque de residuos.
  const [botonResidual, setBotonResidual] = useState<LabResidual | ''>('')
  const botonesResidual = estadoBotonesResidual(filtros.laboratorio, botonResidual)

  // Modo de la vista de límites: ALS o Diagnofruit se ven en tabla solo si es el único laboratorio elegido.
  const labTabular = useMemo(() => {
    if (modoBloques) return null
    const elegidos = filtrosMultiples ? multi.laboratorio : filtros.laboratorio ? [filtros.laboratorio] : []
    return elegidos.length === 1 ? laboratorioTabular(elegidos[0]) : null
  }, [modoBloques, filtrosMultiples, multi.laboratorio, filtros.laboratorio])

  // Todo lo que cumple los filtros, de cualquier laboratorio: es lo que baja la BD en Excel.
  const filtradasTodas = useMemo(() => {
    const base = aplicarFiltros(observaciones, filtros)
    return filtrosMultiples ? base.filter((o) => cumpleMulti(o, multi)) : base
  }, [observaciones, filtros, multi, filtrosMultiples])
  // Lo que alimenta los gráficos de residuos. En el modo por bloques, solo los laboratorios de residuos (y el botón que
  // esté elegido); ALS y Diagnofruit tienen su propio bloque.
  const filtradas = useMemo(() => {
    if (modoBloques) {
      return filtradasTodas.filter(
        (o) => laboratorioTabular(o.laboratorio) === null && (!botonesResidual.efectivo || labResidual(o.laboratorio) === botonesResidual.efectivo),
      )
    }
    return labTabular ? filtradasTodas : filtradasTodas.filter((o) => laboratorioTabular(o.laboratorio) === null)
  }, [filtradasTodas, labTabular, modoBloques, botonesResidual.efectivo])
  const nFiltros = contarFiltrosActivos(filtros) + (filtrosMultiples ? contarMulti(multi) : 0)

  // La especie filtrada arriba, si hay UNA: la dona de la Vista de límites pasa a ser por analito.
  const especieUnica = filtrosMultiples ? (multi.crop.length === 1 ? multi.crop[0] : null) : filtros.crop || null

  const registrosFiltrados = useMemo(() => new Set(filtradas.map((o) => o.solicitudId)).size, [filtradas])
  // Las solicitudes que cumplen los filtros, de todos los laboratorios: es lo que cuentan el resumen de los filtros y la
  // descarga de la BD (los indicadores de cada bloque cuentan solo lo suyo).
  const registrosEnFiltros = useMemo(
    () => (modoBloques ? new Set(filtradasTodas.map((o) => o.solicitudId)).size : registrosFiltrados),
    [modoBloques, filtradasTodas, registrosFiltrados],
  )

  // Los informes de ALS y de Diagnofruit con la forma de la tabla y los gráficos, y cuántos hay sin ningún filtro.
  // ALS no informa especie ni variedad: esos dos filtros no se le aplican (si no, elegir una Especie vaciaría FSMA).
  const filtradasParaAls = useMemo(() => {
    const base = aplicarFiltros(observaciones, { ...filtros, crop: '', variedad: '' })
    return filtrosMultiples ? base.filter((o) => cumpleMulti(o, { ...multi, crop: [], variedad: [] })) : base
  }, [observaciones, filtros, multi, filtrosMultiples])
  const informesAls = useMemo(() => construirInformes(filtradasParaAls, 'als', analitosVista), [filtradasParaAls, analitosVista])
  const informesFito = useMemo(() => construirInformes(filtradasTodas, 'diagnofruit', analitosVista), [filtradasTodas, analitosVista])
  const informesSinFiltros = useMemo(() => {
    const ids = { als: new Set<number>(), diagnofruit: new Set<number>() }
    observaciones.forEach((o) => {
      const lab = laboratorioTabular(o.laboratorio)
      if (lab && o.ingrediente) ids[lab].add(o.solicitudId)
    })
    return { als: ids.als.size, diagnofruit: ids.diagnofruit.size }
  }, [observaciones])
  const esTabular = labTabular !== null

  function tocarBotonResidual(lab: LabResidual) {
    const r = alTocarBoton(lab, filtros.laboratorio, botonResidual)
    setBotonResidual(r.botonElegido)
    if (r.quitarFiltroLaboratorio) actualizarFiltro('laboratorio', '')
  }

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
  // Modo «Límites residuales» de la Vista de límites: las franjas salen de la tabla fija, según la especie elegida.
  // Franjas del gráfico grande: solo con UNA especie elegida (cada especie tiene las suyas). La evaluación de «fuera de rango»
  // no las necesita: juzga cada informe con los límites de su propia especie.
  const limitesDeTabla = useMemo(
    () => (limitesTabla && multi.crop.length === 1 ? limitesDeEspecie(multi.crop[0]) : null),
    [limitesTabla, multi.crop],
  )
  const unidad = analitoSeleccionado?.unidad ?? 'ppm'

  const nota = `Límites dinámicos: promedio ± ${sigma} × desviación estándar de las ${valores.length.toLocaleString('es-CL')} observación(es) filtradas.`

  // ── gráficos ──
  const mainRef = useRef<HTMLCanvasElement>(null)
  const mainChart = useRef<Chart | null>(null)
  // En el teléfono el gráfico grande lleva puntos más chicos y menos fechas en el eje.
  const angostoGrafico = useAnchoMaximo(640)
  const analitoResaltado = useRef<string | null>(null)

  const colorDanger = cssVar('--color-danger', '#b0271f')
  const colorWarning = cssVar('--color-warning', '#b4531f')
  const colorMuted = cssVar('--color-text-faint', '#77837b')
  const colorBorder = cssVar('--color-border', '#e1e5dc')
  const colorSuperficie = cssVar('--color-surface', '#ffffff')
  const colorTexto = cssVar('--color-text', '#1b2a20')

  const coloresGraficos = useMemo(
    () => ({ borde: colorBorder, superficie: colorSuperficie, texto: colorTexto, suave: colorMuted, peligro: colorDanger }),
    [colorBorder, colorSuperficie, colorTexto, colorMuted, colorDanger],
  )

  // Gráfico central: una columna por informe (la fecha se repite tantas veces
  // como informes haya ese día) y sus analitos uno sobre otro según el ppm,
  // cada uno con su color. Nunca se promedia.
  const informesTodos = useMemo(() => informesConPuntos(filtradas), [filtradas])
  // «Solo fuera de rango» (Límites residuales): el gráfico deja solo los informes con algún analito fuera de su franja.
  const informes = useMemo(
    () => (limitesTabla && soloFuera ? informesTodos.filter(informeFueraDeRango) : informesTodos),
    [informesTodos, limitesTabla, soloFuera],
  )
  const analitosGraficados = useMemo(
    () => [...new Set(informes.flatMap((i) => i.puntos.map((p) => p.ingrediente as string)))].sort((a, b) => a.localeCompare(b, 'es')),
    [informes],
  )
  const laboratoriosGraficados = useMemo(() => laboratoriosDeInformes(informes), [informes])
  const tituloPrincipal = filtrosMultiples
    ? tituloLimites(vistaControl ? 'Límites de control' : 'Límites residuales', multi, filtros.ingredientes, nombreMes)
    : tituloGrafico(filtros, !clienteFijo, vistaControl ? 'Límites de control' : 'Residuales', analitosGraficados)

  useEffect(() => {
    if (!mainRef.current) return
    const etiquetas = informes.map((i) => (i.fecha ? formatDateCL(i.fecha) : 'Sin fecha'))
    const nAnalitos = analitosGraficados.length
    // Cada columna (informe) lleva SU fecha en el eje, aunque se repita en el mismo día.
    // Las primeras columnas de cada fecha además marcan su inicio con una línea de fondo muy suave.
    const inicioDeFecha = etiquetas.map((e, i) => i === 0 || e !== etiquetas[i - 1])

    const datasets: ChartDataset<'line', (number | null)[]>[] = analitosGraficados.map((ingrediente) => {
      const color = colorDeIngrediente(ingrediente)
      return {
        label: ingrediente,
        data: informes.map((i) => i.puntos.find((p) => p.ingrediente === ingrediente)?.ppm ?? null),
        borderColor: color,
        backgroundColor: color,
        borderWidth: 0,
        showLine: false,
        // Grandes y con un aro del color de la tarjeta: se leen bien aunque se
        // solapen, y se distingue a qué columna (fecha) pertenece cada uno.
        pointRadius: angostoGrafico ? 4 : esPaletaSobria() ? 5 : 7,
        pointHoverRadius: angostoGrafico ? 7 : esPaletaSobria() ? 8 : 10,
        pointHitRadius: 10,
        pointBackgroundColor: color,
        // Fuera de su franja (solo en la Vista de límites con tabla): aro rojo.
        pointBorderColor: informes.map((i) => {
          const p = i.puntos.find((x) => x.ingrediente === ingrediente)
          return limitesTabla && p?.ppm != null && (posicionResidual(ingrediente, p.ppm, limitesDeEspecie(p.crop) ?? {}) ?? 'dentro') !== 'dentro' ? colorDanger : colorSuperficie
        }),
        pointBorderWidth: informes.map((i) => {
          const p = i.puntos.find((x) => x.ingrediente === ingrediente)
          return limitesTabla && p?.ppm != null && (posicionResidual(ingrediente, p.ppm, limitesDeEspecie(p.crop) ?? {}) ?? 'dentro') !== 'dentro' ? 3.5 : esPaletaSobria() ? 1.5 : 2
        }),
        pointHoverBackgroundColor: color,
        pointHoverBorderColor: colorSuperficie,
        pointHoverBorderWidth: 2.5,
      }
    })

    // Franjas fijas de la tabla: una pareja de líneas (mín y máx) por analito, de su mismo color.
    if (limitesDeTabla) {
      analitosGraficados.forEach((ingrediente) => {
        const r = limitesDeTabla[ingrediente]
        if (!r) return
        ;([['mín', r.min], ['máx', r.max]] as const).forEach(([lado, valor]) =>
          datasets.push({
            label: `${ingrediente} ${lado}`,
            data: informes.map(() => valor),
            borderColor: `${colorDeIngrediente(ingrediente)}99`,
            borderDash: [6, 4],
            borderWidth: 1.4,
            pointRadius: 0,
            pointHitRadius: 0,
          }),
        )
      })
    }

    // Las líneas de límite solo tienen sentido con un único analito (residual)
    // o en la vista por límite de control, que es global.
    if (vistaControl || (nAnalitos === 1 && !limitesTabla)) {
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

    // Una curva tenue por analito, del mismo color que sus puntos, que une sus
    // resultados de un informe al siguiente en orden de fecha (se salta los
    // informes donde ese analito no vino). Si hay más de un laboratorio, el mismo
    // analito lleva UNA CURVA POR LABORATORIO (mismo color, trazo distinto) para
    // compararlos. Va DEBAJO de los puntos y de los conectores, para que se lea la
    // tendencia sin tapar ningún dato. Es una curva monótona: pasa por cada punto
    // y nunca se sale de los valores.
    const lineasPorAnalito: Plugin<'line'> = {
      id: 'lineasPorAnalito',
      beforeDatasetsDraw(chart) {
        const { ctx } = chart
        ctx.save()
        ctx.globalAlpha = 0.4
        ctx.lineWidth = 1.5
        ctx.lineJoin = 'round'
        for (let di = 0; di < nAnalitos; di++) {
          if (!chart.isDatasetVisible(di)) continue
          const meta = chart.getDatasetMeta(di).data
          ctx.strokeStyle = colorDeIngrediente(analitosGraficados[di])
          columnasPorLaboratorio(informes, analitosGraficados[di]).forEach((columnas, lab) => {
            const puntos = columnas.map((c) => meta[c]).filter(Boolean)
            if (puntos.length < 2) return
            ctx.setLineDash(trazoDeLaboratorio(laboratoriosGraficados.indexOf(lab)))
            ctx.beginPath()
            trazarCurvaSuave(ctx, puntos)
            ctx.stroke()
          })
        }
        ctx.restore()
      },
    }

    // Línea guía: cruza el gráfico de arriba abajo por la columna (informe) que
    // está bajo el mouse, para saber con certeza a qué fecha pertenece cada punto.
    // Va debajo de los puntos.
    const lineaGuia: Plugin<'line'> = {
      id: 'lineaGuia',
      beforeDatasetsDraw(chart) {
        const activo = chart.tooltip?.getActiveElements()?.[0]
        if (!activo) return
        const { ctx, chartArea } = chart
        ctx.save()
        ctx.beginPath()
        ctx.moveTo(activo.element.x, chartArea.top)
        ctx.lineTo(activo.element.x, chartArea.bottom)
        ctx.lineWidth = 1.5
        ctx.strokeStyle = colorMuted
        ctx.globalAlpha = 0.7
        ctx.stroke()
        ctx.restore()
      },
      // La fecha de la columna, en una etiqueta arriba de la guía.
      afterDatasetsDraw(chart) {
        const activo = chart.tooltip?.getActiveElements()?.[0]
        const texto = activo ? etiquetas[activo.index] : null
        if (!activo || !texto) return
        const { ctx, chartArea } = chart
        ctx.save()
        ctx.font = '600 11px sans-serif'
        const ancho = ctx.measureText(texto).width + 14
        const x = Math.min(Math.max(activo.element.x - ancho / 2, chartArea.left), chartArea.right - ancho)
        const y = chartArea.top + 4
        ctx.fillStyle = colorSuperficie
        ctx.strokeStyle = colorMuted
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.roundRect(x, y, ancho, 20, 6)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = colorTexto
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(texto, x + ancho / 2, y + 10.5)
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
      plugins: [lineaGuia, lineasPorAnalito, conectores],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        // Por columna: basta pasar el mouse cerca para ver la guía y todos los analitos del informe.
        interaction: { mode: 'index', intersect: false },
        // Con franjas fijas: al pasar sobre un punto se resaltan mucho las líneas de límite de SU analito y se apagan las demás.
        onHover: (evt, _elementos, chart) => {
          if (!limitesTabla) return
          const punto = chart
            .getElementsAtEventForMode(evt as unknown as Event, 'nearest', { intersect: true }, true)
            .find((h) => h.datasetIndex < nAnalitos)
          const analito = punto ? analitosGraficados[punto.datasetIndex] : null
          if (analito === analitoResaltado.current) return
          analitoResaltado.current = analito
          resaltarFranja(chart.data.datasets as unknown as DatasetFranja[], nAnalitos, analito, colorDeIngrediente)
          chart.update('none')
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 10,
              usePointStyle: true,
              font: { size: 11 },
              // El marcador toma el borde del PRIMER punto del analito: si ese punto está fuera de rango (aro rojo),
              // la leyenda mostraba el analito con un aro rojo. Aquí va siempre limpio, del color del analito.
              generateLabels: (chart) =>
                Chart.defaults.plugins.legend.labels.generateLabels(chart).map((l) => ({ ...l, strokeStyle: l.fillStyle, lineWidth: 0 })),
              // Una línea de límite sin valor no dibuja nada: tampoco va en la leyenda.
              filter: (item, data) =>
                (data.datasets[item.datasetIndex ?? 0]?.data ?? []).some((v) => v != null) &&
                // Las franjas fijas (dos líneas por analito) no van en la leyenda: llevan el color de su analito.
                !(limitesTabla && (item.datasetIndex ?? 0) >= nAnalitos),
            },
          },
          tooltip: {
            filter: (item: TooltipItem<'line'>) => item.raw != null && item.datasetIndex < nAnalitos,
            // Más opaco y separado de los puntos: no esconde ni deja ver las curvas de atrás.
            backgroundColor: 'rgba(28, 36, 32, 0.94)',
            caretPadding: 14,
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
          // Fechas en vertical y TODAS (sin saltarse ninguna): una etiqueta por día.
          x: {
            ticks: {
              // Fechas en vertical y todas, salvo en el teléfono: con decenas de informes no caben y se pisan.
              autoSkip: angostoGrafico,
              maxTicksLimit: angostoGrafico ? 8 : undefined,
              font: { size: 10 },
              maxRotation: 90,
              minRotation: 90,
              callback: (_valor, i) => etiquetas[i],
            },
            grid: {
              display: true,
              color: (c) => (inicioDeFecha[c.index] ? colorBorder : 'transparent'),
            },
          },
          y: {
            beginAtZero: true,
            grid: { color: colorBorder },
            ticks: { callback: (v) => formatDecimalCL(Number(v), 2) },
            title: { display: true, text: unidad, font: { size: 11 }, color: colorMuted },
          },
        },
        onClick: (evt, _elements, chart) => {
          // La interacción es por columna, pero el informe se abre solo al hacer clic sobre un punto.
          const sobrePunto = chart.getElementsAtEventForMode(evt as unknown as Event, 'nearest', { intersect: true }, true)
          if (!sobrePunto.length) return
          const { datasetIndex, index } = sobrePunto[0]
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
    laboratoriosGraficados,
    vistaControl,
    limitesTabla,
    limitesDeTabla,
    colorDanger,
    limitesActivos.superior,
    limitesActivos.central,
    limitesActivos.inferior,
    colorWarning,
    angostoGrafico,
    colorMuted,
    colorBorder,
    colorSuperficie,
    colorTexto,
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
    if (filtrosMultiples && rango) setMulti((prev) => ({ ...prev, semana: [], mes: [] }))
  }

  // Filtros de varios valores. Semana/Mes y el calendario siguen siendo excluyentes.
  function cambiarMulti(campo: CampoMulti, valores: string[]) {
    setMulti((prev) => ({ ...prev, [campo]: valores }))
    if ((campo === 'semana' || campo === 'mes') && valores.length > 0) setFiltros((prev) => ({ ...prev, rango: null }))
  }

  /** Vista de límites, al abrir un informe: un gráfico por cada analito de ESE informe, solo con sus propios resultados
   * (nada de otros informes) contra la franja de su especie. */
  function graficosDelDetalle(): ReactNode {
    if (!limitesTabla || !detalle) return undefined
    const ids = new Set(detalle.filas.map((o) => o.solicitudId))
    const [unico] = ids
    const inf = ids.size === 1 ? informes.find((i) => i.solicitudId === unico) : undefined
    if (!inf) return undefined
    const especie = especieDeInforme(inf)
    const analitosDelInforme = [...new Set(inf.puntos.map((p) => p.ingrediente as string))].sort((a, b) => a.localeCompare(b, 'es'))
    return (
      <GraficosPorAnalito
        informes={[inf]}
        analitos={analitosDelInforme}
        limites={limitesDeEspecie(especie)}
        unidad={unidad}
        colores={coloresGraficos}
        destacado={inf.solicitudId}
        titulo={`Resultados de este informe por analito${especie ? ` · ${especie}` : ''}`}
        onAbrir={(otro) => setDetalle({ titulo: `${otro.nroSolicitud} · ${otro.fecha ? formatDateCL(otro.fecha) : 'Sin fecha'}`, filas: otro.puntos })}
      />
    )
  }

  const formatosMulti = { mes: nombreMes, semana: (v: string) => `Semana ${v}` }

  function limpiarTodosLosFiltros() {
    setFiltros(FILTROS_VACIOS)
    setMulti(MULTI_VACIOS)
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
    if (filtrosMultiples) {
      setMulti((prev) => ({ ...prev, crop: valor ? [valor] : [] }))
      return
    }
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

  function cambiarVariedad(valor: string) {
    setFiltros((prev) => {
      // Elegir una variedad sin especie completa la especie si la variedad es de una sola.
      const especies = valor && !prev.crop ? especiesDeVariedad(observaciones, valor) : []
      return { ...prev, variedad: valor, crop: especies.length === 1 ? especies[0] : prev.crop }
    })
  }

  function quitarFiltro(campo: keyof Filtros) {
    if (campo === 'cliente') cambiarCliente('')
    else if (campo === 'crop') cambiarCrop('')
    else setFiltros((prev) => ({ ...prev, [campo]: FILTROS_VACIOS[campo] }))
  }

  function alternarSimulacion() {
    // Los filtros de los datos reales no sirven para los simulados (y al
    // revés): se parte limpio en los dos sentidos.
    limpiarTodosLosFiltros()
    setDetalle(null)
    setSimulacion(simulando ? null : generarDatosSimulados(1000, Math.floor(Math.random() * 1e9)))
  }

  // La BD en Excel: personal interno y cuentas de cliente (el servidor acota la del cliente a su Sold To / Ship To y le
  // saca las columnas internas), nunca sobre datos simulados.
  const esCuentaCliente = Boolean(clienteFijo) || user.tipoAcceso === 'cliente' || user.tipoAcceso === 'comercial'
  const puedeBajarBd = !simulando
  // Los gráficos por analito de la ficha del informe (vista de límites) siguen siendo solo del personal; el cliente abre
  // la misma ficha, con su PDF, pero sin límites ni datos internos (el servidor ya se los quita).
  const puedeDescargarBd = !esCuentaCliente && !simulando

  async function bajarBd(acotada: boolean) {
    const chips = [...chipsDeFiltros(filtros, false), ...(filtrosMultiples ? chipsMulti(multi, formatosMulti) : [])]
    setDescargandoBd(true)
    try {
      const { blob, nombre } = await descargarBdExcel(pedidoBd(filtradasTodas, filtros, acotada, describirFiltros(chips)))
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
    limpiarTodosLosFiltros()
    void bajarBd(false)
  }

  return (
    <div className={styles.wrap} style={wrapStyle}>
      <div className={styles.cabecera}>
        {!sinEncabezado && <Header
          title={vistaControl ? 'Vista por límite de control' : clienteFijo ? `Report · ${clienteFijo}` : 'Report'}
          description={
            vistaControl
              ? 'Límites dinámicos de control (promedio ± N desviaciones estándar) sobre los resultados de la base de datos.'
              : clienteFijo
                ? `Control de residuos de ${clienteFijo}: límites residuales desde la base de datos.`
                : 'Control de residuos: límites residuales desde la base de datos.'
          }
        />}
        <div className={styles.accionesCabecera}>
          {puedeBajarBd && (
            <Button
              variant="secondary"
              onClick={pedirBd}
              disabled={descargandoBd || filas === null}
              title={
                nFiltros > 0
                  ? 'Descarga la BD de resultados en Excel. Hay filtros aplicados: se te avisará antes.'
                  : esCuentaCliente
                    ? 'Descarga todos tus resultados en Excel.'
                    : 'Descarga toda la BD de resultados en Excel.'
              }
            >
              {descargandoBd ? 'Generando…' : esCuentaCliente ? (nFiltros > 0 ? '⬇ Descargar mi Excel (filtrado)' : '⬇ Descargar mi Excel') : nFiltros > 0 ? '⬇ Descargar BD (filtrada)' : '⬇ Descargar BD'}
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
          chips={[...chipsDeFiltros(filtros, false), ...(filtrosMultiples ? chipsMulti(multi, formatosMulti).map((c) => ({ ...c, campo: c.campo as keyof Filtros })) : [])]}
          solicitudesFiltradas={registrosEnFiltros}
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
          {(selectorModo || (vistaControl && !esTabular)) && (
            <div className={styles.toolbar}>
              {selectorModo}
              {vistaControl && !esTabular && (
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

          <FiltrosPegajosos className={styles.filtrosCard}>
            <div className={styles.filtrosCabecera}>
              <span className={styles.filtrosTitulo}>
                Filtros
                {nFiltros > 0 && <span className={styles.filtrosContador}>{nFiltros}</span>}
              </span>
              <span className={styles.filtrosResumen}>
                {registrosEnFiltros.toLocaleString('es-CL')} de {totalVista.toLocaleString('es-CL')} solicitudes
              </span>
              {nFiltros > 0 && (
                <button className={styles.limpiar} onClick={limpiarTodosLosFiltros}>
                  Limpiar filtros
                </button>
              )}
            </div>

            <p className={styles.grupoFiltros}>
              Generales <InfoTip>Valen para todos los análisis.</InfoTip>
            </p>
            <div className={styles.filtros}>
              {/* Filtros principales primero: Laboratorio, Sold To, Ship To, Especie —
                  son los que definen qué tipo de reporte/límites corresponde mostrar. El resto va después.
                  Cada opción lleva entre paréntesis cuántas solicitudes trae con los demás filtros puestos. */}
              {filtrosMultiples ? (
                <MultiSelectFiltro
                  etiqueta="Laboratorio"
                  opciones={opciones.laboratorios.map((o) => o.valor)}
                  valores={multi.laboratorio}
                  onChange={(v) => cambiarMulti('laboratorio', v)}
                />
              ) : (
                <label className={styles.filtro}>
                  <span>Laboratorio</span>
                  <select value={filtros.laboratorio} onChange={(e) => actualizarFiltro('laboratorio', e.target.value)}>
                    <option value="">Todos</option>
                    {opciones.laboratorios.map((o) => (
                      <option key={o.valor} value={o.valor}>{textoOpcion(o, nombreLaboratorio)}</option>
                    ))}
                  </select>
                </label>
              )}
              {/* Para cuentas de cliente (clienteFijo) los datos ya vienen acotados desde
                  el backend a ese Sold To/Ship To: mostrar estos dos filtros no aportaría
                  nada (siempre habría un solo valor posible) y solo confundiría. Se
                  mantienen para admin general/admin de área, que sí navegan entre clientes. */}
              {!clienteFijo && filtrosMultiples && (
                <>
                  <MultiSelectFiltro
                    etiqueta="Cliente (Sold To)"
                    opciones={opciones.clientes.map((o) => o.valor)}
                    valores={multi.cliente}
                    onChange={(v) => cambiarMulti('cliente', v)}
                  />
                  <MultiSelectFiltro
                    etiqueta="Sucursal (Ship To)"
                    opciones={opciones.plantas.map((o) => o.valor)}
                    valores={multi.planta}
                    onChange={(v) => cambiarMulti('planta', v)}
                  />
                </>
              )}
              {!clienteFijo && !filtrosMultiples && (
                <>
                  <BuscableSelect
                    etiqueta="Cliente (Sold To)"
                    opciones={opciones.clientes.map((o) => o.valor)}
                    valor={filtros.cliente}
                    onChange={cambiarCliente}
                  />
                  <BuscableSelect
                    etiqueta="Sucursal (Ship To)"
                    opciones={opciones.plantas.map((o) => o.valor)}
                    valor={filtros.planta}
                    onChange={cambiarPlanta}
                  />
                </>
              )}
              {/* «Tipo de servicio» = Línea de proceso, Actimist, Ecofog o RYD (`servicioDeFila`). Es distinto del campo viejo
                  `tipo_servicio` («Cromatografía»), que no se ofrece. */}
              {filtrosMultiples ? (
                <MultiSelectFiltro
                  etiqueta="Tipo de servicio"
                  opciones={opciones.servicios.map((o) => o.valor)}
                  valores={multi.servicio}
                  onChange={(v) => cambiarMulti('servicio', v)}
                />
              ) : (
                <label className={styles.filtro}>
                  <span>Tipo de servicio</span>
                  <select value={filtros.servicio} onChange={(e) => actualizarFiltro('servicio', e.target.value)}>
                    <option value="">Todos</option>
                    {opciones.servicios.map((o) => (
                      <option key={o.valor} value={o.valor}>{textoOpcion(o)}</option>
                    ))}
                  </select>
                </label>
              )}
              {filtrosMultiples ? (
                <MultiSelectFiltro
                  etiqueta="N° de línea"
                  opciones={opciones.lineas.map((o) => o.valor)}
                  valores={multi.nroLinea}
                  onChange={(v) => cambiarMulti('nroLinea', v)}
                />
              ) : (
                <label className={styles.filtro}>
                  <span>N° de línea</span>
                  <select value={filtros.nroLinea} onChange={(e) => actualizarFiltro('nroLinea', e.target.value)}>
                    <option value="">Todas</option>
                    {opciones.lineas.map((o) => (
                      <option key={o.valor} value={o.valor}>{textoOpcion(o)}</option>
                    ))}
                  </select>
                </label>
              )}
              {filtrosMultiples ? (
                <>
                  <MultiSelectFiltro
                    etiqueta="Semana"
                    opciones={opciones.semanas.map((o) => o.valor)}
                    valores={multi.semana}
                    onChange={(v) => cambiarMulti('semana', v)}
                    formatear={formatosMulti.semana}
                  />
                  <MultiSelectFiltro
                    etiqueta="Mes"
                    opciones={opciones.meses.map((o) => o.valor)}
                    valores={multi.mes}
                    onChange={(v) => cambiarMulti('mes', v)}
                    formatear={formatosMulti.mes}
                  />
                </>
              ) : (
                <>
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
                </>
              )}
              <CalendarioRango etiqueta="Rango de fechas" valor={filtros.rango} onChange={aplicarRango} />
            </div>

            {/* Filtros que no valen para todos los análisis: Especie y Variedad no aplican a FSMA (ALS no las informa) e
                Ingrediente Activo es solo de residuos. Cada análisis trae además sus propios filtros bajo su cabecera. */}
            <p className={styles.grupoFiltros}>
              Específicos <InfoTip>Especie y variedad: residuos y fitopatología. Ingrediente activo: solo residuos.</InfoTip>
            </p>
            <div className={styles.filtros}>
              {filtrosMultiples ? (
                <>
                  <MultiSelectFiltro
                    etiqueta="Especie"
                    opciones={opciones.crops.map((o) => o.valor)}
                    valores={multi.crop}
                    onChange={(v) => cambiarMulti('crop', v)}
                  />
                  <MultiSelectFiltro
                    etiqueta="Variedad"
                    opciones={opciones.variedades.map((o) => o.valor)}
                    valores={multi.variedad}
                    onChange={(v) => cambiarMulti('variedad', v)}
                  />
                </>
              ) : (
                <>
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
                    <select value={filtros.variedad} onChange={(e) => cambiarVariedad(e.target.value)}>
                      <option value="">Todas</option>
                      {opciones.variedades.map((o) => (
                        <option key={o.valor} value={o.valor}>{textoOpcion(o)}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}

              <MultiSelectFiltro
                etiqueta="Ingrediente Activo"
                opciones={opciones.ingredientes.map((o) => o.valor)}
                valores={ingredientesActivos}
                onChange={(v) => setFiltros((prev) => ({ ...prev, ingredientes: v.length >= todosIngredientes.length ? [] : v }))}
                colorDe={colorDeIngrediente}
              />
            </div>

            {nFiltros > 0 && (
              <div className={styles.chips} aria-label="Filtros aplicados">
                {[
                  ...chipsDeFiltros(filtros, Boolean(clienteFijo)).map((c) => ({ ...c, quitar: () => quitarFiltro(c.campo) })),
                  ...(filtrosMultiples ? chipsMulti(multi, formatosMulti).map((c) => ({ ...c, quitar: () => cambiarMulti(c.campo, []) })) : []),
                ].map((chip) => (
                  <button
                    key={chip.campo}
                    type="button"
                    className={styles.chip}
                    onClick={chip.quitar}
                    title={`Quitar filtro ${chip.etiqueta}`}
                  >
                    <span className={styles.chipEtiqueta}>{chip.etiqueta}:</span> {chip.valor}
                    <span className={styles.chipX} aria-hidden="true">×</span>
                  </button>
                ))}
              </div>
            )}
          </FiltrosPegajosos>

          {esTabular ? (
            <SeccionInformes
              bloque={labTabular === 'als' ? 'fsma' : 'fito'}
              informes={labTabular === 'als' ? informesAls : informesFito}
              totalSinFiltros={labTabular === 'als' ? informesSinFiltros.als : informesSinFiltros.diagnofruit}
              conFiltros={nFiltros > 0}
              conGraficos={graficosInformes}
              acento={acento}
            />
          ) : (
            <>
              {modoBloques && bloques.residuales && (
                <CabeceraSeccion bloque="residuales" numero={numeroDeBloque('residuales')} acento={acento} laboratorios={`${nombreLaboratorio('agrofresh')} · ${nombreLaboratorio('quiteca')}`}>
                  <BotonesLabResidual
                    efectivo={botonesResidual.efectivo}
                    fijadoPorFiltro={botonesResidual.fijadoPorFiltro}
                    acento={acento}
                    onTocar={tocarBotonResidual}
                  />
                </CabeceraSeccion>
              )}
              {(!modoBloques || bloques.residuales) && (
            <>
              {vistaControl && (
                <p className={styles.nota}>
                  <InfoTip>{nota}</InfoTip>
                </p>
              )}
              {limitesTabla && (
                <p className={styles.nota}>
                  <InfoTip>{limitesDeTabla
                    ? `Franjas fijas tomadas de la tabla de límites residuales para ${multi.crop[0]}. No se recalculan con los datos.`
                    : 'Las franjas del gráfico se dibujan al elegir UNA especie. El recuadro «Informes fuera de rango» no la necesita: evalúa cada informe con los límites de su propia especie.'}</InfoTip>
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
                  tono={esPaletaSobria() ? TINTA_SOBRIA : '#4a3aa7'}
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
                          <b>{formatDecimalCL(r.promedio, 2)}</b>
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

              {limitesTabla && <InformesFueraDeRango informes={informesTodos} />}

              <Card className={styles.panel}>
                <h3>
                  <span className={styles.h3Izq}>{tituloPrincipal}</span>
                  <span className={styles.hintClic}>clic en un punto para ver el informe</span>
                  {limitesTabla && (
                    <button
                      type="button"
                      className={`${styles.soloFuera} ${soloFuera ? styles.soloFueraOn : ''}`}
                      aria-pressed={soloFuera}
                      onClick={() => setSoloFuera((v) => !v)}
                    >
                      Solo fuera de rango
                    </button>
                  )}
                </h3>
                <div className={styles.chartboxGrande}>
                  <canvas ref={mainRef} />
                </div>
                {laboratoriosGraficados.length > 1 && (
                  <p className={styles.leyendaLabs} aria-label="Curvas por laboratorio">
                    Curvas por laboratorio:
                    {laboratoriosGraficados.map((lab, i) => (
                      <span key={lab} className={styles.leyendaLab}>
                        <svg width="30" height="8" aria-hidden="true">
                          <line x1="0" y1="4" x2="30" y2="4" stroke="currentColor" strokeWidth="2" strokeDasharray={trazoDeLaboratorio(i).join(' ') || undefined} />
                        </svg>
                        {lab}
                      </span>
                    ))}
                  </p>
                )}
              </Card>

              {vistaControl && !esTabular && (
                <FueraDeRango observaciones={filtradas} analitos={analitosVista} limites={limitesVista} sigma={sigma} />
              )}

              {limitesTabla ? (
                <div className={styles.grid1a3}>
                  <Card className={styles.panel}>
                    <h3>
                      <span>{especieUnica ? `Por analito · ${especieUnica}` : 'Por especie'}</span>
                      <span className={styles.hintClic}>{soloFuera ? 'solo fuera de rango' : 'fuerte = fuera · tenue = dentro'}</span>
                    </h3>
                    <DonaFueraDeRango informes={informesTodos} soloFuera={soloFuera} especieFiltrada={especieUnica} onElegirEspecie={cambiarCrop} />
                  </Card>
                  <Card className={styles.panel}>
                    <h3>
                      <span>Fuera de rango por cliente</span>
                      <span className={styles.hintClic}>
                        {soloFuera ? 'solo fuera de rango' : 'ordenado por informes fuera de rango'} · clic en el cliente: por semana · clic en la barra: cuánto se pasaron
                      </span>
                    </h3>
                    <ResultadosPorCliente informes={informesTodos} soloFuera={soloFuera} />
                  </Card>
                </div>
              ) : (
              <div className={styles.grid2Iguales}>
                <Card className={styles.panel}>
                  <h3>
                    Porcentaje de informes por especie
                    <span className={styles.hintClic}>clic para filtrar</span>
                  </h3>
                  {porEspecie.length === 0 ? (
                    <div className={styles.panelVacioChico}>Sin especie informada en estas solicitudes.</div>
                  ) : (
                    <div className={styles.especieCaja}>
                      <div className={styles.donutChica}>
                        <canvas ref={especieRef} aria-label="Porcentaje de informes por especie" role="img" />
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
                              className={(filtrosMultiples ? multi.crop.some((c) => mismoValor(c, e.valor)) : mismoValor(filtros.crop, e.valor)) ? styles.leyendaActiva : undefined}
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
              )}
                </>
              )}
              {modoBloques && bloques.fsma && (
                <SeccionInformes bloque="fsma" numero={numeroDeBloque('fsma')} informes={informesAls} totalSinFiltros={informesSinFiltros.als} conFiltros={nFiltros > 0} conGraficos={graficosInformes} acento={acento} />
              )}
              {modoBloques && bloques.fito && (
                <SeccionInformes bloque="fito" numero={numeroDeBloque('fito')} informes={informesFito} totalSinFiltros={informesSinFiltros.diagnofruit} conFiltros={nFiltros > 0} conGraficos={graficosInformes} acento={acento} />
              )}
            </>
          )}
        </>
      ) : null}

      {modalAnalitos && (
        <AnalitosAdminModal analitos={analitos} onCambio={setAnalitos} onCerrar={() => setModalAnalitos(false)} />
      )}

      {detalle && (
        <DetalleObservacionesModal
          titulo={detalle.titulo}
          filas={detalle.filas}
          onCerrar={() => setDetalle(null)}
          fichaCompleta={
            simulando
              ? undefined
              : {
                  analitos: analitosVista,
                  limites: limitesVista,
                  graficos: puedeDescargarBd ? graficosDelDetalle() : undefined,
                  sinLimites: esCuentaCliente,
                }
          }
        />
      )}
    </div>
  )
}
