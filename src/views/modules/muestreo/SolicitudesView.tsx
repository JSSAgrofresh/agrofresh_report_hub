import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ResumenHero } from '@/components/ui/ResumenHero'
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
  enviarSolicitudPorCorreo,
  estadoSolicitudesPrueba,
  listarTiposAplicacion,
} from '@/features/tomaMuestras'
import type { ConfigEnvioAutomatico, OpcionConfig, Solicitud } from '@/features/tomaMuestras'
import { EstadoSolicitud } from './EstadoSolicitud'
import styles from './SolicitudesView.module.css'

interface Filtros {
  fechaDesde: string
  fechaHasta: string
  numeroSolicitud: string
  busqueda: string
  laboratorio: string
  solicitante: string
  soldTo: string
  shipTo: string
  especie: string
  variedad: string
  tipoAplicacion: string
  lineaProceso: string
  tipoMuestra: string
  nombreMuestreador: string
  estado: '' | 'enviado' | 'pendiente' | 'sin_lista'
  prueba: '' | 'solo' | 'sin'
}

const FILTROS_VACIOS: Filtros = {
  fechaDesde: '',
  fechaHasta: '',
  numeroSolicitud: '',
  busqueda: '',
  laboratorio: '',
  solicitante: '',
  soldTo: '',
  shipTo: '',
  especie: '',
  variedad: '',
  tipoAplicacion: '',
  lineaProceso: '',
  tipoMuestra: '',
  nombreMuestreador: '',
  estado: '',
  prueba: '',
}

function contiene(valor: string | null | undefined, buscado: string): boolean {
  return (valor ?? '').toLowerCase().includes(buscado.toLowerCase())
}

export function SolicitudesView() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const esAdmin = Boolean(user && esAdminGeneral(user))
  const puedeEliminar = esAdmin && user?.email === 'jorge.sandoval@agrofresh.com'

  const [solicitudes, setSolicitudes] = useState<Solicitud[] | null>(null)
  // Botón "Solicitud de prueba": lo decide el backend (una sola cuenta).
  const [puedeCrearPruebas, setPuedeCrearPruebas] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS)
  const [mostrarFiltros, setMostrarFiltros] = useState(false)

  // Toggle de envío automático (solo visible para admin_general)
  // Una regla general y una por tipo de aplicación (Actimist, Línea de proceso…).
  const [envioAutomatico, setEnvioAutomatico] = useState<ConfigEnvioAutomatico | null>(null)
  const [tiposAplicacion, setTiposAplicacion] = useState<OpcionConfig[]>([])
  // Qué regla se está por cambiar: null = la general, texto = ese tipo.
  const [reglaACambiar, setReglaACambiar] = useState<{ tipo: string | null } | null>(null)
  const modalAbierto = reglaACambiar !== null
  const [password, setPassword] = useState('')
  const [errorModal, setErrorModal] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const inputPasswordRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    estadoSolicitudesPrueba()
      .then((r) => setPuedeCrearPruebas(r.permitido))
      .catch(() => setPuedeCrearPruebas(false))
  }, [])

  useEffect(() => {
    if (!esAdmin) return
    obtenerEnvioAutomatico()
      .then(setEnvioAutomatico)
      .catch(() => {})
    listarTiposAplicacion()
      .then((t) => setTiposAplicacion(t.filter((x) => x.activo)))
      .catch(() => setTiposAplicacion([]))
  }, [esAdmin])

  useEffect(() => {
    if (modalAbierto) {
      setPassword('')
      setErrorModal(null)
      setTimeout(() => inputPasswordRef.current?.focus(), 50)
    }
  }, [modalAbierto])

  const [avisoMasivo, setAvisoMasivo] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState<null | 'pdf' | 'excel' | 'enviar'>(null)

  // Lo que rige HOY para un tipo (o para la regla general si tipo es null).
  function reglaVigente(tipo: string | null): boolean {
    if (!envioAutomatico) return true
    return (tipo ? envioAutomatico.por_tipo?.[tipo] : undefined) ?? envioAutomatico.activo
  }

  async function confirmarCambio(heredar = false) {
    if (envioAutomatico === null || reglaACambiar === null) return
    const { tipo } = reglaACambiar
    setGuardando(true)
    setErrorModal(null)
    try {
      const res = await actualizarEnvioAutomatico(!reglaVigente(tipo), password, {
        ...(tipo ? { tipo, heredar } : {}),
      })
      setEnvioAutomatico(res)
      setReglaACambiar(null)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setErrorModal(msg.includes('401') || msg.toLowerCase().includes('contraseña') ? 'Contraseña incorrecta.' : 'No se pudo guardar el cambio.')
    } finally {
      setGuardando(false)
    }
  }

  const refrescar = useCallback(async () => {
    try {
      const resultado = await listarSolicitudes()
      setSolicitudes(resultado)
      setError(null)
    } catch {
      setError('No se pudo conectar con el backend.')
    }
  }, [])

  useEffect(() => {
    refrescar()
  }, [refrescar])

  async function onEliminar(solicitud: Solicitud) {
    if (
      !confirm(
        `¿Eliminar la solicitud "${solicitud.numero_solicitud}"? Esta acción no se puede deshacer.`,
      )
    )
      return
    try {
      await eliminarSolicitud(solicitud.archivo)
      await refrescar()
    } catch {
      setError('No se pudo eliminar la solicitud.')
    }
  }

  function actualizarFiltro(campo: keyof Filtros, valor: string) {
    setFiltros((f) => ({ ...f, [campo]: valor }))
  }

  // Las opciones de los selects se derivan de las solicitudes ya cargadas
  // (una sola carga, sin volver a leer todos los Excel por cada filtro).
  const opciones = useMemo(() => {
    const laboratorio = new Set<string>()
    const soldTo = new Set<string>()
    const shipTo = new Set<string>()
    const tipoAplicacion = new Set<string>()
    const lineaProceso = new Set<string>()
    for (const s of solicitudes ?? []) {
      laboratorio.add(s.laboratorio)
      soldTo.add(s.sold_to)
      if (s.ship_to) shipTo.add(s.ship_to)
      const ta = s.campos_laboratorio['Tipo Aplicación']
      if (ta) tipoAplicacion.add(ta)
      if (s.linea_proceso) lineaProceso.add(s.linea_proceso)
    }
    return {
      laboratorio: [...laboratorio].sort(),
      soldTo: [...soldTo].sort(),
      shipTo: [...shipTo].sort(),
      tipoAplicacion: [...tipoAplicacion].sort(),
      lineaProceso: [...lineaProceso].sort(),
    }
  }, [solicitudes])

  const hayFiltrosActivos = Object.values(filtros).some((v) => v.trim())

  const solicitudesFiltradas = useMemo(() => {
    if (!solicitudes) return null
    return solicitudes.filter((s) => {
      if (filtros.fechaDesde && s.fecha_solicitud < filtros.fechaDesde) return false
      if (filtros.fechaHasta && s.fecha_solicitud > filtros.fechaHasta) return false
      if (filtros.busqueda) {
        const pajar = [
          s.numero_solicitud, s.sold_to, s.ship_to, s.especie, s.variedad,
          s.laboratorio, s.generado_por, s.tipo_muestra, s.campos_laboratorio['Tipo Aplicación'],
        ].join(' ')
        const claves = filtros.busqueda.trim().toLowerCase().split(/\s+/)
        const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        if (!claves.every((c) => norm(pajar).includes(norm(c)))) return false
      }
      if (filtros.numeroSolicitud && !contiene(s.numero_solicitud, filtros.numeroSolicitud))
        return false
      if (filtros.laboratorio && s.laboratorio !== filtros.laboratorio) return false
      if (filtros.solicitante && !contiene(s.solicitante, filtros.solicitante)) return false
      if (filtros.soldTo && s.sold_to !== filtros.soldTo) return false
      if (filtros.shipTo && s.ship_to !== filtros.shipTo) return false
      if (filtros.especie && !contiene(s.especie, filtros.especie)) return false
      if (filtros.variedad && !contiene(s.variedad, filtros.variedad)) return false
      if (
        filtros.tipoAplicacion &&
        s.campos_laboratorio['Tipo Aplicación'] !== filtros.tipoAplicacion
      )
        return false
      if (filtros.lineaProceso && s.linea_proceso !== filtros.lineaProceso) return false
      if (filtros.tipoMuestra && !contiene(s.tipo_muestra, filtros.tipoMuestra)) return false
      if (filtros.nombreMuestreador && !contiene(s.nombre_muestreador, filtros.nombreMuestreador))
        return false
      if (filtros.estado === 'enviado' && !s.enviada) return false
      if (filtros.estado === 'pendiente' && s.enviada) return false
      if (filtros.estado === 'sin_lista' && !s.sin_lista_distribucion) return false
      if (filtros.prueba === 'solo' && !s.es_prueba) return false
      if (filtros.prueba === 'sin' && s.es_prueba) return false
      return true
    })
  }, [solicitudes, filtros])

  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set())

  // Limpiar selección cuando cambian los filtros o la lista base
  useEffect(() => { setSeleccionadas(new Set()) }, [filtros, solicitudes])

  const archivosVisibles = (solicitudesFiltradas ?? []).map((s) => s.archivo)
  const todasMarcadas = archivosVisibles.length > 0 && archivosVisibles.every((a) => seleccionadas.has(a))
  const algunaMarcada = archivosVisibles.some((a) => seleccionadas.has(a))

  function toggleTodas() {
    if (todasMarcadas) {
      setSeleccionadas(new Set())
    } else {
      setSeleccionadas(new Set(archivosVisibles))
    }
  }

  function toggleUna(archivo: string) {
    setSeleccionadas((prev) => {
      const next = new Set(prev)
      if (next.has(archivo)) next.delete(archivo)
      else next.add(archivo)
      return next
    })
  }

  const filasSeleccionadas = (solicitudesFiltradas ?? []).filter((x) => seleccionadas.has(x.archivo))
  const pendientesSel = filasSeleccionadas.filter((x) => !x.enviada)

  const archivosAExportar = seleccionadas.size > 0
    ? [...seleccionadas]
    : hayFiltrosActivos
      ? archivosVisibles
      : undefined

  const etiquetaBotonExport = seleccionadas.size > 0
    ? `Descargar seleccionadas (${seleccionadas.size})`
    : hayFiltrosActivos
      ? `Descargar filtradas (${solicitudesFiltradas?.length ?? 0})`
      : 'Descargar todas las solicitudes'

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

  // Sin selección, el PDF masivo baja lo que se ve (con o sin filtros).
  const archivosParaPdf = seleccionadas.size > 0 ? [...seleccionadas] : archivosVisibles

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

  const totalEnviadas = (solicitudesFiltradas ?? []).filter((x) => x.enviada).length
  const totalPendientes = (solicitudesFiltradas?.length ?? 0) - totalEnviadas
  const totalSinLista = (solicitudesFiltradas ?? []).filter((x) => x.sin_lista_distribucion).length

  return (
    <div>
      <Header
        title="Solicitudes de análisis"
        description="Listado de todas las solicitudes registradas."
        acciones={
          <div className={styles.accionesCabecera}>
            <button
              type="button"
              className={styles.botonDescargaTodas}
              disabled={(solicitudesFiltradas?.length ?? 0) === 0 && seleccionadas.size === 0}
              onClick={() => void descargarTodasLasSolicitudes(archivosAExportar)}
            >
              {etiquetaBotonExport}
            </button>
            {puedeCrearPruebas && (
              <Button variant="secondary" onClick={() => navigate(ROUTES.tomaMuestrasNuevaPrueba)}>
                + Solicitud de prueba
              </Button>
            )}
            <Button onClick={() => navigate(ROUTES.tomaMuestrasNueva)}>+ Nueva solicitud</Button>
          </div>
        }
      />

      {solicitudesFiltradas && solicitudesFiltradas.length > 0 && (
        <div className={styles.heroSolicitudes}>
          <ResumenHero
            etiqueta="Solicitudes enviadas"
            porcentaje={(totalEnviadas / solicitudesFiltradas.length) * 100}
            cifra={totalEnviadas}
            cifraSub={`de ${solicitudesFiltradas.length} registradas`}
            descripcion="Las que ya salieron por correo al laboratorio."
            ariaLabel="Resumen de solicitudes enviadas"
            segmentos={[
              { clave: 'enviadas', texto: 'Enviadas', n: totalEnviadas, color: '#1b7f5c', tinta: '#14664a', fondo: 'rgba(27, 127, 92, 0.12)' },
              { clave: 'pendientes', texto: 'Pendientes', n: totalPendientes, color: '#d08a00', tinta: '#8a5a00', fondo: 'rgba(208, 138, 0, 0.13)' },
            ]}
          />
        </div>
      )}

      {esAdmin && envioAutomatico !== null && (
        <Card>
          <div className={styles.configArchivos}>
            <p className={styles.configArchivosTitulo}>Envío automático al guardar, por tipo de aplicación</p>
            <div className={styles.configArchivosFilas}>
              {tiposAplicacion.map((t) => {
                const propia = envioAutomatico.por_tipo?.[t.nombre]
                const activo = reglaVigente(t.nombre)
                return (
                  <div className={styles.configArchivosFila} key={t.id}>
                    <span className={styles.configArchivosNombre}>{t.nombre}</span>
                    <button
                      type="button"
                      onClick={() => setReglaACambiar({ tipo: t.nombre })}
                      className={`${styles.toggle} ${activo ? styles.toggleOn : styles.toggleOff}`}
                      title={`${activo ? 'Desactivar' : 'Activar'} envío automático de ${t.nombre}`}
                      aria-label={`Envío automático de ${t.nombre}`}
                      aria-pressed={activo}
                    >
                      <span className={styles.toggleCirculo} />
                    </button>
                    <span className={styles.configArchivosEstado}>
                      {activo
                        ? 'Al guardar se envía de inmediato por correo'
                        : 'Al guardar queda pendiente — se envía manualmente'}
                      {propia === undefined && ' (según la regla general)'}
                    </span>
                  </div>
                )
              })}
              <div className={styles.configArchivosFila}>
                <span className={styles.configArchivosNombre}>General</span>
                <button
                  type="button"
                  onClick={() => setReglaACambiar({ tipo: null })}
                  className={`${styles.toggle} ${envioAutomatico.activo ? styles.toggleOn : styles.toggleOff}`}
                  title={envioAutomatico.activo ? 'Desactivar la regla general' : 'Activar la regla general'}
                  aria-label="Envío automático general"
                  aria-pressed={envioAutomatico.activo}
                >
                  <span className={styles.toggleCirculo} />
                </button>
                <span className={styles.configArchivosEstado}>
                  Rige para los tipos sin regla propia y para solicitudes sin tipo
                </span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {modalAbierto && (
        <div className={styles.overlay}>
          <div className={styles.modalCambio}>
            <p className={styles.modalTitulo}>
              {reglaVigente(reglaACambiar?.tipo ?? null) ? 'Desactivar' : 'Activar'} envío automático
              {reglaACambiar?.tipo ? ` — ${reglaACambiar.tipo}` : ' — regla general'}
            </p>
            <p className={styles.modalDescripcion}>
              {reglaVigente(reglaACambiar?.tipo ?? null)
                ? 'Estas solicitudes quedarán pendientes hasta que las envíes manualmente.'
                : 'Estas solicitudes se enviarán por correo al momento de guardarlas.'}
              {' '}Ingresa tu contraseña para confirmar.
            </p>
            <input
              ref={inputPasswordRef}
              type="password"
              className={styles.modalInput}
              placeholder="Tu contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void confirmarCambio()}
            />
            {errorModal && <p className={styles.modalError}>{errorModal}</p>}
            <div className={styles.modalAcciones}>
              <button
                type="button"
                className={styles.modalBotonCancelar}
                onClick={() => setReglaACambiar(null)}
                disabled={guardando}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.modalBotonConfirmar}
                onClick={() => void confirmarCambio()}
                disabled={guardando || !password}
              >
                {guardando ? 'Guardando…' : 'Confirmar cambio'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Card>
        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.cabeceraTabla}>
          <p className={styles.contador}>
            {solicitudesFiltradas
              ? `${solicitudesFiltradas.length} de ${solicitudes?.length ?? 0}`
              : '…'}{' '}
            solicitud
            {(solicitudesFiltradas?.length ?? 0) === 1 ? '' : 'es'}
          </p>
          <button
            type="button"
            className={styles.boton}
            onClick={() => setMostrarFiltros((m) => !m)}
          >
            {mostrarFiltros ? 'Ocultar filtros' : 'Mostrar filtros'}
          </button>
        </div>

        <div className={styles.barraBusqueda}>
          <input
            type="search"
            className={styles.buscador}
            placeholder="Buscar por N°, cliente, planta, especie, tipo…"
            value={filtros.busqueda}
            onChange={(e) => actualizarFiltro('busqueda', e.target.value)}
            aria-label="Buscar solicitudes"
          />
          <span className={styles.resumenEstados}>
            <span className={styles.chipEnviada}>{totalEnviadas} enviada{totalEnviadas === 1 ? '' : 's'}</span>
            <span className={styles.chipPendiente}>{totalPendientes} pendiente{totalPendientes === 1 ? '' : 's'}</span>
            {totalSinLista > 0 && (
              <span className={styles.chipSinLista}>{totalSinLista} sin lista de distribución</span>
            )}
          </span>
        </div>

        {seleccionadas.size > 0 && (
          <div className={styles.barraSeleccion} role="region" aria-label="Acciones sobre la selección">
            <strong className={styles.contadorSel}>
              {seleccionadas.size} seleccionada{seleccionadas.size === 1 ? '' : 's'}
            </strong>
            <span className={styles.detalleSel}>
              {filasSeleccionadas.length - pendientesSel.length} enviada{filasSeleccionadas.length - pendientesSel.length === 1 ? '' : 's'} · {pendientesSel.length} pendiente{pendientesSel.length === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              className={styles.botonBarra}
              disabled={trabajando !== null}
              onClick={() => void correr('pdf', () => descargarPdfsZip(archivosParaPdf))}
            >
              {trabajando === 'pdf' ? 'Generando PDF…' : 'Descargar PDF (.zip)'}
            </button>
            <button
              type="button"
              className={styles.botonBarra}
              disabled={trabajando !== null}
              onClick={() => void correr('excel', () => descargarTodasLasSolicitudes([...seleccionadas]))}
            >
              Descargar Excel
            </button>
            <button
              type="button"
              className={styles.botonBarra}
              disabled={trabajando !== null || pendientesSel.length === 0}
              onClick={() => void enviarPendientes()}
            >
              {trabajando === 'enviar' ? 'Enviando…' : `Enviar pendientes (${pendientesSel.length})`}
            </button>
            {archivosVisibles.length > seleccionadas.size && (
              <button type="button" className={styles.botonBarraSuave} onClick={() => setSeleccionadas(new Set(archivosVisibles))}>
                Seleccionar las {archivosVisibles.length} visibles
              </button>
            )}
            <button type="button" className={styles.botonBarraSuave} onClick={() => setSeleccionadas(new Set())}>
              Quitar selección
            </button>
          </div>
        )}
        {avisoMasivo && <p className={styles.avisoMasivo} role="status">{avisoMasivo}</p>}

        {mostrarFiltros && (
          <div className={styles.filtros}>
            <label className={styles.campoFiltro}>
              <span>Fecha desde</span>
              <input
                type="date"
                value={filtros.fechaDesde}
                onChange={(e) => actualizarFiltro('fechaDesde', e.target.value)}
              />
            </label>
            <label className={styles.campoFiltro}>
              <span>Fecha hasta</span>
              <input
                type="date"
                value={filtros.fechaHasta}
                onChange={(e) => actualizarFiltro('fechaHasta', e.target.value)}
              />
            </label>
            <label className={styles.campoFiltro}>
              <span>N° Solicitud</span>
              <input
                value={filtros.numeroSolicitud}
                onChange={(e) => actualizarFiltro('numeroSolicitud', e.target.value)}
              />
            </label>
            <label className={styles.campoFiltro}>
              <span>Laboratorio</span>
              <select
                value={filtros.laboratorio}
                onChange={(e) => actualizarFiltro('laboratorio', e.target.value)}
              >
                <option value="">Todos</option>
                {opciones.laboratorio.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.campoFiltro}>
              <span>Tipo de Aplicación</span>
              <select
                value={filtros.tipoAplicacion}
                onChange={(e) => actualizarFiltro('tipoAplicacion', e.target.value)}
              >
                <option value="">Todos</option>
                {opciones.tipoAplicacion.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.campoFiltro}>
              <span>Línea de Proceso</span>
              <select
                value={filtros.lineaProceso}
                onChange={(e) => actualizarFiltro('lineaProceso', e.target.value)}
              >
                <option value="">Todas</option>
                {opciones.lineaProceso.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.campoFiltro}>
              <span>Solicitante</span>
              <input
                value={filtros.solicitante}
                onChange={(e) => actualizarFiltro('solicitante', e.target.value)}
              />
            </label>
            <label className={styles.campoFiltro}>
              <span>Sold To</span>
              <select
                value={filtros.soldTo}
                onChange={(e) => actualizarFiltro('soldTo', e.target.value)}
              >
                <option value="">Todos</option>
                {opciones.soldTo.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.campoFiltro}>
              <span>Ship To</span>
              <select
                value={filtros.shipTo}
                onChange={(e) => actualizarFiltro('shipTo', e.target.value)}
              >
                <option value="">Todos</option>
                {opciones.shipTo.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.campoFiltro}>
              <span>Especie</span>
              <input
                value={filtros.especie}
                onChange={(e) => actualizarFiltro('especie', e.target.value)}
              />
            </label>
            <label className={styles.campoFiltro}>
              <span>Variedad</span>
              <input
                value={filtros.variedad}
                onChange={(e) => actualizarFiltro('variedad', e.target.value)}
              />
            </label>
            <label className={styles.campoFiltro}>
              <span>Tipo Muestra</span>
              <input
                value={filtros.tipoMuestra}
                onChange={(e) => actualizarFiltro('tipoMuestra', e.target.value)}
              />
            </label>
            <label className={styles.campoFiltro}>
              <span>Nombre Muestreador</span>
              <input
                value={filtros.nombreMuestreador}
                onChange={(e) => actualizarFiltro('nombreMuestreador', e.target.value)}
              />
            </label>
            <label className={styles.campoFiltro}>
              <span>Estado</span>
              <select
                value={filtros.estado}
                onChange={(e) =>
                  setFiltros((f) => ({ ...f, estado: e.target.value as Filtros['estado'] }))
                }
              >
                <option value="">Todos</option>
                <option value="enviado">Enviada</option>
                <option value="pendiente">Pendiente</option>
                <option value="sin_lista">Sin lista de distribución</option>
              </select>
            </label>
            <label className={styles.campoFiltro}>
              <span>Solicitudes de prueba</span>
              <select
                value={filtros.prueba}
                onChange={(e) =>
                  setFiltros((f) => ({ ...f, prueba: e.target.value as Filtros['prueba'] }))
                }
              >
                <option value="">Todas</option>
                <option value="solo">Solo de prueba</option>
                <option value="sin">Sin las de prueba</option>
              </select>
            </label>
            {hayFiltrosActivos && (
              <button
                type="button"
                className={styles.botonLimpiar}
                onClick={() => setFiltros(FILTROS_VACIOS)}
              >
                Limpiar filtros
              </button>
            )}
          </div>
        )}

        {solicitudesFiltradas === null ? (
          <p className={styles.estado}>Cargando…</p>
        ) : solicitudesFiltradas.length === 0 ? (
          <p className={styles.estado}>
            {hayFiltrosActivos
              ? 'Ninguna solicitud coincide con los filtros.'
              : 'Todavía no hay solicitudes registradas.'}
          </p>
        ) : (
          <div className={styles.contenedorListado}>
            <div className={styles.tablaCaja}>
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
                    <th>N° Solicitud</th>
                    <th>Fecha</th>
                    <th>Laboratorio</th>
                    <th>Sold To</th>
                    <th>Ship To</th>
                    <th>Especie</th>
                    <th>Tipo Aplicación</th>
                    <th>Tipo Muestra</th>
                    <th>Generado por</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {solicitudesFiltradas.map((s, idx) => (
                    <tr
                      key={s.archivo}
                      style={{ '--n': idx } as CSSProperties}
                      className={[
                        s.enviada ? styles.filaEnviada : '',
                        seleccionadas.has(s.archivo) ? styles.filaSeleccionada : '',
                      ].filter(Boolean).join(' ') || undefined}
                    >
                      <td className={styles.colCheck} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className={styles.checkbox}
                          checked={seleccionadas.has(s.archivo)}
                          onChange={() => toggleUna(s.archivo)}
                          aria-label={`Seleccionar ${s.numero_solicitud}`}
                        />
                      </td>
                      <td className={styles.nombre}>
                        {s.numero_solicitud}
                        {s.es_prueba && <span className={styles.etiquetaPrueba}>PRUEBA</span>}
                      </td>
                      <td>{formatDateCL(s.fecha_solicitud)}</td>
                      <td>
                        <span className={styles.etiquetaLaboratorio}>{s.laboratorio}</span>
                      </td>
                      <td>{s.sold_to}</td>
                      <td>{s.ship_to ?? '—'}</td>
                      <td>{s.especie ?? '—'}</td>
                      <td>{s.campos_laboratorio['Tipo Aplicación'] ?? '—'}</td>
                      <td>{s.tipo_muestra ?? '—'}</td>
                      <td>{s.generado_por}</td>
                      <td>
                        <EstadoSolicitud s={s} />
                      </td>
                      <td className={styles.acciones}>
                        <button
                          className={styles.boton}
                          onClick={() => navigate(rutaTomaMuestrasDetalle(s.archivo))}
                        >
                          Ver
                        </button>
                        {puedeEliminar && (
                          <button className={styles.botonEliminar} onClick={() => onEliminar(s)}>
                            Eliminar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={styles.tarjetas}>
              {solicitudesFiltradas.map((s) => (
                <div
                  className={[
                    styles.tarjeta,
                    s.enviada ? styles.tarjetaEnviada : '',
                    seleccionadas.has(s.archivo) ? styles.tarjetaSeleccionada : '',
                  ].filter(Boolean).join(' ')}
                  key={s.archivo}
                >
                  <div className={styles.tarjetaCabecera}>
                    <div className={styles.tarjetaCabeceraIzq}>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={seleccionadas.has(s.archivo)}
                        onChange={() => toggleUna(s.archivo)}
                        aria-label={`Seleccionar ${s.numero_solicitud}`}
                      />
                      <div>
                        <div className={styles.tarjetaId}>
                          {s.numero_solicitud}
                          {s.es_prueba && <span className={styles.etiquetaPrueba}>PRUEBA</span>}
                        </div>
                        <div className={styles.tarjetaFecha}>{formatDateCL(s.fecha_solicitud)}</div>
                      </div>
                    </div>
                    <span className={styles.etiquetaLaboratorio}>{s.laboratorio}</span>
                    <EstadoSolicitud s={s} />
                  </div>
                  <div className={styles.tarjetaGrilla}>
                    <div>
                      <span className={styles.tarjetaLabel}>Sold To</span>
                      <span className={styles.tarjetaValor}>{s.sold_to}</span>
                    </div>
                    <div>
                      <span className={styles.tarjetaLabel}>Ship To</span>
                      <span className={styles.tarjetaValor}>{s.ship_to ?? '—'}</span>
                    </div>
                    <div>
                      <span className={styles.tarjetaLabel}>Especie</span>
                      <span className={styles.tarjetaValor}>{s.especie ?? '—'}</span>
                    </div>
                    <div>
                      <span className={styles.tarjetaLabel}>Tipo muestra</span>
                      <span className={styles.tarjetaValor}>{s.tipo_muestra ?? '—'}</span>
                    </div>
                  </div>
                  <div className={styles.tarjetaPie}>
                    <button
                      className={styles.botonTarjetaVer}
                      onClick={() => navigate(rutaTomaMuestrasDetalle(s.archivo))}
                    >
                      Ver
                    </button>
                    {puedeEliminar && (
                      <button className={styles.botonTarjetaEliminar} onClick={() => onEliminar(s)}>
                        Eliminar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
