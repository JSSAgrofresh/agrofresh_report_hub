import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/features/auth'
import { esAdminGeneral } from '@/features/usuarios'
import {
  editarFechaEnvio,
  estadoDe,
  fechaHora,
  listarSolicitudesAuditoria,
  paraInputFechaHora,
  porSemana,
  rutaPdfInforme,
  soloFecha,
  topClientes,
  totales,
} from '@/features/auditoriaInterna'
import type { EstadoSolicitud, SolicitudAuditoria } from '@/features/auditoriaInterna'
import { descargarArchivo } from '@/services/http/descargar'
import { GraficoClientes, GraficoEstado, GraficoSemanas } from './Graficos'
import styles from './SolicitudesInformesView.module.css'

const POR_PAGINA = 100

const ETIQUETA_ESTADO: Record<EstadoSolicitud, { texto: string; tono: 'success' | 'warning' | 'neutral' }> = {
  concretada: { texto: 'Concretada', tono: 'success' },
  sin_report: { texto: 'PDF sin Report', tono: 'warning' },
  pendiente: { texto: 'Pendiente', tono: 'neutral' },
}

const nf = new Intl.NumberFormat('es-CL')

function IconoInforme({ s, onEditar }: { s: SolicitudAuditoria; onEditar?: () => void }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const informe = s.informe
  if (!informe) return <span className={styles.sinInforme}>—</span>

  // El tooltip va con position: fixed: la tabla tiene scroll propio y un
  // absolute se cortaría en la última fila.
  function mostrar(el: HTMLElement) {
    const r = el.getBoundingClientRect()
    setPos({ x: Math.max(8, Math.min(r.left, window.innerWidth - 300)), y: r.bottom + 6 })
  }

  return (
    <span className={styles.informe}>
      <button
        type="button"
        className={styles.botonInforme}
        aria-label={`Descargar informe de ${s.numero_solicitud ?? s.archivo}`}
        onMouseEnter={(e) => mostrar(e.currentTarget)}
        onMouseLeave={() => setPos(null)}
        onFocus={(e) => mostrar(e.currentTarget)}
        onBlur={() => setPos(null)}
        onClick={() => void descargarArchivo(rutaPdfInforme(informe.id), informe.nombre_archivo)}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5" />
          <path d="M9 13h6M9 17h4" />
        </svg>
      </button>
      {onEditar && (
        <button type="button" className={styles.botonEditar} onClick={onEditar} aria-label="Editar fecha de envío" title="Editar fecha de envío">
          ✎
        </button>
      )}
      {pos && (
        <span role="tooltip" className={styles.tooltip} style={{ left: pos.x, top: pos.y }}>
          <strong>{informe.nombre_archivo}</strong>
          <span><em>Emitida</em>{fechaHora(s.emitida_en)}</span>
          <span><em>Cargada</em>{fechaHora(informe.cargado_en)}</span>
          <span>
            <em>Enviada</em>
            {informe.fecha_envio ? fechaHora(informe.fecha_envio) : 'sin fecha de envío'}
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

  async function guardar(e: FormEvent, vaciar = false) {
    e.preventDefault()
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
    <div className={styles.fondoModal} role="dialog" aria-modal="true" aria-label="Fecha de envío del informe" onClick={onCerrar}>
      <form className={styles.modal} onClick={(e) => e.stopPropagation()} onSubmit={(e) => void guardar(e)}>
        <h3>Fecha y hora de envío</h3>
        <p className={styles.modalSub}>
          {s.numero_solicitud} · {informe.nombre_archivo}
        </p>
        <input type="datetime-local" value={valor} onChange={(e) => setValor(e.target.value)} />
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.modalBotones}>
          <Button type="button" variant="ghost" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
          <Button type="button" variant="secondary" onClick={(e) => void guardar(e, true)} disabled={guardando || !informe.fecha_envio}>
            Quitar fecha
          </Button>
          <Button type="submit" disabled={guardando || !valor}>Guardar</Button>
        </div>
      </form>
    </div>
  )
}

function Kpi({ etiqueta, valor, sub }: { etiqueta: string; valor: string; sub?: string }) {
  return (
    <Card className={styles.kpi}>
      <span className={styles.kpiEtiqueta}>{etiqueta}</span>
      <span className={styles.kpiValor}>{valor}</span>
      {sub && <span className={styles.kpiSub}>{sub}</span>}
    </Card>
  )
}

export function SolicitudesInformesView() {
  const { user } = useAuth()
  const puedeEditar = user ? esAdminGeneral(user) : false

  const [todas, setTodas] = useState<SolicitudAuditoria[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [laboratorio, setLaboratorio] = useState('')
  const [estado, setEstado] = useState<'' | EstadoSolicitud>('')
  const [texto, setTexto] = useState('')
  const [visibles, setVisibles] = useState(POR_PAGINA)
  const [editando, setEditando] = useState<SolicitudAuditoria | null>(null)

  // Subir este número vuelve a pedir el panel (botón Actualizar).
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    let cancelado = false
    listarSolicitudesAuditoria()
      .then((s) => {
        if (cancelado) return
        setTodas(s)
        setError(null)
      })
      .catch((e: unknown) => {
        if (cancelado) return
        setError(e instanceof Error ? e.message : 'No se pudo cargar el panel.')
      })
    return () => {
      cancelado = true
    }
  }, [recarga])

  const laboratorios = useMemo(
    () => [...new Set((todas ?? []).map((s) => s.laboratorio).filter((l): l is string => Boolean(l)))].sort((a, b) => a.localeCompare(b, 'es')),
    [todas],
  )

  const filtradas = useMemo(() => {
    const q = texto.trim().toLowerCase()
    return (todas ?? []).filter((s) => {
      if (laboratorio && s.laboratorio !== laboratorio) return false
      if (estado && estadoDe(s) !== estado) return false
      if (!q) return true
      return [s.numero_solicitud, s.sold_to, s.ship_to, s.especie, s.informe?.nro_informe, s.informe?.nombre_archivo]
        .some((v) => (v ?? '').toLowerCase().includes(q))
    })
  }, [todas, laboratorio, estado, texto])

  const tot = useMemo(() => totales(filtradas), [filtradas])
  const semanas = useMemo(() => porSemana(filtradas), [filtradas])
  const clientes = useMemo(() => topClientes(filtradas), [filtradas])

  function fechaGuardada(informeId: number, fechaEnvio: string | null) {
    setTodas((prev) =>
      (prev ?? []).map((s) =>
        s.informe?.id === informeId ? { ...s, informe: { ...s.informe, fecha_envio: fechaEnvio } } : s,
      ),
    )
  }

  return (
    <div>
      <Header
        title="Solicitudes e informes"
        description="Las solicitudes que emitimos por el sistema y cuáles ya están concretadas: con su PDF guardado y sus resultados en Report."
        acciones={<Button variant="secondary" onClick={() => setRecarga((n) => n + 1)}>Actualizar</Button>}
      />

      {error && <p className={styles.error}>⚠ {error}</p>}

      {!todas && !error ? (
        <div className={styles.kpis}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className={styles.kpi}><Skeleton style={{ width: '50%', height: '24px' }} /></Card>
          ))}
        </div>
      ) : todas ? (
        <>
          <div className={styles.filtros}>
            <label>
              <span>Laboratorio</span>
              <select value={laboratorio} onChange={(e) => { setLaboratorio(e.target.value); setVisibles(POR_PAGINA) }}>
                <option value="">Todos</option>
                {laboratorios.map((l) => <option key={l}>{l}</option>)}
              </select>
            </label>
            <label>
              <span>Estado</span>
              <select value={estado} onChange={(e) => { setEstado(e.target.value as '' | EstadoSolicitud); setVisibles(POR_PAGINA) }}>
                <option value="">Todos</option>
                <option value="concretada">Concretadas</option>
                <option value="sin_report">PDF sin Report</option>
                <option value="pendiente">Pendientes</option>
              </select>
            </label>
            <label className={styles.buscar}>
              <span>Buscar</span>
              <input type="search" placeholder="OT, cliente, planta, N° de informe…" value={texto} onChange={(e) => { setTexto(e.target.value); setVisibles(POR_PAGINA) }} />
            </label>
          </div>

          <div className={styles.kpis}>
            <Kpi etiqueta="Solicitudes emitidas" valor={nf.format(tot.emitidas)} />
            <Kpi etiqueta="Informes concretados" valor={nf.format(tot.concretadas)} sub={`${tot.porcentajeConcretado.toFixed(0)}% del total`} />
            <Kpi etiqueta="Pendientes de informe" valor={nf.format(tot.pendientes)} />
            <Kpi etiqueta="PDF sin resultados en Report" valor={nf.format(tot.sinReport)} sub="revisar en DataCore" />
          </div>

          {tot.emitidas === 0 ? (
            <Card className={styles.vacio}>No hay solicitudes que coincidan con los filtros.</Card>
          ) : (
            <>
              <div className={styles.graficos}>
                <Card className={styles.graficoCard}>
                  <h3>Solicitudes vs. informes</h3>
                  <div className={styles.lienzo}><GraficoEstado totales={tot} /></div>
                </Card>
                <Card className={`${styles.graficoCard} ${styles.ancho}`}>
                  <h3>Solicitudes por semana</h3>
                  <div className={styles.lienzo}><GraficoSemanas puntos={semanas} /></div>
                </Card>
                <Card className={`${styles.graficoCard} ${styles.ancho}`}>
                  <h3>Top clientes con solicitudes</h3>
                  <div className={styles.lienzo}><GraficoClientes clientes={clientes} /></div>
                </Card>
              </div>

              <Card className={styles.tablaCard}>
                <div className={styles.tablaScroll}>
                  <table className={styles.tabla}>
                    <thead>
                      <tr>
                        <th>Solicitud</th>
                        <th>Laboratorio</th>
                        <th>Cliente</th>
                        <th>Planta</th>
                        <th>Emitida</th>
                        <th>Cargada</th>
                        <th>Estado</th>
                        <th>Informe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtradas.slice(0, visibles).map((s) => {
                        const e = ETIQUETA_ESTADO[estadoDe(s)]
                        return (
                          <tr key={s.archivo}>
                            <td className={styles.mono}>{s.numero_solicitud ?? '—'}</td>
                            <td>{s.laboratorio ?? '—'}</td>
                            <td>{s.sold_to ?? '—'}</td>
                            <td>{s.ship_to ?? '—'}</td>
                            <td>{soloFecha(s.emitida_en)}</td>
                            <td>{s.informe ? soloFecha(s.informe.cargado_en) : '—'}</td>
                            <td><Badge tone={e.tono}>{e.texto}</Badge></td>
                            <td>
                              <IconoInforme s={s} onEditar={puedeEditar ? () => setEditando(s) : undefined} />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {filtradas.length > visibles && (
                  <div className={styles.masFila}>
                    <Button variant="secondary" onClick={() => setVisibles((v) => v + POR_PAGINA)}>
                      Mostrar más ({nf.format(filtradas.length - visibles)} restantes)
                    </Button>
                  </div>
                )}
              </Card>
            </>
          )}
        </>
      ) : null}

      {editando && (
        <ModalFechaEnvio s={editando} onCerrar={() => setEditando(null)} onGuardado={fechaGuardada} />
      )}
    </div>
  )
}
