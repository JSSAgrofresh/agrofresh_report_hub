import { useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/features/auth'
import { esAdminGeneral } from '@/features/usuarios'
import {
  demoraDias,
  editarFechaEnvio,
  estadoDe,
  fechaHora,
  ordenarSolicitudes,
  paraInputFechaHora,
  porSemana,
  rutaPdfInforme,
  soloFecha,
  solicitudesACsv,
  topClientes,
  totales,
  useSolicitudesAuditoria,
} from '@/features/auditoriaInterna'
import type { CampoOrden, EstadoSolicitud, Sentido, SolicitudAuditoria } from '@/features/auditoriaInterna'
import { descargarArchivo } from '@/services/http/descargar'
import { AvanceInformes, Indicador } from './AvanceInformes'
import { ESTADOS, ORDEN_ESTADOS } from './estados'
import { GraficoClientes, GraficoSemanas, TarjetaGrafico } from './Graficos'
import { IconoActualizar, IconoAlerta, IconoBuscar, IconoCerrar, IconoExcel, IconoFlecha, IconoLapiz, IconoPdf } from './iconos'
import { Modal } from './Modal'
import styles from './SolicitudesInformesView.module.css'

const POR_PAGINA = 100
const nf = new Intl.NumberFormat('es-CL')
const nd = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 })

function tieneSinEnvio(s: SolicitudAuditoria) {
  return s.informe !== null && !s.informe.fecha_envio
}

function IconoInforme({ s, onEditar }: { s: SolicitudAuditoria; onEditar?: () => void }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const informe = s.informe
  if (!informe) return <span className={styles.vacioCelda}>—</span>

  // position: fixed: la tabla tiene scroll propio y un absolute se cortaría.
  function mostrar(el: HTMLElement) {
    const r = el.getBoundingClientRect()
    const abajo = r.bottom + 8
    setPos({
      x: Math.max(8, Math.min(r.right - 292, window.innerWidth - 300)),
      y: abajo + 130 > window.innerHeight ? r.top - 130 : abajo,
    })
  }

  return (
    <span className={styles.acciones}>
      <button
        type="button"
        className={styles.botonIcono}
        aria-label={`Descargar informe de ${s.numero_solicitud ?? s.archivo}`}
        onMouseEnter={(e) => mostrar(e.currentTarget)}
        onMouseLeave={() => setPos(null)}
        onFocus={(e) => mostrar(e.currentTarget)}
        onBlur={() => setPos(null)}
        onClick={() => void descargarArchivo(rutaPdfInforme(informe.id), informe.nombre_archivo)}
      >
        <IconoPdf />
      </button>
      {onEditar && (
        <button type="button" className={`${styles.botonIcono} ${styles.suave}`} onClick={onEditar} aria-label="Editar fecha de envío" title="Editar fecha de envío">
          <IconoLapiz width={15} height={15} />
        </button>
      )}
      {pos && (
        <span role="tooltip" className={styles.tooltip} style={{ left: pos.x, top: pos.y }}>
          <strong>{informe.nombre_archivo}</strong>
          <span><em>Emitida</em><b>{fechaHora(s.emitida_en)}</b></span>
          <span><em>Cargada</em><b>{fechaHora(informe.cargado_en)}</b></span>
          <span>
            <em>Enviada</em>
            {informe.fecha_envio ? <b>{fechaHora(informe.fecha_envio)}</b> : <b className={styles.faltante}>sin fecha de envío</b>}
          </span>
        </span>
      )}
    </span>
  )
}

function ModalFechaEnvio({
  s,
  onCerrar,
  onGuardado,
}: {
  s: SolicitudAuditoria
  onCerrar: () => void
  onGuardado: (informeId: number, fechaEnvio: string | null) => void
}) {
  const informe = s.informe
  const [valor, setValor] = useState(paraInputFechaHora(informe?.fecha_envio))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!informe) return null

  async function guardar(e: FormEvent | null, vaciar = false) {
    e?.preventDefault()
    if (!informe) return
    setGuardando(true)
    setError(null)
    try {
      // El input entrega hora local del navegador (Chile); se manda como
      // instante exacto para que el backend no tenga que adivinar la zona.
      const iso = !vaciar && valor ? new Date(valor).toISOString() : null
      const r = await editarFechaEnvio(informe.id, iso)
      onGuardado(informe.id, r.fecha_envio)
      onCerrar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
      setGuardando(false)
    }
  }

  return (
    <Modal
      titulo="Fecha y hora de envío"
      subtitulo={`${s.numero_solicitud ?? s.archivo} · ${informe.nombre_archivo}`}
      onCerrar={onCerrar}
      pie={
        <>
          <Button type="button" variant="ghost" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
          <Button type="button" variant="secondary" onClick={() => void guardar(null, true)} disabled={guardando || !informe.fecha_envio}>
            Quitar fecha
          </Button>
          <Button type="button" onClick={() => void guardar(null)} disabled={guardando || !valor}>Guardar</Button>
        </>
      }
    >
      <form onSubmit={(e) => void guardar(e)} className={styles.formModal}>
        <label>
          <span>Cuándo se envió el informe (hora de Chile)</span>
          <input type="datetime-local" value={valor} onChange={(e) => setValor(e.target.value)} />
        </label>
        {error && <p className={styles.error} role="alert">{error}</p>}
      </form>
    </Modal>
  )
}

const COLUMNAS: { campo: CampoOrden; titulo: string; numerica?: boolean }[] = [
  { campo: 'numero', titulo: 'Solicitud' },
  { campo: 'laboratorio', titulo: 'Laboratorio' },
  { campo: 'cliente', titulo: 'Cliente / Planta' },
  { campo: 'emitida', titulo: 'Emitida' },
  { campo: 'cargada', titulo: 'Cargada' },
  { campo: 'enviada', titulo: 'Enviada' },
  { campo: 'demora', titulo: 'Demora', numerica: true },
  { campo: 'estado', titulo: 'Estado' },
]

export function SolicitudesInformesView() {
  const { user } = useAuth()
  const puedeEditar = user ? esAdminGeneral(user) : false
  const { datos: todas, setDatos, error, cargando, refrescar } = useSolicitudesAuditoria()

  const [laboratorio, setLaboratorio] = useState('')
  const [texto, setTexto] = useState('')
  const [sinEnvio, setSinEnvio] = useState(false)
  const [estado, setEstado] = useState<EstadoSolicitud | ''>('')
  const [orden, setOrden] = useState<{ campo: CampoOrden; sentido: Sentido }>({ campo: 'emitida', sentido: 'desc' })
  const [visibles, setVisibles] = useState(POR_PAGINA)
  const [editando, setEditando] = useState<SolicitudAuditoria | null>(null)
  const tablaRef = useRef<HTMLElement>(null)

  const laboratorios = useMemo(
    () => [...new Set((todas ?? []).map((s) => s.laboratorio).filter((l): l is string => Boolean(l)))].sort((a, b) => a.localeCompare(b, 'es')),
    [todas],
  )

  // Lo que alcanzan los filtros de arriba (laboratorio, texto, sin envío): scopea TODO lo de abajo.
  const alcance = useMemo(() => {
    const q = texto.trim().toLowerCase()
    return (todas ?? []).filter((s) => {
      if (laboratorio && s.laboratorio !== laboratorio) return false
      if (sinEnvio && !tieneSinEnvio(s)) return false
      if (!q) return true
      return [s.numero_solicitud, s.sold_to, s.ship_to, s.especie, s.informe?.nro_informe, s.informe?.nombre_archivo]
        .some((v) => (v ?? '').toLowerCase().includes(q))
    })
  }, [todas, laboratorio, texto, sinEnvio])

  const tot = useMemo(() => totales(alcance), [alcance])
  const semanas = useMemo(() => porSemana(alcance), [alcance])
  const clientes = useMemo(() => topClientes(alcance), [alcance])
  const sinFechaEnvio = useMemo(() => (todas ?? []).filter((s) => (!laboratorio || s.laboratorio === laboratorio) && tieneSinEnvio(s)).length, [todas, laboratorio])

  // El filtro por estado es solo de la tabla (sus conteos salen del alcance).
  const filas = useMemo(
    () => ordenarSolicitudes(estado ? alcance.filter((s) => estadoDe(s) === estado) : alcance, orden.campo, orden.sentido),
    [alcance, estado, orden],
  )

  const hayFiltros = Boolean(laboratorio || texto || sinEnvio || estado)
  const limpiar = () => {
    setLaboratorio('')
    setTexto('')
    setSinEnvio(false)
    setEstado('')
    setVisibles(POR_PAGINA)
  }
  const cambiar = <T,>(fijar: (v: T) => void) => (v: T) => {
    fijar(v)
    setVisibles(POR_PAGINA)
  }

  function elegirEstado(e: EstadoSolicitud | '') {
    cambiar(setEstado)(e)
    if (e) tablaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function ordenarPor(campo: CampoOrden) {
    setOrden((o) => (o.campo === campo ? { campo, sentido: o.sentido === 'asc' ? 'desc' : 'asc' } : { campo, sentido: campo === 'emitida' || campo === 'cargada' || campo === 'enviada' ? 'desc' : 'asc' }))
  }

  function exportar() {
    const url = URL.createObjectURL(new Blob([solicitudesACsv(filas)], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `auditoria_solicitudes_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function fechaGuardada(informeId: number, fechaEnvio: string | null) {
    setDatos((prev) =>
      (prev ?? []).map((s) => (s.informe?.id === informeId ? { ...s, informe: { ...s.informe, fecha_envio: fechaEnvio } } : s)),
    )
  }

  const primeraCarga = !todas && !error

  return (
    <div className={styles.pagina}>
      <Header
        title="Solicitudes e informes"
        description="Las solicitudes que emitimos y cuáles ya están concretadas: con su PDF guardado y sus resultados en Report."
        acciones={
          <Button variant="secondary" onClick={refrescar} disabled={cargando} className={styles.botonActualizar}>
            <IconoActualizar className={cargando ? styles.girando : undefined} width={16} height={16} />
            {cargando ? 'Actualizando…' : 'Actualizar'}
          </Button>
        }
      />

      {error && (
        <div className={styles.errorCaja} role="alert">
          <IconoAlerta />
          <span>{error}</span>
          <Button variant="secondary" onClick={refrescar}>Reintentar</Button>
        </div>
      )}

      {primeraCarga && (
        <div className={styles.resumen} aria-busy="true">
          <div className={styles.esqueleto}><Skeleton style={{ width: '40%', height: 56 }} /><Skeleton style={{ width: '100%', height: 12 }} /><Skeleton style={{ width: '70%', height: 20 }} /></div>
          <div className={styles.indicadores}>{[0, 1, 2].map((i) => <div key={i} className={styles.esqueleto}><Skeleton style={{ width: '55%', height: 14 }} /><Skeleton style={{ width: '35%', height: 30 }} /></div>)}</div>
        </div>
      )}

      {todas && (
        <div className={cargando ? styles.recargando : undefined}>
          <div className={styles.filtros} role="search">
            <label className={styles.buscar}>
              <IconoBuscar className={styles.lupa} width={16} height={16} />
              <input
                type="search"
                placeholder="Buscar OT, cliente, planta o N° de informe…"
                aria-label="Buscar"
                value={texto}
                onChange={(e) => cambiar(setTexto)(e.target.value)}
              />
            </label>
            <label className={styles.campo}>
              <span>Laboratorio</span>
              <select value={laboratorio} onChange={(e) => cambiar(setLaboratorio)(e.target.value)}>
                <option value="">Todos</option>
                {laboratorios.map((l) => <option key={l}>{l}</option>)}
              </select>
            </label>
            <button type="button" className={`${styles.chip} ${sinEnvio ? styles.chipActivo : ''}`} aria-pressed={sinEnvio} onClick={() => cambiar(setSinEnvio)(!sinEnvio)}>
              Sin fecha de envío
            </button>
            {hayFiltros && (
              <button type="button" className={styles.limpiar} onClick={limpiar}>
                <IconoCerrar width={14} height={14} /> Limpiar filtros
              </button>
            )}
          </div>

          {tot.emitidas === 0 ? (
            <div className={styles.vacio}>
              <IconoBuscar width={28} height={28} />
              <h3>{todas.length === 0 ? 'Aún no hay solicitudes emitidas' : 'Nada coincide con los filtros'}</h3>
              <p>{todas.length === 0 ? 'Cuando se emitan solicitudes desde Toma de muestras, aparecerán acá.' : 'Prueba con otra búsqueda o limpia los filtros.'}</p>
              {hayFiltros && <Button variant="secondary" onClick={limpiar}>Limpiar filtros</Button>}
            </div>
          ) : (
            <>
              <div className={styles.resumen}>
                <AvanceInformes totales={tot} activo={estado} onElegir={elegirEstado} />
                <div className={styles.indicadores}>
                  <Indicador etiqueta="Solicitudes emitidas" valor={nf.format(tot.emitidas)} sub={hayFiltros ? 'con los filtros actuales' : 'en total'} />
                  <Indicador
                    etiqueta="Demora promedio"
                    valor={tot.demoraPromedioDias === null ? '—' : `${nd.format(tot.demoraPromedioDias)} d`}
                    sub="entre emitir y cargar el informe"
                  />
                  <Indicador
                    etiqueta="Sin fecha de envío"
                    valor={nf.format(sinFechaEnvio)}
                    sub={sinFechaEnvio ? 'informes por completar — clic para verlos' : 'todos los informes la tienen'}
                    alerta={sinFechaEnvio > 0}
                    onClick={sinFechaEnvio || sinEnvio ? () => cambiar(setSinEnvio)(!sinEnvio) : undefined}
                    activo={sinEnvio}
                  />
                </div>
              </div>

              <div className={styles.graficos}>
                <TarjetaGrafico
                  titulo="Solicitudes por semana"
                  subtitulo="Emitidas cada semana y en qué estado están hoy"
                  alto={260}
                  tabla={{
                    columnas: ['Semana', 'Emitidas', 'Concretadas', 'PDF sin Report', 'Pendientes'],
                    filas: semanas.map((p) => [p.etiqueta, p.emitidas, p.concretadas, p.sinReport, p.pendientes]),
                  }}
                >
                  <GraficoSemanas puntos={semanas} />
                </TarjetaGrafico>
                <TarjetaGrafico
                  titulo="Top clientes con solicitudes"
                  subtitulo="Los 10 clientes con más solicitudes emitidas"
                  alto={Math.max(180, clientes.length * 34 + 40)}
                  tabla={{
                    columnas: ['Cliente', 'Solicitudes', 'Concretadas', 'PDF sin Report', 'Pendientes'],
                    filas: clientes.map((c) => [c.cliente, c.solicitudes, c.concretadas, c.sinReport, c.pendientes]),
                  }}
                >
                  <GraficoClientes clientes={clientes} />
                </TarjetaGrafico>
              </div>

              <section className={styles.tablaCard} ref={tablaRef} aria-label="Detalle de solicitudes">
                <header className={styles.tablaCab}>
                  <div className={styles.segmentado} role="group" aria-label="Filtrar por estado">
                    <button type="button" aria-pressed={estado === ''} className={estado === '' ? styles.segActivo : ''} onClick={() => cambiar(setEstado)('')}>
                      Todas <span>{nf.format(alcance.length)}</span>
                    </button>
                    {ORDEN_ESTADOS.map((e) => (
                      <button key={e} type="button" aria-pressed={estado === e} className={estado === e ? styles.segActivo : ''} onClick={() => cambiar(setEstado)(estado === e ? '' : e)}>
                        <i style={{ background: ESTADOS[e].color }} />
                        {ESTADOS[e].texto} <span>{nf.format(e === 'concretada' ? tot.concretadas : e === 'sin_report' ? tot.sinReport : tot.pendientes)}</span>
                      </button>
                    ))}
                  </div>
                  <div className={styles.tablaAcciones}>
                    <span className={styles.conteo}>Mostrando {nf.format(Math.min(visibles, filas.length))} de {nf.format(filas.length)}</span>
                    <Button variant="secondary" onClick={exportar} disabled={filas.length === 0} className={styles.botonActualizar}>
                      <IconoExcel width={16} height={16} /> Exportar CSV
                    </Button>
                  </div>
                </header>

                <div className={styles.tablaScroll}>
                  <table className={styles.tabla}>
                    <thead>
                      <tr>
                        {COLUMNAS.map((c) => (
                          <th
                            key={c.campo}
                            className={c.numerica ? styles.num : undefined}
                            aria-sort={orden.campo === c.campo ? (orden.sentido === 'asc' ? 'ascending' : 'descending') : 'none'}
                          >
                            <button type="button" onClick={() => ordenarPor(c.campo)} className={orden.campo === c.campo ? styles.ordenActivo : ''}>
                              {c.titulo}
                              <IconoFlecha sentido={orden.campo === c.campo ? orden.sentido : null} />
                            </button>
                          </th>
                        ))}
                        <th className={styles.colInforme}>Informe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filas.slice(0, visibles).map((s) => {
                        const e = ESTADOS[estadoDe(s)]
                        const demora = demoraDias(s)
                        return (
                          <tr key={s.archivo}>
                            <td className={styles.mono}>{s.numero_solicitud ?? '—'}</td>
                            <td>{s.laboratorio ?? '—'}</td>
                            <td>
                              <span className={styles.cliente}>{s.sold_to ?? '—'}</span>
                              {s.ship_to && <span className={styles.planta}>{s.ship_to}</span>}
                            </td>
                            <td className={styles.fecha}>{soloFecha(s.emitida_en ?? s.fecha_solicitud)}</td>
                            <td className={styles.fecha}>{s.informe ? soloFecha(s.informe.cargado_en) : '—'}</td>
                            <td className={styles.fecha}>
                              {!s.informe ? '—' : s.informe.fecha_envio ? fechaHora(s.informe.fecha_envio) : <span className={styles.faltante}>Sin fecha</span>}
                            </td>
                            <td className={`${styles.num} ${styles.fecha}`}>{demora === null ? '—' : `${demora} d`}</td>
                            <td>
                              <span className={styles.pastilla} style={{ background: e.fondo, color: e.tinta }} title={e.descripcion}>
                                <i style={{ background: e.color }} />
                                {e.corto}
                              </span>
                            </td>
                            <td className={styles.colInforme}>
                              <IconoInforme s={s} onEditar={puedeEditar && s.informe ? () => setEditando(s) : undefined} />
                            </td>
                          </tr>
                        )
                      })}
                      {filas.length === 0 && (
                        <tr><td colSpan={COLUMNAS.length + 1} className={styles.sinFilas}>No hay solicitudes en este estado.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {filas.length > visibles && (
                  <div className={styles.masFila}>
                    <Button variant="secondary" onClick={() => setVisibles((v) => v + POR_PAGINA)}>
                      Mostrar más ({nf.format(filas.length - visibles)} restantes)
                    </Button>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      )}

      {editando && <ModalFechaEnvio s={editando} onCerrar={() => setEditando(null)} onGuardado={fechaGuardada} />}
    </div>
  )
}
