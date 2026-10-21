import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { agrupar, deshacerAceptacion, dias, frasePendiente, listarBandeja } from '@/features/correoInformes'
import type { InformeCorreo, PanelIngreso } from '@/features/correoInformes'
import { fechaHoraCorta } from '@/features/notificaciones'
import { Detalle } from './BandejaCorreo'
import { ColaDeTrabajo } from './ColaDeTrabajo'
import { GraficoDemora } from './GraficoDemora'
import { SolicitudesIngreso } from './SolicitudesIngreso'
import styles from './TableroIngreso.module.css'

const nf = new Intl.NumberFormat('es-CL')

interface Props {
  panel: PanelIngreso | null
  errorPanel: string | null
  version: number
  /** Se hizo algo (aceptar, rechazar…): hay que releer el panel entero. */
  onCambio: () => void
  /** Pasa a «Todos los informes» buscando ese N° de informe. */
  onVerInforme: (nro: string) => void
}

function Widget({ titulo, cuenta, ancho, tono, children, pie }: { titulo: string; cuenta?: number; ancho: string; tono?: string; children: ReactNode; pie?: ReactNode }) {
  return (
    <section className={`${styles.widget} ${styles[ancho]} ${tono ? styles[tono] : ''}`}>
      <header className={styles.widgetTop}>
        <h2>
          {titulo}
          {cuenta != null && <span className={styles.cuenta}>{cuenta}</span>}
        </h2>
        {pie}
      </header>
      <div className={styles.widgetCuerpo}>{children}</div>
    </section>
  )
}

/**
 * Tablero de Ingreso de informes: todo a la vista en widgets (qué aceptar, qué envíos salieron mal, qué falta por
 * llegar, cuánto demoran los laboratorios y qué se aceptó hoy). Un informe se abre en una ventana encima del
 * tablero, sin cambiar de pantalla.
 */
export function TableroIngreso({ panel, errorPanel, version, onCambio, onVerInforme }: Props) {
  const [pendientes, setPendientes] = useState<InformeCorreo[] | null>(null)
  const [aceptados, setAceptados] = useState<InformeCorreo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<InformeCorreo | null>(null)
  const [verSolicitudes, setVerSolicitudes] = useState(false)
  const [deshaciendo, setDeshaciendo] = useState<number | null>(null)
  const [falla, setFalla] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    listarBandeja('', '', 'pendiente', false)
      .then((b) => {
        if (!vigente) return
        setPendientes(b.informes.filter((i) => i.es_ultima_copia))
        setError(null)
      })
      .catch((e: unknown) => {
        if (vigente) setError(e instanceof Error ? e.message : 'No se pudo leer el correo de informes.')
      })
    listarBandeja('', '', 'aceptado', false)
      .then((b) => {
        if (vigente) setAceptados(b.informes.slice(0, 8))
      })
      .catch(() => undefined)
    return () => {
      vigente = false
    }
  }, [version])

  const cerrar = useCallback(() => setAbierto(null), [])
  const alCambiar = useCallback(() => {
    setAbierto(null)
    onCambio()
  }, [onCambio])

  async function deshacer(i: InformeCorreo) {
    setDeshaciendo(i.id)
    setFalla(null)
    try {
      await deshacerAceptacion(i.id)
      onCambio()
    } catch (e) {
      setFalla(e instanceof Error ? e.message : 'No se pudo deshacer.')
    } finally {
      setDeshaciendo(null)
    }
  }

  const g = agrupar(pendientes ?? [])
  const porAceptar = g.listo.length + g.homogeneizar.length
  const deEnvios = g.seguimiento.length + g.revisar.length + g.informado.length
  const k = panel?.kpis
  const faltan = (panel?.solicitudes ?? []).filter((s) => s.estado === 'esperando')

  return (
    <div className={styles.tablero}>
      <div className={`${styles.kpis} ${styles.c12}`}>
        <div className={styles.kpi}>
          <strong>{pendientes == null ? '…' : nf.format(porAceptar)}</strong>
          <span>por aceptar</span>
        </div>
        <div className={`${styles.kpi} ${deEnvios > 0 ? styles.kpiAlerta : ''}`}>
          <strong>{pendientes == null ? '…' : nf.format(deEnvios)}</strong>
          <span>con el envío por revisar</span>
        </div>
        <div className={`${styles.kpi} ${(k?.esperando ?? 0) > 0 ? styles.kpiAviso : ''}`}>
          <strong>{k ? nf.format(k.esperando) : '…'}</strong>
          <span>faltan por llegar</span>
        </div>
        <div className={styles.kpi}>
          <strong>{k ? nf.format(k.aceptados) : '…'}</strong>
          <span>aceptados ({panel?.dias ?? 60} días)</span>
        </div>
        <div className={styles.kpi}>
          <strong>{k ? dias(k.demora_mediana) : '…'}</strong>
          <span>demora mediana</span>
        </div>
      </div>

      <Widget titulo="Por aceptar" cuenta={porAceptar} ancho="c7" tono="verde">
        <ColaDeTrabajo
          informes={pendientes}
          error={error}
          grupos={['listo', 'homogeneizar']}
          onCambio={onCambio}
          onAbrir={setAbierto}
          vacio="Nada por aceptar. Usa «Revisar el correo ahora» para buscar informes nuevos."
        />
      </Widget>

      <Widget titulo="Revisión de envíos" cuenta={deEnvios} ancho="c5" tono={g.seguimiento.length > 0 ? 'rojo' : undefined}>
        <ColaDeTrabajo
          informes={pendientes}
          error={null}
          grupos={['seguimiento', 'revisar', 'informado']}
          onCambio={onCambio}
          onAbrir={setAbierto}
          vacio="Todos los envíos llegaron a su lista. 👌"
        />
      </Widget>

      <Widget
        titulo="Faltan por llegar"
        cuenta={faltan.length}
        ancho="c5"
        pie={
          <button type="button" className={styles.enlace} onClick={() => setVerSolicitudes(true)}>
            Ver todas las solicitudes
          </button>
        }
      >
        {!panel ? (
          errorPanel ? <p className={styles.falla}>{errorPanel}</p> : <Skeleton style={{ height: 120 }} />
        ) : faltan.length === 0 ? (
          <p className={styles.vacio}>No hay solicitudes esperando informe.</p>
        ) : (
          <ul className={styles.faltan}>
            {faltan.map((s) => (
              <li key={s.ot}>
                <span className={styles.ot}>{s.ot}</span>
                <span className={styles.detalle}>
                  {s.laboratorio} · {s.ship_to || s.sold_to || 'sin planta'}
                  <em>salió {fechaHoraCorta(s.enviada_en)}</em>
                </span>
                <span className={styles.espera}>{dias(s.dias_esperando)}</span>
              </li>
            ))}
          </ul>
        )}
      </Widget>

      <Widget titulo="Demora de los informes" ancho="c7">
        {!panel ? (
          <Skeleton style={{ height: 200 }} />
        ) : (
          <>
            <p className={styles.sub}>
              Días hábiles desde que la solicitud sale al laboratorio hasta que su informe llega. <strong>{frasePendiente(panel.tendencia.pendiente_por_semana)}</strong>
            </p>
            <GraficoDemora tendencia={panel.tendencia} />
            {panel.laboratorios.length > 0 && (
              <table className={styles.mini}>
                <thead>
                  <tr>
                    <th>Laboratorio</th>
                    <th>Esperando</th>
                    <th>Recibidos</th>
                    <th>Demora</th>
                  </tr>
                </thead>
                <tbody>
                  {panel.laboratorios.map((l) => (
                    <tr key={l.laboratorio}>
                      <td>{l.laboratorio}</td>
                      <td className={l.esperando > 0 ? styles.alerta : ''}>{l.esperando}</td>
                      <td>{l.recibidos}</td>
                      <td>{dias(l.demora_mediana)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </Widget>

      <Widget titulo="Aceptados recientes" ancho="c12">
        {falla && <p className={styles.falla}>{falla}</p>}
        {aceptados == null ? (
          <Skeleton style={{ height: 80 }} />
        ) : aceptados.length === 0 ? (
          <p className={styles.vacio}>Todavía no se ha aceptado ningún informe del correo.</p>
        ) : (
          <ul className={styles.recientes}>
            {aceptados.map((i) => (
              <li key={i.id}>
                <strong>{i.nro_informe || i.pdf_nombre}</strong>
                <span className={styles.tenue}>{[i.laboratorio, i.ot].filter(Boolean).join(' · ')}</span>
                <span>{[i.sold_to, i.ship_to].filter(Boolean).join(' · ')}</span>
                <span className={styles.tenue}>{fechaHoraCorta(i.decidido_en)} · {i.decidido_por ?? ''}</span>
                <button type="button" className={styles.enlace} disabled={deshaciendo !== null} onClick={() => void deshacer(i)}>
                  Deshacer
                </button>
              </li>
            ))}
          </ul>
        )}
      </Widget>

      {abierto && (
        <Modal titulo={abierto.nro_informe || 'Informe'} subtitulo={[abierto.laboratorio, abierto.ot].filter(Boolean).join(' · ')} onCerrar={cerrar} ancho="grande">
          <div className={styles.dentroModal}>
            <Detalle informe={abierto} onCambio={alCambiar} />
          </div>
        </Modal>
      )}
      {verSolicitudes && (
        <Modal titulo="Solicitudes enviadas a los laboratorios" onCerrar={() => setVerSolicitudes(false)} ancho="grande">
          <div className={styles.dentroModal}>
            <SolicitudesIngreso
              panel={panel}
              onVerInforme={(nro) => {
                setVerSolicitudes(false)
                onVerInforme(nro)
              }}
            />
          </div>
        </Modal>
      )}
    </div>
  )
}
