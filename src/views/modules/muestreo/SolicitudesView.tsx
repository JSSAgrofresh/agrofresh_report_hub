import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
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
} from '@/features/tomaMuestras'
import type { Solicitud } from '@/features/tomaMuestras'
import styles from './SolicitudesView.module.css'

interface Filtros {
  fechaDesde: string
  fechaHasta: string
  numeroSolicitud: string
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
  estado: '' | 'enviado' | 'pendiente'
}

const FILTROS_VACIOS: Filtros = {
  fechaDesde: '',
  fechaHasta: '',
  numeroSolicitud: '',
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
  const [error, setError] = useState<string | null>(null)
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS)
  const [mostrarFiltros, setMostrarFiltros] = useState(false)

  // Toggle de envío automático (solo visible para admin_general)
  const [envioAutomatico, setEnvioAutomatico] = useState<boolean | null>(null)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [password, setPassword] = useState('')
  const [errorModal, setErrorModal] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const inputPasswordRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!esAdmin) return
    obtenerEnvioAutomatico()
      .then((r) => setEnvioAutomatico(r.activo))
      .catch(() => {})
  }, [esAdmin])

  useEffect(() => {
    if (modalAbierto) {
      setPassword('')
      setErrorModal(null)
      setTimeout(() => inputPasswordRef.current?.focus(), 50)
    }
  }, [modalAbierto])

  async function confirmarCambio() {
    if (envioAutomatico === null) return
    setGuardando(true)
    setErrorModal(null)
    try {
      const res = await actualizarEnvioAutomatico(!envioAutomatico, password)
      setEnvioAutomatico(res.activo)
      setModalAbierto(false)
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
            <Button onClick={() => navigate(ROUTES.tomaMuestrasNueva)}>+ Nueva solicitud</Button>
          </div>
        }
      />

      {esAdmin && envioAutomatico !== null && (
        <Card>
          <div className={styles.configArchivos}>
            <p className={styles.configArchivosTitulo}>Comportamiento al guardar solicitudes</p>
            <div className={styles.configArchivosFilas}>
              <div className={styles.configArchivosFila}>
                <span className={styles.configArchivosNombre}>Envío automático</span>
                <button
                  type="button"
                  onClick={() => setModalAbierto(true)}
                  className={`${styles.toggle} ${envioAutomatico ? styles.toggleOn : styles.toggleOff}`}
                  title={envioAutomatico ? 'Desactivar envío automático' : 'Activar envío automático'}
                >
                  <span className={styles.toggleCirculo} />
                </button>
                <span className={styles.configArchivosEstado}>
                  {envioAutomatico
                    ? 'Al guardar se envía de inmediato por correo'
                    : 'Al guardar queda pendiente — se envía manualmente'}
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
              {envioAutomatico ? 'Desactivar' : 'Activar'} envío automático
            </p>
            <p className={styles.modalDescripcion}>
              {envioAutomatico
                ? 'Las solicitudes quedarán pendientes hasta que las envíes manualmente.'
                : 'Las solicitudes se enviarán por correo al momento de guardarlas.'}
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
                onClick={() => setModalAbierto(false)}
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
                    <th>Tipo Muestra</th>
                    <th>Generado por</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {solicitudesFiltradas.map((s) => (
                    <tr
                      key={s.archivo}
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
                      <td className={styles.nombre}>{s.numero_solicitud}</td>
                      <td>{formatDateCL(s.fecha_solicitud)}</td>
                      <td>
                        <span className={styles.etiquetaLaboratorio}>{s.laboratorio}</span>
                      </td>
                      <td>{s.sold_to}</td>
                      <td>{s.ship_to ?? '—'}</td>
                      <td>{s.especie ?? '—'}</td>
                      <td>{s.tipo_muestra ?? '—'}</td>
                      <td>{s.generado_por}</td>
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
                        <div className={styles.tarjetaId}>{s.numero_solicitud}</div>
                        <div className={styles.tarjetaFecha}>{formatDateCL(s.fecha_solicitud)}</div>
                      </div>
                    </div>
                    <span className={styles.etiquetaLaboratorio}>{s.laboratorio}</span>
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
