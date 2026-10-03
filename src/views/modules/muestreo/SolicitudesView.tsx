import { useCallback, useEffect, useMemo, useState } from 'react'
import type { KeyboardEvent, MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { MultiSelectFiltro } from '@/components/ui/MultiSelectFiltro'
import { EliminarConClave } from '@/components/ui/EliminarConClave'
import {
  IconoActualizar,
  IconoAlerta,
  IconoBuscar,
  IconoCerrar,
  IconoExcel,
  IconoOjo,
  IconoPapelera,
  IconoPdf,
} from '@/components/ui/iconosAccion'
import { useAuth } from '@/features/auth'
import { esAdminGeneral } from '@/features/usuarios'
import { ROUTES, rutaTomaMuestrasDetalle } from '@/constants/routes'
import { formatDateCL } from '@/lib/locale'
import {
  eliminarSolicitud,
  listarSolicitudes,
  descargarTodasLasSolicitudes,
  obtenerEnvioAutomatico,
  actualizarEnvioAutomatico,
  descargarPdfsZip,
  descargarPdfSolicitud,
  abrirPdfSolicitud,
  listarInformesDeSolicitudes,
  abrirPdfInformeSolicitud,
  descargarPdfInformeSolicitud,
  enviarSolicitudPorCorreo,
  estadoSolicitudesPrueba,
  ESTADOS_DE_VISTA,
  ETIQUETA_ESTADO,
  FILTROS_VACIOS,
  chipsDeFiltros,
  filtrarSolicitudes,
  hayFiltros,
  listarTiposAplicacion,
  claveFiltrosGuardados,
  guardarFiltros,
  leerFiltros,
  opcionesAcumuladas,
  resumenVistas,
  vistaDeEstados,
} from '@/features/tomaMuestras'
import type {
  ConfigEnvioAutomatico,
  EstadoFiltro,
  FiltrosSolicitudes,
  OpcionConfig,
  Solicitud,
  VistaRapida,
} from '@/features/tomaMuestras'
import { VistaPrevia } from '@/views/modules/storage/VistaPrevia'
import { EstadoSolicitud } from './EstadoSolicitud'
import { CeldaInforme } from './CeldaInforme'
import styles from './SolicitudesView.module.css'

type ListaFiltro =
  | 'laboratorio' | 'soldTo' | 'shipTo' | 'especie' | 'tipoAplicacion' | 'lineaProceso' | 'tipoMuestra' | 'nombreMuestreador'

const ETIQUETAS_ESTADO = Object.values(ETIQUETA_ESTADO)
const ESTADO_DE = Object.fromEntries(
  (Object.entries(ETIQUETA_ESTADO) as [EstadoFiltro, string][]).map(([k, v]) => [v, k]),
) as Record<string, EstadoFiltro>

const nf = new Intl.NumberFormat('es-CL')

/** Los indicadores de arriba. Cada uno es también un filtro de un clic. */
const VISTAS: { vista: VistaRapida; texto: string; ayuda: string; tono: string }[] = [
  { vista: 'todas', texto: 'Solicitudes', ayuda: 'Todas las registradas', tono: 'neutro' },
  { vista: 'pendientes', texto: 'Por enviar', ayuda: 'Todavía no salen al laboratorio', tono: 'ambar' },
  { vista: 'esperando', texto: 'Esperando informe', ayuda: 'Enviadas, sin informe aún', tono: 'azul' },
  { vista: 'con_informe', texto: 'Con informe', ayuda: 'El laboratorio ya respondió', tono: 'verde' },
]

const CLAVE_FILTROS_ABIERTOS = 'agrofresh.solicitudes.filtros.abiertos'

function leerFiltrosAbiertos(): boolean {
  try {
    return localStorage.getItem(CLAVE_FILTROS_ABIERTOS) === '1'
  } catch {
    return false
  }
}

function guardarFiltrosAbiertos(v: boolean) {
  try {
    localStorage.setItem(CLAVE_FILTROS_ABIERTOS, v ? '1' : '0')
  } catch {
    /* solo se pierde recordar la preferencia */
  }
}

function plural(n: number, uno: string, varios: string) {
  return `${nf.format(n)} ${n === 1 ? uno : varios}`
}

export function SolicitudesView() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const esAdmin = Boolean(user && esAdminGeneral(user))
  const puedeEliminar = esAdmin && user?.email === 'jorge.sandoval@agrofresh.com'

  const [solicitudes, setSolicitudes] = useState<Solicitud[] | null>(null)
  const [cargando, setCargando] = useState(false)
  // Botón "Solicitud de prueba": lo decide el backend (una sola cuenta).
  const [puedeCrearPruebas, setPuedeCrearPruebas] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Los filtros se guardan (por cuenta) y vuelven al entrar de nuevo, pero
  // vencen solos tras una jornada sin tocarlos (`leerFiltros`).
  const claveGuardado = claveFiltrosGuardados(user?.email)
  const [filtros, setFiltros] = useState<FiltrosSolicitudes>(() => {
    try {
      return leerFiltros(localStorage, claveGuardado, Date.now())
    } catch {
      return FILTROS_VACIOS
    }
  })
  useEffect(() => {
    try {
      guardarFiltros(localStorage, claveGuardado, filtros, Date.now())
    } catch {
      /* sin almacenamiento (modo privado): solo no se recuerdan */
    }
  }, [filtros, claveGuardado])
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(leerFiltrosAbiertos)
  // PDF de la solicitud / del informe del laboratorio que se está mirando.
  const [pdfAbierto, setPdfAbierto] = useState<Solicitud | null>(null)
  const [informeAbierto, setInformeAbierto] = useState<Solicitud | null>(null)

  // Envío automático (solo admin general): una regla general y una por tipo.
  const [envioAutomatico, setEnvioAutomatico] = useState<ConfigEnvioAutomatico | null>(null)
  const [tiposAplicacion, setTiposAplicacion] = useState<OpcionConfig[]>([])
  // Qué regla se está por cambiar: null = ninguna; tipo null = la general.
  const [reglaACambiar, setReglaACambiar] = useState<{ tipo: string | null } | null>(null)
  const [password, setPassword] = useState('')
  const [errorModal, setErrorModal] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const [avisoMasivo, setAvisoMasivo] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState<null | 'pdf' | 'excel' | 'enviar'>(null)
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set())

  useEffect(() => {
    estadoSolicitudesPrueba()
      .then((r) => setPuedeCrearPruebas(r.permitido))
      .catch(() => setPuedeCrearPruebas(false))
  }, [])

  useEffect(() => {
    if (!esAdmin) return
    obtenerEnvioAutomatico().then(setEnvioAutomatico).catch(() => {})
    listarTiposAplicacion()
      .then((t) => setTiposAplicacion(t.filter((x) => x.activo)))
      .catch(() => setTiposAplicacion([]))
  }, [esAdmin])

  const refrescar = useCallback(async () => {
    setCargando(true)
    try {
      // Los informes vienen aparte: si esa consulta falla, el listado sale
      // igual, solo sin los informes.
      const [resultado, informes] = await Promise.all([
        listarSolicitudes(),
        listarInformesDeSolicitudes().catch(() => ({}) as Record<string, never>),
      ])
      setSolicitudes(resultado.map((s) => ({ ...s, informe: informes[s.archivo] ?? null })))
      setError(null)
    } catch {
      setError('No se pudo conectar con el backend.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void refrescar()
  }, [refrescar])

  // Lo que rige HOY para un tipo (o para la regla general si tipo es null).
  function reglaVigente(tipo: string | null): boolean {
    if (!envioAutomatico) return true
    return (tipo ? envioAutomatico.por_tipo?.[tipo] : undefined) ?? envioAutomatico.activo
  }

  function abrirCambioRegla(tipo: string | null) {
    setPassword('')
    setErrorModal(null)
    setReglaACambiar({ tipo })
  }

  async function confirmarCambio() {
    if (envioAutomatico === null || reglaACambiar === null || !password) return
    const { tipo } = reglaACambiar
    setGuardando(true)
    setErrorModal(null)
    try {
      const res = await actualizarEnvioAutomatico(!reglaVigente(tipo), password, tipo ? { tipo, heredar: false } : {})
      setEnvioAutomatico(res)
      setReglaACambiar(null)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setErrorModal(msg.includes('401') || msg.toLowerCase().includes('contraseña') ? 'Contraseña incorrecta.' : 'No se pudo guardar el cambio.')
    } finally {
      setGuardando(false)
    }
  }

  /** La confirmación con contraseña la pide `EliminarConClave`; si esto falla, el diálogo lo avisa. */
  async function onEliminar(solicitud: Solicitud) {
    await eliminarSolicitud(solicitud.archivo)
    await refrescar()
  }

  function cambiarFiltro<K extends keyof FiltrosSolicitudes>(clave: K, valor: FiltrosSolicitudes[K]) {
    setFiltros((f) => ({ ...f, [clave]: valor }))
  }

  function marcar(campo: ListaFiltro, valores: string[]) {
    cambiarFiltro(campo, valores)
  }

  function alternarFiltros() {
    setFiltrosAbiertos((v) => {
      guardarFiltrosAbiertos(!v)
      return !v
    })
  }

  // Los filtros se acumulan: cada lista ofrece (y cuenta) solo lo que queda
  // con los demás filtros puestos.
  const { opciones, conteo } = useMemo(() => opcionesAcumuladas(solicitudes ?? [], filtros), [solicitudes, filtros])
  const hayFiltrosActivos = hayFiltros(filtros)
  const chips = useMemo(() => chipsDeFiltros(filtros), [filtros])

  const solicitudesFiltradas = useMemo(
    () => (solicitudes ? filtrarSolicitudes(solicitudes, filtros) : null),
    [solicitudes, filtros],
  )

  // Los indicadores cuentan con TODOS los demás filtros, menos el de estado:
  // así cada uno dice cuántas verías al apretarlo.
  const resumen = useMemo(
    () => resumenVistas(solicitudes ? filtrarSolicitudes(solicitudes, { ...filtros, estado: [] }) : []),
    [solicitudes, filtros],
  )
  const vistaActiva = vistaDeEstados(filtros.estado)


  // Limpiar la selección cuando cambian los filtros o la lista base.
  useEffect(() => { setSeleccionadas(new Set()) }, [filtros, solicitudes])

  const visibles = solicitudesFiltradas ?? []
  const archivosVisibles = visibles.map((s) => s.archivo)
  const todasMarcadas = archivosVisibles.length > 0 && archivosVisibles.every((a) => seleccionadas.has(a))
  const algunaMarcada = archivosVisibles.some((a) => seleccionadas.has(a))

  function toggleTodas() {
    setSeleccionadas(todasMarcadas ? new Set() : new Set(archivosVisibles))
  }

  function toggleUna(archivo: string) {
    setSeleccionadas((prev) => {
      const next = new Set(prev)
      if (next.has(archivo)) next.delete(archivo)
      else next.add(archivo)
      return next
    })
  }

  const filasSeleccionadas = visibles.filter((x) => seleccionadas.has(x.archivo))
  const pendientesSel = filasSeleccionadas.filter((x) => !x.enviada)

  // Sin selección, el Excel baja lo filtrado (o todo, si no hay filtros).
  const archivosAExportar = seleccionadas.size > 0 ? [...seleccionadas] : hayFiltrosActivos ? archivosVisibles : undefined
  const etiquetaExcel = seleccionadas.size > 0
    ? `Excel (${seleccionadas.size})`
    : hayFiltrosActivos ? `Excel filtrado (${visibles.length})` : 'Descargar Excel'

  async function correr(tarea: 'pdf' | 'excel' | 'enviar', fn: () => Promise<void>) {
    setTrabajando(tarea)
    setAvisoMasivo(null)
    try {
      await fn()
    } catch (e) {
      setAvisoMasivo(e instanceof Error && e.message ? e.message : 'No se pudo completar la acción.')
    } finally {
      setTrabajando(null)
    }
  }

  async function enviarPendientes() {
    const n = pendientesSel.length
    if (n === 0) return
    if (!confirm(`Se enviarán por correo ${n} solicitud${n === 1 ? '' : 'es'} pendiente${n === 1 ? '' : 's'} a sus contactos. ¿Continuar?`)) return
    await correr('enviar', async () => {
      let ok = 0
      const fallidas: string[] = []
      for (const x of pendientesSel) {
        try {
          await enviarSolicitudPorCorreo(x.archivo)
          ok += 1
        } catch {
          fallidas.push(x.numero_solicitud)
        }
      }
      await refrescar()
      setAvisoMasivo(
        fallidas.length === 0
          ? `Se enviaron ${ok} solicitud${ok === 1 ? '' : 'es'}.`
          : `Se enviaron ${ok}. No se pudieron enviar: ${fallidas.join(', ')}.`,
      )
    })
  }

  function elegirVista(vista: VistaRapida) {
    // Volver a apretar la vista activa la quita.
    cambiarFiltro('estado', vistaActiva === vista && vista !== 'todas' ? [] : ESTADOS_DE_VISTA[vista])
  }

  // Clic en la fila = abrir la solicitud (salvo que el clic sea en un control).
  function abrirFila(e: MouseEvent | KeyboardEvent, s: Solicitud) {
    if ((e.target as HTMLElement).closest('button, a, input, label')) return
    navigate(rutaTomaMuestrasDetalle(s.archivo))
  }

  const reglasEnvio = envioAutomatico
    ? [...tiposAplicacion.map((t) => ({ tipo: t.nombre as string | null, nombre: t.nombre })), { tipo: null, nombre: 'General' }]
    : []
  const resumenEnvio = envioAutomatico
    ? `General ${envioAutomatico.activo ? 'activo' : 'apagado'}` +
      (tiposAplicacion.length ? ` · ${tiposAplicacion.filter((t) => reglaVigente(t.nombre)).length} de ${tiposAplicacion.length} tipos se envían solos` : '')
    : ''

  return (
    <div className={styles.pagina}>
      <Header
        title="Solicitudes e informes"
        description="Cada solicitud de análisis, su envío al laboratorio y el informe que vuelve."
        acciones={
          <>
            <Button variant="secondary" onClick={() => void refrescar()} disabled={cargando} className={styles.botonConIcono} title="Volver a cargar">
              <IconoActualizar className={cargando ? styles.girando : undefined} width={16} height={16} />
              <span className={styles.ocultarMovil}>{cargando ? 'Actualizando…' : 'Actualizar'}</span>
            </Button>
            {puedeCrearPruebas && (
              <Button variant="secondary" onClick={() => navigate(ROUTES.tomaMuestrasNuevaPrueba)}>
                + Prueba
              </Button>
            )}
            <Button onClick={() => navigate(ROUTES.tomaMuestrasNueva)}>+ Nueva solicitud</Button>
          </>
        }
      />

      {error && (
        <div className={styles.errorCaja} role="alert">
          <IconoAlerta />
          <span>{error}</span>
          <Button variant="secondary" onClick={() => void refrescar()}>Reintentar</Button>
        </div>
      )}

      {/* Indicadores = filtros rápidos */}
      <section className={styles.indicadores} aria-label="Resumen">
        {VISTAS.map((v) => {
          const n = resumen[v.vista]
          const activo = vistaActiva === v.vista && (v.vista !== 'todas' || filtros.estado.length === 0)
          return (
            <button
              key={v.vista}
              type="button"
              className={`${styles.indicador} ${styles[`tono_${v.tono}`]} ${activo ? styles.indicadorActivo : ''}`}
              aria-pressed={activo}
              onClick={() => elegirVista(v.vista)}
              title={v.ayuda}
            >
              <span className={styles.indicadorTexto}>{v.texto}</span>
              <strong className={styles.indicadorCifra}>
                {solicitudes ? nf.format(n) : <Skeleton style={{ width: 44, height: 26 }} />}
              </strong>
              <span className={styles.indicadorAyuda}>
                {solicitudes && v.vista !== 'todas' && resumen.todas > 0 ? (
                  <>
                    {Math.round((n / resumen.todas) * 100)}%
                    <span className={styles.ayudaLarga}> · {v.ayuda.toLowerCase()}</span>
                  </>
                ) : (
                  <span className={styles.ayudaLarga}>{v.ayuda}</span>
                )}
              </span>
            </button>
          )
        })}
      </section>

      {resumen.sin_report > 0 && (
        <button
          type="button"
          className={`${styles.avisoSinReport} ${vistaActiva === 'sin_report' ? styles.avisoSinReportActivo : ''}`}
          onClick={() => elegirVista('sin_report')}
          aria-pressed={vistaActiva === 'sin_report'}
        >
          <IconoAlerta width={16} height={16} />
          <span>
            <b>{plural(resumen.sin_report, 'informe tiene', 'informes tienen')}</b> PDF pero sus resultados no están en Report
            (revisa Ingesta de Datos → Filas pendientes).
          </span>
          <span className={styles.avisoAccion}>{vistaActiva === 'sin_report' ? 'Ver todas' : 'Ver cuáles'}</span>
        </button>
      )}

      <section className={styles.tablaCard} aria-label="Solicitudes">
        {/* Barra: buscador, filtros y descargas */}
        <div className={styles.barra}>
          <label className={styles.buscar}>
            <IconoBuscar className={styles.lupa} width={15} height={15} />
            <input
              type="search"
              placeholder="Buscar N°, informe, cliente, planta, especie…"
              value={filtros.busqueda}
              onChange={(e) => cambiarFiltro('busqueda', e.target.value)}
              aria-label="Buscar solicitudes"
            />
          </label>
          <div className={styles.barraAcciones}>
            <button
              type="button"
              className={`${styles.botonFiltros} ${filtrosAbiertos ? styles.botonFiltrosAbierto : ''}`}
              aria-expanded={filtrosAbiertos}
              onClick={alternarFiltros}
            >
              Filtros
              {chips.length > 0 && <span className={styles.contadorFiltros}>{chips.length}</span>}
            </button>
            <button
              type="button"
              className={styles.botonSecundario}
              disabled={visibles.length === 0 && seleccionadas.size === 0}
              onClick={() => void descargarTodasLasSolicitudes(archivosAExportar)}
              title="Descarga la matriz de solicitudes en Excel"
            >
              <IconoExcel width={15} height={15} />
              <span>{etiquetaExcel}</span>
            </button>
          </div>
        </div>

        {filtrosAbiertos && (
          <div className={styles.panelFiltros}>
            <label className={styles.campo}>
              <span>Desde</span>
              <input type="date" value={filtros.fechaDesde} onChange={(e) => cambiarFiltro('fechaDesde', e.target.value)} />
            </label>
            <label className={styles.campo}>
              <span>Hasta</span>
              <input type="date" value={filtros.fechaHasta} onChange={(e) => cambiarFiltro('fechaHasta', e.target.value)} />
            </label>
            <MultiSelectFiltro etiqueta="Laboratorio" opciones={opciones.laboratorio} valores={filtros.laboratorio} onChange={(v) => marcar('laboratorio', v)} conteoDe={conteo.laboratorio} />
            <MultiSelectFiltro etiqueta="Estado" opciones={ETIQUETAS_ESTADO} valores={filtros.estado.map((e) => ETIQUETA_ESTADO[e])} onChange={(v) => cambiarFiltro('estado', v.map((x) => ESTADO_DE[x]))} />
            <MultiSelectFiltro etiqueta="Sold To" opciones={opciones.soldTo} valores={filtros.soldTo} onChange={(v) => marcar('soldTo', v)} conteoDe={conteo.soldTo} />
            <MultiSelectFiltro etiqueta="Ship To" opciones={opciones.shipTo} valores={filtros.shipTo} onChange={(v) => marcar('shipTo', v)} conteoDe={conteo.shipTo} />
            <MultiSelectFiltro etiqueta="Especie" opciones={opciones.especie} valores={filtros.especie} onChange={(v) => marcar('especie', v)} conteoDe={conteo.especie} />
            <MultiSelectFiltro etiqueta="Tipo de aplicación" opciones={opciones.tipoAplicacion} valores={filtros.tipoAplicacion} onChange={(v) => marcar('tipoAplicacion', v)} conteoDe={conteo.tipoAplicacion} />
            <MultiSelectFiltro etiqueta="Línea de proceso" opciones={opciones.lineaProceso} valores={filtros.lineaProceso} onChange={(v) => marcar('lineaProceso', v)} conteoDe={conteo.lineaProceso} />
            <MultiSelectFiltro etiqueta="Tipo muestra" opciones={opciones.tipoMuestra} valores={filtros.tipoMuestra} onChange={(v) => marcar('tipoMuestra', v)} conteoDe={conteo.tipoMuestra} />
            <MultiSelectFiltro etiqueta="Muestreador" opciones={opciones.nombreMuestreador} valores={filtros.nombreMuestreador} onChange={(v) => marcar('nombreMuestreador', v)} conteoDe={conteo.nombreMuestreador} />
            <label className={styles.campo}>
              <span>N° solicitud</span>
              <input value={filtros.numeroSolicitud} onChange={(e) => cambiarFiltro('numeroSolicitud', e.target.value)} placeholder="OT-…" />
            </label>
            <label className={styles.campo}>
              <span>Solicitante</span>
              <input value={filtros.solicitante} onChange={(e) => cambiarFiltro('solicitante', e.target.value)} />
            </label>
            <label className={styles.campo}>
              <span>Variedad</span>
              <input value={filtros.variedad} onChange={(e) => cambiarFiltro('variedad', e.target.value)} />
            </label>
            <label className={styles.campo}>
              <span>Solicitudes de prueba</span>
              <select value={filtros.prueba} onChange={(e) => cambiarFiltro('prueba', e.target.value as FiltrosSolicitudes['prueba'])}>
                <option value="">Todas</option>
                <option value="solo">Solo de prueba</option>
                <option value="sin">Sin las de prueba</option>
              </select>
            </label>
          </div>
        )}

        {(chips.length > 0 || filtros.busqueda) && (
          <div className={styles.chipsFila}>
            <ul className={styles.chips} aria-label="Filtros aplicados">
              {chips.map((c) => (
                <li key={c.clave}>
                  <button
                    type="button"
                    className={styles.chipFiltro}
                    aria-label={`Quitar filtro: ${c.texto}`}
                    title="Quitar este filtro"
                    onClick={() => cambiarFiltro(c.clave, FILTROS_VACIOS[c.clave])}
                  >
                    {c.texto}
                    <IconoCerrar width={12} height={12} />
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className={styles.limpiar} onClick={() => setFiltros(FILTROS_VACIOS)}>
              Limpiar todo
            </button>
            <span className={styles.notaGuardado} title="Siguen puestos si sales y vuelves. Se borran solos tras 8 horas sin cambiarlos.">
              Guardados por 8 h
            </span>
          </div>
        )}

        {seleccionadas.size > 0 && (
          <div className={styles.barraSeleccion} role="region" aria-label="Acciones sobre la selección">
            <span className={styles.seleccionTexto}>
              <strong>{plural(seleccionadas.size, 'seleccionada', 'seleccionadas')}</strong>
              <span>
                {filasSeleccionadas.length - pendientesSel.length} enviada{filasSeleccionadas.length - pendientesSel.length === 1 ? '' : 's'} · {pendientesSel.length} pendiente{pendientesSel.length === 1 ? '' : 's'}
              </span>
            </span>
            <div className={styles.seleccionAcciones}>
              <button type="button" className={styles.botonSel} disabled={trabajando !== null} onClick={() => void correr('pdf', () => descargarPdfsZip([...seleccionadas]))}>
                <IconoPdf width={15} height={15} />
                {trabajando === 'pdf' ? 'Generando…' : 'PDF (.zip)'}
              </button>
              <button type="button" className={styles.botonSel} disabled={trabajando !== null} onClick={() => void correr('excel', () => descargarTodasLasSolicitudes([...seleccionadas]))}>
                <IconoExcel width={15} height={15} />
                Excel
              </button>
              <button type="button" className={styles.botonSelPrincipal} disabled={trabajando !== null || pendientesSel.length === 0} onClick={() => void enviarPendientes()}>
                {trabajando === 'enviar' ? 'Enviando…' : `Enviar pendientes (${pendientesSel.length})`}
              </button>
              <button type="button" className={styles.botonSelSuave} onClick={() => setSeleccionadas(new Set())}>
                Quitar selección
              </button>
            </div>
          </div>
        )}
        {avisoMasivo && <p className={styles.avisoMasivo} role="status">{avisoMasivo}</p>}

        <div className={styles.conteoFila}>
          <span>
            {solicitudesFiltradas
              ? hayFiltrosActivos
                ? `${plural(visibles.length, 'solicitud', 'solicitudes')} de ${nf.format(solicitudes?.length ?? 0)}`
                : plural(visibles.length, 'solicitud', 'solicitudes')
              : 'Cargando…'}
          </span>
        </div>

        {solicitudesFiltradas === null ? (
          <div className={styles.esqueletos} aria-busy="true">
            {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} style={{ height: 44 }} />)}
          </div>
        ) : visibles.length === 0 ? (
          <div className={styles.vacio}>
            <IconoBuscar width={26} height={26} />
            <h3>{hayFiltrosActivos ? 'Nada coincide con los filtros' : 'Todavía no hay solicitudes'}</h3>
            <p>{hayFiltrosActivos ? 'Prueba con otra combinación o limpia los filtros.' : 'Crea la primera con «+ Nueva solicitud».'}</p>
            {hayFiltrosActivos && <Button variant="secondary" onClick={() => setFiltros(FILTROS_VACIOS)}>Limpiar filtros</Button>}
          </div>
        ) : (
          <>
            {/* Escritorio: tabla */}
            <div className={styles.tablaScroll}>
              <table className={styles.tabla}>
                <thead>
                  <tr>
                    <th className={styles.colCheck}>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={todasMarcadas}
                        ref={(el) => { if (el) el.indeterminate = algunaMarcada && !todasMarcadas }}
                        onChange={toggleTodas}
                        aria-label="Seleccionar todas"
                      />
                    </th>
                    <th>Solicitud</th>
                    <th>Cliente / planta</th>
                    <th className={styles.colEspecie}>Especie</th>
                    <th>
                      <span className={styles.soloAncho}>Envío</span>
                      <span className={styles.soloAngosto}>Estado</span>
                    </th>
                    <th className={styles.colInforme}>Informe</th>
                    <th className={styles.colAcciones}><span className={styles.sr}>Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((s) => (
                    <tr
                      key={s.archivo}
                      className={seleccionadas.has(s.archivo) ? styles.filaSeleccionada : undefined}
                      onClick={(e) => abrirFila(e, s)}
                    >
                      <td className={styles.colCheck}>
                        <input
                          type="checkbox"
                          className={styles.checkbox}
                          checked={seleccionadas.has(s.archivo)}
                          onChange={() => toggleUna(s.archivo)}
                          aria-label={`Seleccionar ${s.numero_solicitud}`}
                        />
                      </td>
                      <td>
                        <span className={styles.numero}>
                          {s.numero_solicitud}
                          {s.es_prueba && <span className={styles.etiquetaPrueba}>Prueba</span>}
                        </span>
                        <span className={styles.secundario}>
                          {formatDateCL(s.fecha_solicitud)} · <span className={styles.laboratorio}>{s.laboratorio}</span>
                        </span>
                      </td>
                      <td className={styles.colCliente}>
                        <span className={styles.principal}>{s.ship_to ?? s.sold_to}</span>
                        {s.ship_to && <span className={styles.secundario}>{s.sold_to}</span>}
                      </td>
                      <td className={styles.colEspecie}>{s.especie ?? '—'}</td>
                      <td>
                        <div className={styles.estadoCelda}>
                          <EstadoSolicitud s={s} />
                          {/* En pantallas medianas el informe va acá, bajo el envío. */}
                          <span className={styles.soloAngosto}>
                            <CeldaInforme s={s} onAbrir={setInformeAbierto} />
                          </span>
                        </div>
                      </td>
                      <td className={styles.colInforme}><CeldaInforme s={s} onAbrir={setInformeAbierto} /></td>
                      <td className={styles.colAcciones}>
                        <div className={styles.acciones}>
                          <button type="button" className={styles.botonIcono} title="Ver solicitud" aria-label={`Ver ${s.numero_solicitud}`} onClick={() => navigate(rutaTomaMuestrasDetalle(s.archivo))}>
                            <IconoOjo width={17} height={17} />
                          </button>
                          <button type="button" className={styles.botonIcono} title="PDF de la solicitud" aria-label={`PDF de ${s.numero_solicitud}`} onClick={() => setPdfAbierto(s)}>
                            <IconoPdf width={17} height={17} />
                          </button>
                          {puedeEliminar && (
                            <EliminarConClave
                              etiqueta="Eliminar"
                              icono={<IconoPapelera width={16} height={16} />}
                              titulo={`Eliminar la solicitud ${s.numero_solicitud}`}
                              descripcion="Se borra para siempre y no se puede deshacer."
                              onConfirmar={() => onEliminar(s)}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Celular: tarjetas */}
            <ul className={styles.tarjetas}>
              {visibles.map((s) => (
                <li
                  key={s.archivo}
                  className={`${styles.tarjeta} ${seleccionadas.has(s.archivo) ? styles.tarjetaSeleccionada : ''}`}
                  onClick={(e) => abrirFila(e, s)}
                >
                  <div className={styles.tarjetaCab}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={seleccionadas.has(s.archivo)}
                      onChange={() => toggleUna(s.archivo)}
                      aria-label={`Seleccionar ${s.numero_solicitud}`}
                    />
                    <span className={styles.numero}>
                      {s.numero_solicitud}
                      {s.es_prueba && <span className={styles.etiquetaPrueba}>Prueba</span>}
                    </span>
                    <span className={styles.tarjetaFecha}>{formatDateCL(s.fecha_solicitud)}</span>
                  </div>
                  <span className={styles.principal}>{s.ship_to ?? s.sold_to}</span>
                  <span className={styles.secundario}>
                    <span className={styles.laboratorio}>{s.laboratorio}</span>
                    {s.especie ? ` · ${s.especie}` : ''}
                  </span>
                  <div className={styles.tarjetaEstados}>
                    <EstadoSolicitud s={s} />
                    <CeldaInforme s={s} onAbrir={setInformeAbierto} />
                  </div>
                  <div className={styles.tarjetaPie}>
                    <button type="button" className={styles.botonTarjeta} onClick={() => navigate(rutaTomaMuestrasDetalle(s.archivo))}>
                      <IconoOjo width={16} height={16} /> Ver
                    </button>
                    <button type="button" className={styles.botonTarjeta} onClick={() => setPdfAbierto(s)}>
                      <IconoPdf width={16} height={16} /> PDF
                    </button>
                    {puedeEliminar && (
                      <EliminarConClave
                        etiqueta="Eliminar"
                        icono={<IconoPapelera width={16} height={16} />}
                        titulo={`Eliminar la solicitud ${s.numero_solicitud}`}
                        descripcion="Se borra para siempre y no se puede deshacer."
                        onConfirmar={() => onEliminar(s)}
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* Envío automático: abajo y plegado; se cambia poco. */}
      {esAdmin && envioAutomatico !== null && (
        <details className={styles.ajustes}>
          <summary>
            <span className={styles.ajustesTitulo}>Envío automático al guardar</span>
            <span className={styles.ajustesResumen}>{resumenEnvio}</span>
          </summary>
          <ul className={styles.reglas}>
            {reglasEnvio.map((r) => {
              const activo = reglaVigente(r.tipo)
              const heredada = r.tipo !== null && envioAutomatico.por_tipo?.[r.tipo] === undefined
              return (
                <li key={r.nombre} className={styles.regla}>
                  <span className={styles.reglaNombre}>{r.nombre}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={activo}
                    aria-label={`Envío automático: ${r.nombre}`}
                    className={`${styles.interruptor} ${activo ? styles.interruptorOn : ''}`}
                    onClick={() => abrirCambioRegla(r.tipo)}
                  >
                    <span />
                  </button>
                  <span className={styles.reglaEstado}>
                    {r.tipo === null
                      ? 'Rige para los tipos sin regla propia y para solicitudes sin tipo'
                      : activo ? 'Se envía por correo al guardar' : 'Queda pendiente: se envía a mano'}
                    {heredada && ' (según la general)'}
                  </span>
                </li>
              )
            })}
          </ul>
        </details>
      )}

      {reglaACambiar && (
        <Modal
          titulo={`${reglaVigente(reglaACambiar.tipo) ? 'Desactivar' : 'Activar'} envío automático`}
          subtitulo={reglaACambiar.tipo ?? 'Regla general'}
          onCerrar={() => !guardando && setReglaACambiar(null)}
          pie={
            <>
              <Button variant="secondary" onClick={() => setReglaACambiar(null)} disabled={guardando}>Cancelar</Button>
              <Button onClick={() => void confirmarCambio()} disabled={guardando || !password}>
                {guardando ? 'Guardando…' : 'Confirmar'}
              </Button>
            </>
          }
        >
          <form className={styles.formClave} onSubmit={(e) => { e.preventDefault(); void confirmarCambio() }}>
            <p>
              {reglaVigente(reglaACambiar.tipo)
                ? 'Estas solicitudes quedarán pendientes hasta que las envíes a mano.'
                : 'Estas solicitudes se enviarán por correo al momento de guardarlas.'}
            </p>
            <label>
              Tu contraseña
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            {errorModal && <p role="alert" className={styles.errorTexto}>{errorModal}</p>}
          </form>
        </Modal>
      )}

      {pdfAbierto && (
        <VistaPrevia
          entrada={{ nombre: `${pdfAbierto.numero_solicitud}.pdf`, ruta: pdfAbierto.archivo, tipo: 'archivo', tamano_bytes: null, modificado: '' }}
          abrir={abrirPdfSolicitud}
          onDescargar={() => void descargarPdfSolicitud(pdfAbierto.archivo)}
          onCerrar={() => setPdfAbierto(null)}
        />
      )}
      {informeAbierto && (
        <VistaPrevia
          entrada={{
            nombre: `Informe ${informeAbierto.informe?.nro_informe ?? informeAbierto.numero_solicitud}.pdf`,
            ruta: informeAbierto.archivo,
            tipo: 'archivo',
            tamano_bytes: null,
            modificado: '',
          }}
          abrir={abrirPdfInformeSolicitud}
          onDescargar={() =>
            void descargarPdfInformeSolicitud(
              informeAbierto.archivo,
              `${informeAbierto.informe?.nro_informe ?? informeAbierto.numero_solicitud}.pdf`,
            )
          }
          onCerrar={() => setInformeAbierto(null)}
        />
      )}
    </div>
  )
}
