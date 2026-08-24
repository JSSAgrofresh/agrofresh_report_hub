import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/features/auth'
import { esAdminGeneral } from '@/features/usuarios'
import { ROUTES, rutaTomaMuestrasDetalle } from '@/constants/routes'
import { formatDateCL } from '@/lib/locale'
import { eliminarSolicitud, listarSolicitudes, urlExportarTodasLasSolicitudes } from '@/features/tomaMuestras'
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
}

function contiene(valor: string | null | undefined, buscado: string): boolean {
  return (valor ?? '').toLowerCase().includes(buscado.toLowerCase())
}

export function SolicitudesView() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const puedeEliminar = Boolean(user && esAdminGeneral(user))

  const [solicitudes, setSolicitudes] = useState<Solicitud[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS)
  const [mostrarFiltros, setMostrarFiltros] = useState(false)

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
    if (!confirm(`¿Eliminar la solicitud "${solicitud.numero_solicitud}"? Esta acción no se puede deshacer.`)) return
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
      if (filtros.numeroSolicitud && !contiene(s.numero_solicitud, filtros.numeroSolicitud)) return false
      if (filtros.laboratorio && s.laboratorio !== filtros.laboratorio) return false
      if (filtros.solicitante && !contiene(s.solicitante, filtros.solicitante)) return false
      if (filtros.soldTo && s.sold_to !== filtros.soldTo) return false
      if (filtros.shipTo && s.ship_to !== filtros.shipTo) return false
      if (filtros.especie && !contiene(s.especie, filtros.especie)) return false
      if (filtros.variedad && !contiene(s.variedad, filtros.variedad)) return false
      if (filtros.tipoAplicacion && s.campos_laboratorio['Tipo Aplicación'] !== filtros.tipoAplicacion) return false
      if (filtros.lineaProceso && s.linea_proceso !== filtros.lineaProceso) return false
      if (filtros.tipoMuestra && !contiene(s.tipo_muestra, filtros.tipoMuestra)) return false
      if (filtros.nombreMuestreador && !contiene(s.nombre_muestreador, filtros.nombreMuestreador)) return false
      return true
    })
  }, [solicitudes, filtros])

  return (
    <div>
      <Header
        title="Solicitudes de muestreo"
        description="Listado de todas las solicitudes registradas."
        acciones={
          <div className={styles.accionesCabecera}>
            <a className={styles.botonDescargaTodas} href={urlExportarTodasLasSolicitudes()} target="_blank" rel="noreferrer">
              Descargar todas las solicitudes
            </a>
            <Button onClick={() => navigate(ROUTES.tomaMuestrasNueva)}>+ Nueva solicitud</Button>
          </div>
        }
      />

      <Card>
        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.cabeceraTabla}>
          <p className={styles.contador}>
            {solicitudesFiltradas ? `${solicitudesFiltradas.length} de ${solicitudes?.length ?? 0}` : '…'} solicitud
            {(solicitudesFiltradas?.length ?? 0) === 1 ? '' : 'es'}
          </p>
          <button type="button" className={styles.boton} onClick={() => setMostrarFiltros((m) => !m)}>
            {mostrarFiltros ? 'Ocultar filtros' : 'Mostrar filtros'}
          </button>
        </div>

        {mostrarFiltros && (
          <div className={styles.filtros}>
            <label className={styles.campoFiltro}>
              <span>Fecha desde</span>
              <input type="date" value={filtros.fechaDesde} onChange={(e) => actualizarFiltro('fechaDesde', e.target.value)} />
            </label>
            <label className={styles.campoFiltro}>
              <span>Fecha hasta</span>
              <input type="date" value={filtros.fechaHasta} onChange={(e) => actualizarFiltro('fechaHasta', e.target.value)} />
            </label>
            <label className={styles.campoFiltro}>
              <span>N° Solicitud</span>
              <input value={filtros.numeroSolicitud} onChange={(e) => actualizarFiltro('numeroSolicitud', e.target.value)} />
            </label>
            <label className={styles.campoFiltro}>
              <span>Laboratorio</span>
              <select value={filtros.laboratorio} onChange={(e) => actualizarFiltro('laboratorio', e.target.value)}>
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
              <select value={filtros.tipoAplicacion} onChange={(e) => actualizarFiltro('tipoAplicacion', e.target.value)}>
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
              <select value={filtros.lineaProceso} onChange={(e) => actualizarFiltro('lineaProceso', e.target.value)}>
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
              <input value={filtros.solicitante} onChange={(e) => actualizarFiltro('solicitante', e.target.value)} />
            </label>
            <label className={styles.campoFiltro}>
              <span>Sold To</span>
              <select value={filtros.soldTo} onChange={(e) => actualizarFiltro('soldTo', e.target.value)}>
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
              <select value={filtros.shipTo} onChange={(e) => actualizarFiltro('shipTo', e.target.value)}>
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
              <input value={filtros.especie} onChange={(e) => actualizarFiltro('especie', e.target.value)} />
            </label>
            <label className={styles.campoFiltro}>
              <span>Variedad</span>
              <input value={filtros.variedad} onChange={(e) => actualizarFiltro('variedad', e.target.value)} />
            </label>
            <label className={styles.campoFiltro}>
              <span>Tipo Muestra</span>
              <input value={filtros.tipoMuestra} onChange={(e) => actualizarFiltro('tipoMuestra', e.target.value)} />
            </label>
            <label className={styles.campoFiltro}>
              <span>Nombre Muestreador</span>
              <input value={filtros.nombreMuestreador} onChange={(e) => actualizarFiltro('nombreMuestreador', e.target.value)} />
            </label>
            {hayFiltrosActivos && (
              <button type="button" className={styles.botonLimpiar} onClick={() => setFiltros(FILTROS_VACIOS)}>
                Limpiar filtros
              </button>
            )}
          </div>
        )}

        {solicitudesFiltradas === null ? (
          <p className={styles.estado}>Cargando…</p>
        ) : solicitudesFiltradas.length === 0 ? (
          <p className={styles.estado}>
            {hayFiltrosActivos ? 'Ninguna solicitud coincide con los filtros.' : 'Todavía no hay solicitudes registradas.'}
          </p>
        ) : (
          <div className={styles.tablaCaja}>
            <table className={styles.tabla}>
              <thead>
                <tr>
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
                  <tr key={s.archivo}>
                    <td className={styles.nombre}>{s.numero_solicitud}</td>
                    <td>{formatDateCL(s.fecha_solicitud)}</td>
                    <td>{s.laboratorio}</td>
                    <td>{s.sold_to}</td>
                    <td>{s.ship_to ?? '—'}</td>
                    <td>{s.especie ?? '—'}</td>
                    <td>{s.tipo_muestra ?? '—'}</td>
                    <td>{s.generado_por}</td>
                    <td className={styles.acciones}>
                      <button className={styles.boton} onClick={() => navigate(rutaTomaMuestrasDetalle(s.archivo))}>
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
        )}
      </Card>
    </div>
  )
}
