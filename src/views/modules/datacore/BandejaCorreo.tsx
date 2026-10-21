import { Fragment, useEffect, useState } from 'react'
import {
  compararDestinatarios,
  detalleInformeCorreo,
  ETIQUETA_ESTADO,
  hallazgoPrincipal,
  listarBandeja,
  marcarInformado,
  pdfInformeCorreo,
  rechazarInforme,
  resolverSeguimiento,
  volverAPendiente,
} from '@/features/correoInformes'
import type { Bandeja, DecisionInforme, DetalleInformeCorreo, FiltroBandeja, InformeCorreo } from '@/features/correoInformes'
import { fechaHoraCorta } from '@/features/notificaciones'
import styles from './BandejaCorreo.module.css'

export interface FiltroInicialBandeja {
  estado?: FiltroBandeja
  decision?: DecisionInforme
  q?: string
}

const DECISIONES: { clave: DecisionInforme | ''; etiqueta: string; conteo: keyof Bandeja['conteos'] }[] = [
  { clave: 'pendiente', etiqueta: 'Pendientes', conteo: 'pendiente' },
  { clave: 'aceptado', etiqueta: 'Aceptados', conteo: 'aceptado' },
  { clave: 'rechazado', etiqueta: 'Rechazados', conteo: 'rechazado' },
  { clave: '', etiqueta: 'Todos', conteo: 'todos' },
]

const ESTADOS: { clave: FiltroBandeja; etiqueta: string; conteo: keyof Bandeja['conteos'] }[] = [
  { clave: 'rojo', etiqueta: 'Seguimiento', conteo: 'rojo' },
  { clave: 'amarillo', etiqueta: 'Revisar', conteo: 'amarillo' },
  { clave: 'ok', etiqueta: 'Listos', conteo: 'ok' },
  { clave: 'ya_cargado', etiqueta: 'Ya cargados', conteo: 'ya_cargado' },
]

function Detalle({ informe, onCambio }: { informe: InformeCorreo; onCambio: () => void }) {
  const id = informe.id
  const [d, setD] = useState<DetalleInformeCorreo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nota, setNota] = useState('')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    let vigente = true
    detalleInformeCorreo(id)
      .then((r) => {
        if (vigente) setD(r)
      })
      .catch((e: unknown) => {
        if (vigente) setError(e instanceof Error ? e.message : 'No se pudo leer el detalle.')
      })
    return () => {
      vigente = false
    }
  }, [id])

  async function verPdf() {
    try {
      const { blob } = await pdfInformeCorreo(id)
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener')
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir el PDF.')
    }
  }

  async function actuar(accion: () => Promise<unknown>) {
    setOcupado(true)
    setError(null)
    try {
      await accion()
      setNota('')
      onCambio()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setOcupado(false)
    }
  }

  if (!d) return error ? <p className={styles.error}>{error}</p> : <p className={styles.vacio}>Leyendo detalle…</p>

  const filas = compararDestinatarios(d.esperado, { para: d.para, cc: d.cc, bcc: d.bcc }, d.propios)
  const enSeguimiento = d.estado === 'rojo' && !d.resuelto_en
  return (
    <div className={styles.detalle}>
      <div className={styles.detalleCol}>
        <h3 className={styles.detalleTitulo}>A quién debía llegar y a quién llegó</h3>
        {filas.length === 0 ? (
          <p className={styles.vacio}>La solicitud no tiene lista del cliente: no hay con qué comparar.</p>
        ) : (
          <ul className={styles.destinatarios}>
            {filas.map((f) => (
              <li
                key={f.correo}
                className={
                  f.tipo === 'esperado'
                    ? styles.destOk
                    : f.tipo === 'falta'
                      ? styles.destFalta
                      : f.interno
                        ? styles.destInterno
                        : styles.destDemas
                }
              >
                <span aria-hidden="true">{f.tipo === 'esperado' ? '✓' : f.tipo === 'falta' ? '!' : '✕'}</span>
                {f.correo}
                <em>
                  {f.tipo === 'esperado' ? 'llegó' : f.tipo === 'falta' ? 'no llegó' : f.interno ? 'copia interna de más' : 'no está en la lista'}
                </em>
              </li>
            ))}
          </ul>
        )}
        <p className={styles.nota}>
          Se mira solo Para y Copia. Llegó: {fechaHoraCorta(d.llegada_en)}
          {d.enviado_en ? ` · enviado: ${fechaHoraCorta(d.enviado_en)}` : ''}.
        </p>
        {d.historial.length > 1 && (
          <div className={styles.historial}>
            <h3 className={styles.detalleTitulo}>Envíos de este informe ({d.historial.length})</h3>
            <ol className={styles.envios}>
              {d.historial.map((e) => (
                <li key={e.id} className={e.id === d.id ? styles.envioActual : ''}>
                  <span className={`${styles.estado} ${styles[`e_${e.estado}`]}`}>{ETIQUETA_ESTADO[e.estado]}</span>
                  <span className={styles.envioFecha}>{fechaHoraCorta(e.llegada_en)}</span>
                  <span className={styles.envioTexto}>
                    a {[...e.para, ...e.cc].slice(0, 3).join(', ') || '—'}
                    {e.para.length + e.cc.length > 3 ? ` y ${e.para.length + e.cc.length - 3} más` : ''}
                    <em>{e.que_paso}</em>
                  </span>
                </li>
              ))}
            </ol>
            <p className={styles.nota}>Es un solo incidente: los reenvíos no cuentan como alertas nuevas.</p>
          </div>
        )}
      </div>
      <div className={styles.detalleCol}>
        <h3 className={styles.detalleTitulo}>Qué encontré</h3>
        {d.hallazgos.length === 0 ? (
          <p className={styles.vacio}>Todo calza con su solicitud.</p>
        ) : (
          <ul className={styles.hallazgos}>
            {d.hallazgos.map((h) => (
              <li key={h.codigo} className={styles[`h_${h.nivel}`]}>
                {h.texto}
              </li>
            ))}
          </ul>
        )}
        <p className={styles.nota}>
          {[d.sold_to, d.ship_to, d.especie].filter(Boolean).join(' · ') || 'El informe no trae Sold To / Ship To legibles.'}
        </p>
        {d.decision !== 'pendiente' && (
          <p className={styles.nota}>
            {d.decision === 'aceptado' ? 'Aceptado' : 'Rechazado'} por {d.decidido_por ?? '—'} el {fechaHoraCorta(d.decidido_en)}
            {d.nota ? ` · «${d.nota}»` : ''}
          </p>
        )}
        {d.informado && (
          <p className={styles.nota}>
            Ya se informó al laboratorio{d.informado_por ? ` (${d.informado_por}` : ''}
            {d.informado_en ? `, ${fechaHoraCorta(d.informado_en)}` : ''}
            {d.informado_por ? ')' : ''}.
          </p>
        )}
        {d.resuelto_en && (
          <p className={styles.nota}>Seguimiento resuelto por {d.resuelto_por ?? '—'} el {fechaHoraCorta(d.resuelto_en)}.</p>
        )}
        {d.nota_incidente && <p className={styles.nota}>Nota del incidente: «{d.nota_incidente}»</p>}

        <div className={styles.acciones}>
          {d.tiene_pdf && (
            <button type="button" className={styles.btnSecundario} onClick={() => void verPdf()}>
              Ver el PDF
            </button>
          )}
          {d.decision === 'rechazado' && (
            <button type="button" className={styles.btnSecundario} disabled={ocupado} onClick={() => void actuar(() => volverAPendiente(id))}>
              Volver a pendiente
            </button>
          )}
        </div>

        {(d.decision === 'pendiente' || enSeguimiento) && (
          <div className={styles.decision}>
            <label className={styles.etiquetaNota}>
              {enSeguimiento ? 'Nota: a quién se avisó o qué se hizo (o el motivo del rechazo)' : 'Motivo del rechazo'}
              <textarea
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="Escribe una nota…"
              />
            </label>
            <div className={styles.acciones}>
              {d.decision === 'pendiente' && (
                <button
                  type="button"
                  className={styles.btnPeligro}
                  disabled={ocupado || !nota.trim()}
                  onClick={() => void actuar(() => rechazarInforme(id, nota))}
                >
                  Rechazar este informe
                </button>
              )}
              {enSeguimiento && !d.informado && (
                <button
                  type="button"
                  className={styles.btnSecundario}
                  disabled={ocupado || !nota.trim()}
                  onClick={() => void actuar(() => marcarInformado(id, nota))}
                >
                  Ya informé al laboratorio
                </button>
              )}
              {enSeguimiento && (
                <button
                  type="button"
                  className={styles.btnSecundario}
                  disabled={ocupado || !nota.trim()}
                  onClick={() => void actuar(() => resolverSeguimiento(id, nota))}
                >
                  Marcar seguimiento como resuelto
                </button>
              )}
            </div>
          </div>
        )}
        {error && <p className={styles.error}>{error}</p>}
      </div>
    </div>
  )
}

interface Props {
  /** Cambia cuando el servidor trajo informes nuevos (hay que releer). */
  version: number
  inicial?: FiltroInicialBandeja
  /** Una decisión cambió: el resto del panel (cifras, solicitudes) también tiene que releer. */
  onCambio: () => void
}

/**
 * Los informes que los laboratorios (y Paz) mandaron al buzón del Report Hub, ya leídos y revisados
 * contra su solicitud: se filtran por lo que se decidió (pendiente, aceptado, rechazado) y por lo que
 * encontró la revisión. Al abrir uno se ve a quién debía llegar contra a quién llegó. Solo la ve el
 * administrador principal.
 */
export function BandejaCorreo({ version, inicial, onCambio }: Props) {
  const [bandeja, setBandeja] = useState<Bandeja | null>(null)
  const [decision, setDecision] = useState<DecisionInforme | ''>(inicial?.decision ?? (inicial?.estado || inicial?.q ? '' : 'pendiente'))
  const [estado, setEstado] = useState<FiltroBandeja>(inicial?.estado ?? '')
  const [q, setQ] = useState(inicial?.q ?? '')
  const [copias, setCopias] = useState(false)
  const [abierto, setAbierto] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    let vigente = true
    listarBandeja(estado, q, decision, copias)
      .then((b) => {
        if (!vigente) return
        setBandeja(b)
        setError(null)
      })
      .catch((e: unknown) => {
        if (vigente) setError(e instanceof Error ? e.message : 'No se pudo leer el correo de informes.')
      })
    return () => {
      vigente = false
    }
  }, [estado, q, decision, copias, version, recarga])

  const c = bandeja?.conteos

  return (
    <section className={styles.bloque} aria-label="Informes que llegaron por correo">
      <div className={styles.filtros}>
        <div className={styles.grupo} role="group" aria-label="Decisión">
          {DECISIONES.map((f) => (
            <button
              key={f.etiqueta}
              type="button"
              className={`${styles.chip} ${decision === f.clave ? styles.chipActivo : ''}`}
              aria-pressed={decision === f.clave}
              onClick={() => setDecision(f.clave)}
            >
              {f.etiqueta} <strong>{c?.[f.conteo] ?? 0}</strong>
            </button>
          ))}
        </div>
        <div className={styles.grupo} role="group" aria-label="Revisión">
          {ESTADOS.map((f) => (
            <button
              key={f.etiqueta}
              type="button"
              className={`${styles.chip} ${estado === f.clave ? styles.chipActivo : ''} ${f.clave === 'rojo' ? styles.chipRojo : ''}`}
              aria-pressed={estado === f.clave}
              onClick={() => setEstado(estado === f.clave ? '' : f.clave)}
            >
              {f.etiqueta} <strong>{c?.[f.conteo] ?? 0}</strong>
            </button>
          ))}
        </div>
        <input
          type="search"
          className={styles.buscar}
          placeholder="Buscar por informe, OT, planta…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar en el correo de informes"
        />
        <label className={styles.copias}>
          <input type="checkbox" checked={copias} onChange={(e) => setCopias(e.target.checked)} />
          Incluir envíos anteriores del mismo informe
        </label>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {bandeja && bandeja.informes.length === 0 ? (
        <p className={styles.vacio}>
          {bandeja.conteos.todos === 0
            ? 'Todavía no hay informes. Aprieta «Revisar el correo ahora» para leer el buzón.'
            : 'Ningún informe coincide con ese filtro.'}
        </p>
      ) : (
        <div className={styles.tablaScroll}>
          <table className={styles.tabla}>
            <thead>
              <tr>
                <th>Llegada</th>
                <th>Informe</th>
                <th>Cliente / planta</th>
                <th>Estado</th>
                <th>Qué pasó</th>
              </tr>
            </thead>
            <tbody>
              {(bandeja?.informes ?? []).map((i: InformeCorreo) => {
                const h = hallazgoPrincipal(i.hallazgos.filter((x) => x.nivel !== 'info'))
                return (
                  <Fragment key={i.id}>
                    <tr
                      className={`${styles.fila} ${abierto === i.id ? styles.filaAbierta : ''} ${i.es_ultima_copia ? '' : styles.reemplazada}`}
                      onClick={() => setAbierto(abierto === i.id ? null : i.id)}
                    >
                      <td className={styles.nowrap}>{fechaHoraCorta(i.llegada_en)}</td>
                      <td className={styles.celdaInforme}>
                        <strong>{i.nro_informe || 'Sin N° de informe'}</strong>
                        <span className={styles.celdaInformeSub}>{[i.laboratorio, i.ot].filter(Boolean).join(' · ') || 'Sin identificar'}</span>
                      </td>
                      <td>{[i.sold_to, i.ship_to].filter(Boolean).join(' · ') || '—'}</td>
                      <td className={styles.nowrap}>
                        <span className={`${styles.estado} ${styles[`e_${i.estado}`]}`}>
                          {i.estado === 'rojo' && i.resuelto_en ? 'Resuelto' : ETIQUETA_ESTADO[i.estado]}
                        </span>
                        {i.decision !== 'pendiente' && (
                          <span className={`${styles.marca} ${i.decision === 'rechazado' ? styles.marcaRechazado : styles.marcaAceptado}`}>
                            {i.decision === 'aceptado' ? 'Aceptado' : 'Rechazado'}
                          </span>
                        )}
                        {i.ya_cargado && <span className={styles.marca}>Ya cargado</span>}
                        {i.estado !== 'rojo' && i.tuvo_incidente && (
                          <span className={`${styles.marca} ${styles.marcaAceptado}`} title="Salió mal antes y un reenvío llegó a la lista correcta">
                            Corregido por reenvío
                          </span>
                        )}
                        {i.estado === 'rojo' && i.informado && !i.resuelto_en && (
                          <span className={styles.marca} title="Ya se le avisó al laboratorio: no se vuelve a alertar por este informe">
                            Informado
                          </span>
                        )}
                        {i.envios > 1 && (
                          <span className={styles.marca} title={`La primera copia llegó ${fechaHoraCorta(i.primera_llegada)}`}>
                            {i.envios} envíos
                          </span>
                        )}
                        {!i.es_ultima_copia && <span className={styles.marca}>Reemplazado</span>}
                      </td>
                      <td className={styles.queHizo}>{h ? h.texto : 'Todo calza con su solicitud.'}</td>
                    </tr>
                    {abierto === i.id && (
                      <tr className={styles.filaDetalle}>
                        <td colSpan={5}>
                          <Detalle
                            informe={i}
                            onCambio={() => {
                              setRecarga((n) => n + 1)
                              onCambio()
                            }}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
