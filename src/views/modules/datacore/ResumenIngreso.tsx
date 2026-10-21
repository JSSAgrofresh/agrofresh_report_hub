import { Indicador } from '@/components/ui/Indicador'
import { Skeleton } from '@/components/ui/Skeleton'
import { dias, frasePendiente } from '@/features/correoInformes'
import type { DecisionInforme, EstadoInforme, EstadoSolicitud, PanelIngreso } from '@/features/correoInformes'
import { fechaHoraCorta } from '@/features/notificaciones'
import { GraficoDemora } from './GraficoDemora'
import styles from './ResumenIngreso.module.css'

/** A dónde lleva tocar una cifra: la pestaña de informes o la de solicitudes, ya filtrada. */
export type DestinoIngreso =
  | { pestana: 'informes'; estado?: EstadoInforme; decision?: DecisionInforme }
  | { pestana: 'solicitudes'; estado?: EstadoSolicitud }

interface Props {
  panel: PanelIngreso | null
  error: string | null
  onIr: (destino: DestinoIngreso) => void
}

const nf = new Intl.NumberFormat('es-CL')

/** Lo primero que se ve: las cifras del día, la demora semana a semana y lo que todavía falta por llegar. */
export function ResumenIngreso({ panel, error, onIr }: Props) {
  if (error) return <p role="alert" className={styles.error}>{error}</p>
  if (!panel) return <Skeleton style={{ height: 320 }} />

  const k = panel.kpis
  const faltan = panel.solicitudes.filter((s) => s.estado === 'esperando')

  return (
    <div className={styles.resumen}>
      <div className={styles.kpis}>
        <Indicador
          etiqueta="Esperando informe"
          valor={nf.format(k.esperando)}
          sub="solicitudes enviadas sin informe"
          onClick={() => onIr({ pestana: 'solicitudes', estado: 'esperando' })}
        />
        <Indicador
          etiqueta="Pendientes de aceptar"
          valor={nf.format(k.pendientes)}
          sub="llegaron y nadie los ha revisado"
          onClick={() => onIr({ pestana: 'informes', decision: 'pendiente' })}
        />
        <Indicador
          etiqueta="Incidentes de envío"
          valor={nf.format(k.incidentes)}
          sub={`${k.incidentes_abiertos} ${k.incidentes_abiertos === 1 ? 'abierto' : 'abiertos'} · ${k.incidentes_cerrados} ${k.incidentes_cerrados === 1 ? 'corregido' : 'corregidos'}`}
          alerta={k.incidentes_abiertos > 0}
          onClick={() => onIr({ pestana: 'informes', estado: 'rojo' })}
        />
        <Indicador
          etiqueta="Aceptados"
          valor={nf.format(k.aceptados)}
          sub={`últimos ${panel.dias} días`}
          onClick={() => onIr({ pestana: 'informes', decision: 'aceptado' })}
        />
        <Indicador
          etiqueta="Rechazados"
          valor={nf.format(k.rechazados)}
          sub={`últimos ${panel.dias} días`}
          onClick={() => onIr({ pestana: 'informes', decision: 'rechazado' })}
        />
        <Indicador
          etiqueta="Informes recibidos"
          valor={nf.format(k.recibidos)}
          sub={`últimos ${panel.dias} días`}
          onClick={() => onIr({ pestana: 'informes' })}
        />
        <Indicador
          etiqueta="Demora mediana"
          valor={dias(k.demora_mediana)}
          sub={k.demora_maxima != null ? `la más larga: ${dias(k.demora_maxima)}` : 'días hábiles desde que sale la solicitud'}
        />
      </div>

      <div className={styles.dos}>
        <section className={styles.tarjeta} aria-labelledby="titulo-demora">
          <h2 id="titulo-demora" className={styles.titulo}>Demora de los informes</h2>
          <p className={styles.sub}>
            Días hábiles desde que la solicitud sale al laboratorio hasta que su informe llega al correo, semana a semana.{' '}
            <strong>{frasePendiente(panel.tendencia.pendiente_por_semana)}</strong>
          </p>
          <GraficoDemora tendencia={panel.tendencia} />
        </section>

        <div className={styles.columna}>
          <section className={styles.tarjeta} aria-labelledby="titulo-labs">
            <h2 id="titulo-labs" className={styles.titulo}>Por laboratorio</h2>
            {panel.laboratorios.length === 0 ? (
              <p className={styles.vacio}>Sin solicitudes enviadas en el período.</p>
            ) : (
              <table className={styles.tabla}>
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
          </section>

          <section className={styles.tarjeta} aria-labelledby="titulo-faltan">
            <h2 id="titulo-faltan" className={styles.titulo}>Lo que falta por llegar</h2>
            {faltan.length === 0 ? (
              <p className={styles.vacio}>No hay solicitudes esperando informe.</p>
            ) : (
              <ul className={styles.faltan}>
                {faltan.slice(0, 8).map((s) => (
                  <li key={s.ot}>
                    <span className={styles.ot}>{s.ot}</span>
                    <span className={styles.detalle}>
                      {s.laboratorio} · {s.ship_to || s.sold_to || 'sin planta'}
                      <em>enviada {fechaHoraCorta(s.enviada_en)}</em>
                    </span>
                    <span className={styles.espera}>{dias(s.dias_esperando)}</span>
                  </li>
                ))}
              </ul>
            )}
            {faltan.length > 8 && (
              <button type="button" className={styles.verTodas} onClick={() => onIr({ pestana: 'solicitudes', estado: 'esperando' })}>
                Ver las {faltan.length} que faltan
              </button>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
