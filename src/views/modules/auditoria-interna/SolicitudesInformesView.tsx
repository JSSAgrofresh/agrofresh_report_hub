import { useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  IconoActualizar,
  IconoAlerta,
  IconoBuscar,
  IconoExcel,
  IconoFlecha,
  IconoLapiz,
  IconoPdf,
} from '@/components/ui/iconosAccion'
import { useAuth } from '@/features/auth'
import { esAdminGeneral } from '@/features/usuarios'
import {
  FILTROS_VACIOS,
  TIPO_ACTIMIST,
  TIPO_LINEA,
  contarFiltros,
  editarFechaEnvio,
  estadoDe,
  filtrarSolicitudes,
  opcionesDeFiltros,
  ordenarSolicitudes,
  porLaboratorio,
  porClienteYServicio,
  rutaPdfInforme,
  solicitudesACsv,
  tipoServicioDe,
  topClientesPorServicio,
  totales,
  useSolicitudesAuditoria,
} from '@/features/auditoriaInterna'
import type {
  CampoOrden,
  EstadoSolicitud,
  FiltrosSolicitudes,
  Sentido,
  SolicitudAuditoria,
} from '@/features/auditoriaInterna'
import { fechaHora, paraInputFechaHora } from '@/lib/fechaHoraChile'
import { descargarArchivo } from '@/services/http/descargar'
import { ESTADOS, ORDEN_ESTADOS } from './estados'
import {
  DonaLaboratorio,
  GraficoClienteServicio,
  GraficoTotalPorLaboratorio,
  LeyendaEstados,
  LeyendaTipos,
  TarjetaGrafico,
} from './Graficos'
import { altoClienteServicio } from './coloresTipo'
import { PanelFiltros } from './PanelFiltros'
import styles from './SolicitudesInformesView.module.css'

const POR_PAGINA = 100
const MAX_ANALITOS_VISIBLES = 4
const nf = new Intl.NumberFormat('es-CL')

type TipoGrafico = 'ambos' | typeof TIPO_ACTIMIST | typeof TIPO_LINEA
const TIPOS_GRAFICO: { valor: TipoGrafico; texto: string }[] = [
  { valor: 'ambos', texto: 'Ambos' },
  { valor: TIPO_ACTIMIST, texto: 'Actimist' },
  { valor: TIPO_LINEA, texto: 'Línea de proceso' },
]

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

const COLUMNAS: { campo: CampoOrden; titulo: string }[] = [
  { campo: 'laboratorio', titulo: 'Laboratorio' },
  { campo: 'solicitud', titulo: 'Solicitud' },
  { campo: 'informe', titulo: 'Informe' },
  { campo: 'cliente', titulo: 'Cliente / Planta' },
  { campo: 'tipo', titulo: 'Tipo de análisis' },
]

function Analitos({ codigos }: { codigos: string[] }) {
  if (codigos.length === 0) return <span className={styles.vacioCelda}>—</span>
  const visibles = codigos.slice(0, MAX_ANALITOS_VISIBLES)
  const resto = codigos.length - visibles.length
  return (
    <span className={styles.analitos} title={codigos.join(', ')}>
      {visibles.map((c) => <span key={c} className={styles.analito}>{c}</span>)}
      {resto > 0 && <span className={styles.analitoMas}>+{resto}</span>}
    </span>
  )
}

/** Concretada o no. Un informe que llegó pero aún no está en Report es «no»,
 * con el aviso de que es lo que hay que ir a revisar. */
function EstadoCelda({ s }: { s: SolicitudAuditoria }) {
  const e = estadoDe(s)
  const est = ESTADOS[e === 'concretada' ? 'concretada' : 'pendiente']
  return (
    <span className={styles.estadoCelda}>
      <span className={styles.pastilla} style={{ background: est.fondo, color: est.tinta }}>
        <i style={{ background: est.color }} />
        {est.corto}
      </span>
      {e === 'sin_report' && (
        <span className={styles.avisoReport} title={ESTADOS.sin_report.descripcion}>PDF sin Report</span>
      )}
    </span>
  )
}

export function SolicitudesInformesView() {
  const { user } = useAuth()
  const puedeEditar = user ? esAdminGeneral(user) : false
  const { datos: todas, setDatos, error, cargando, refrescar } = useSolicitudesAuditoria()

  const [filtros, setFiltros] = useState<FiltrosSolicitudes>({ ...FILTROS_VACIOS })
  const [orden, setOrden] = useState<{ campo: CampoOrden; sentido: Sentido }>({ campo: 'emitida', sentido: 'desc' })
  const [visibles, setVisibles] = useState(POR_PAGINA)
  const [editando, setEditando] = useState<SolicitudAuditoria | null>(null)
  const [tipoGrafico, setTipoGrafico] = useState<TipoGrafico>('ambos')
  const [topClientes, setTopClientes] = useState(10)
  const tablaRef = useRef<HTMLElement>(null)

  const opciones = useMemo(() => opcionesDeFiltros(todas ?? [], filtros), [todas, filtros])

  // Lo que dejan pasar los filtros: scopea TODO lo de abajo. El estado se
  // aplica solo a la tabla, para que sus conteos sigan siendo los del resto.
  const alcance = useMemo(() => filtrarSolicitudes(todas ?? [], filtros, { estado: true }), [todas, filtros])
  const tot = useMemo(() => totales(alcance), [alcance])
  const laboratorios = useMemo(() => porLaboratorio(alcance), [alcance])
  const tiposElegidos = tipoGrafico === 'ambos' ? [TIPO_ACTIMIST, TIPO_LINEA] : [tipoGrafico]
  const clientes = useMemo(
    () => topClientesPorServicio(alcance, tipoGrafico === 'ambos' ? [TIPO_ACTIMIST, TIPO_LINEA] : [tipoGrafico], topClientes),
    [alcance, tipoGrafico, topClientes],
  )
  const totalClientes = useMemo(() => porClienteYServicio(alcance).length, [alcance])

  const filas = useMemo(
    () => ordenarSolicitudes(filtros.estado ? alcance.filter((s) => estadoDe(s) === filtros.estado) : alcance, orden.campo, orden.sentido),
    [alcance, filtros.estado, orden],
  )

  const hayFiltros = contarFiltros(filtros) > 0
  const cambiarFiltros = (f: FiltrosSolicitudes) => {
    setFiltros(f)
    setVisibles(POR_PAGINA)
  }
  const elegirEstado = (e: EstadoSolicitud | '') => cambiarFiltros({ ...filtros, estado: e })

  function ordenarPor(campo: CampoOrden) {
    setOrden((o) => (o.campo === campo ? { campo, sentido: o.sentido === 'asc' ? 'desc' : 'asc' } : { campo, sentido: 'asc' }))
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
        <div className={styles.donas} aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={styles.esqueleto}><Skeleton style={{ width: '50%', height: 14 }} /><Skeleton style={{ width: 150, height: 150, borderRadius: '50%', alignSelf: 'center' }} /></div>
          ))}
        </div>
      )}

      {todas && (
        <div className={cargando ? styles.recargando : styles.contenido}>
          <PanelFiltros filtros={filtros} onChange={cambiarFiltros} opciones={opciones} datos={todas} />

          {tot.emitidas === 0 ? (
            <div className={styles.vacio}>
              <IconoBuscar width={28} height={28} />
              <h3>{todas.length === 0 ? 'Aún no hay solicitudes emitidas' : 'Nada coincide con los filtros'}</h3>
              <p>{todas.length === 0 ? 'Cuando se emitan solicitudes desde Toma de muestras, aparecerán acá.' : 'Prueba con otra combinación o limpia los filtros.'}</p>
              {hayFiltros && <Button variant="secondary" onClick={() => cambiarFiltros({ ...FILTROS_VACIOS })}>Limpiar filtros</Button>}
            </div>
          ) : (
            <>
              <div className={styles.donas}>
                <DonaLaboratorio titulo="Todos los laboratorios" resumen={tot} destacada />
                {laboratorios.map((l) => <DonaLaboratorio key={l.laboratorio} titulo={l.laboratorio} resumen={l} />)}
              </div>

              <TarjetaGrafico
                titulo="Análisis e informes por cliente"
                subtitulo={`Análisis pedidos y informes concretados, por tipo de servicio · ${clientes.length} de ${nf.format(totalClientes)} clientes`}
                alto={altoClienteServicio(clientes.length, tiposElegidos.length)}
                leyenda={<LeyendaTipos tipos={tiposElegidos} />}
                controles={
                  <>
                    <div className={styles.segmentadoChico} role="group" aria-label="Tipo de servicio">
                      {TIPOS_GRAFICO.map((t) => (
                        <button key={t.valor} type="button" aria-pressed={tipoGrafico === t.valor} className={tipoGrafico === t.valor ? styles.segActivo : ''} onClick={() => setTipoGrafico(t.valor)}>
                          {t.texto}
                        </button>
                      ))}
                    </div>
                    <select className={styles.selectChico} aria-label="Cuántos clientes mostrar" value={topClientes} onChange={(e) => setTopClientes(Number(e.target.value))}>
                      <option value={10}>Top 10</option>
                      <option value={20}>Top 20</option>
                      <option value={0}>Todos</option>
                    </select>
                  </>
                }
                tabla={{
                  columnas: ['Cliente', ...tiposElegidos.flatMap((t) => [`${t} · análisis`, `${t} · informes`])],
                  filas: clientes.map((c) => [c.cliente, ...tiposElegidos.flatMap((t) => [c.tipos[t]?.analisis ?? 0, c.tipos[t]?.informes ?? 0])]),
                }}
              >
                {clientes.length > 0 ? (
                  <GraficoClienteServicio clientes={clientes} tipos={tiposElegidos} />
                ) : (
                  <p className={styles.sinDatosGrafico}>No hay solicitudes de este tipo con los filtros actuales.</p>
                )}
              </TarjetaGrafico>

              <TarjetaGrafico
                titulo="Total de solicitudes por laboratorio"
                subtitulo="Cuántas se emitieron a cada laboratorio y en qué estado están"
                alto={Math.max(110, laboratorios.length * 46 + 44)}
                leyenda={<LeyendaEstados />}
                tabla={{
                  columnas: ['Laboratorio', 'Total', 'Concretadas', 'PDF sin Report', 'Pendientes'],
                  filas: laboratorios.map((l) => [l.laboratorio, l.emitidas, l.concretadas, l.sinReport, l.pendientes]),
                }}
              >
                <GraficoTotalPorLaboratorio laboratorios={laboratorios} />
              </TarjetaGrafico>

              <section className={styles.tablaCard} ref={tablaRef} aria-label="Detalle de solicitudes">
                <header className={styles.tablaCab}>
                  <div className={styles.segmentado} role="group" aria-label="Filtrar por estado">
                    <button type="button" aria-pressed={filtros.estado === ''} className={filtros.estado === '' ? styles.segActivo : ''} onClick={() => elegirEstado('')}>
                      Todas <span>{nf.format(alcance.length)}</span>
                    </button>
                    {ORDEN_ESTADOS.map((e) => (
                      <button key={e} type="button" aria-pressed={filtros.estado === e} className={filtros.estado === e ? styles.segActivo : ''} onClick={() => elegirEstado(filtros.estado === e ? '' : e)}>
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
                          <th key={c.campo} aria-sort={orden.campo === c.campo ? (orden.sentido === 'asc' ? 'ascending' : 'descending') : 'none'}>
                            <button type="button" onClick={() => ordenarPor(c.campo)} className={orden.campo === c.campo ? styles.ordenActivo : ''}>
                              {c.titulo}
                              <IconoFlecha sentido={orden.campo === c.campo ? orden.sentido : null} />
                            </button>
                          </th>
                        ))}
                        <th className={styles.colAnalitos}>Analitos</th>
                        <th aria-sort={orden.campo === 'estado' ? (orden.sentido === 'asc' ? 'ascending' : 'descending') : 'none'}>
                          <button type="button" onClick={() => ordenarPor('estado')} className={orden.campo === 'estado' ? styles.ordenActivo : ''}>
                            Estado
                            <IconoFlecha sentido={orden.campo === 'estado' ? orden.sentido : null} />
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filas.slice(0, visibles).map((s) => (
                        <tr key={s.archivo}>
                          <td>{s.laboratorio ?? '—'}</td>
                          <td className={styles.mono}>{s.numero_solicitud ?? '—'}</td>
                          <td>
                            {s.informe ? (
                              <span className={styles.informeCelda}>
                                <span className={styles.mono}>{s.informe.nro_informe ?? 'Sin N°'}</span>
                                <IconoInforme s={s} onEditar={puedeEditar ? () => setEditando(s) : undefined} />
                              </span>
                            ) : (
                              <span className={styles.vacioCelda}>—</span>
                            )}
                          </td>
                          <td>
                            <span className={styles.cliente}>{s.sold_to ?? '—'}</span>
                            {s.ship_to && <span className={styles.planta}>{s.ship_to}</span>}
                          </td>
                          <td>{s.tipo_servicio ? tipoServicioDe(s) : <span className={styles.vacioCelda}>—</span>}</td>
                          <td className={styles.colAnalitos}><Analitos codigos={s.analitos} /></td>
                          <td><EstadoCelda s={s} /></td>
                        </tr>
                      ))}
                      {filas.length === 0 && (
                        <tr><td colSpan={COLUMNAS.length + 2} className={styles.sinFilas}>No hay solicitudes en este estado.</td></tr>
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
