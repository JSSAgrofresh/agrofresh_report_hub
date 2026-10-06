import { useEffect, useMemo, useState } from 'react'
import {
  COLOR_CALOR,
  COLOR_CATEGORIA,
  DIAS_SEMANA,
  ETIQUETA_CATEGORIA,
  ETIQUETA_ESTADO,
  horasPico,
  iniciales,
  leerSeguimiento,
  nivelCalor,
  usoFueraDeHorario,
} from '@/features/adminPanel'
import type { CategoriaActividad, EstadoPersona, Seguimiento } from '@/features/adminPanel'
import { fechaHora } from '@/lib/fechaHoraChile'
import styles from './PanelAdmin.module.css'

const nf = new Intl.NumberFormat('es-CL')
const PERIODOS = [7, 30, 90]
const MODULOS: CategoriaActividad[] = ['solicitudes', 'cargas', 'verificaciones', 'laboratorio', 'informes']
const ESTADOS: EstadoPersona[] = ['en_baja', 'dormida', 'nunca_ingreso', 'nueva', 'en_alza', 'activa']

function variacion(v: number | null, previas: number): string {
  if (v == null) return previas === 0 ? 'nuevo' : '—'
  return `${v > 0 ? '▲' : v < 0 ? '▼' : ''} ${Math.abs(v).toLocaleString('es-CL')} %`.trim()
}

/** Seguimiento del equipo: quién viene en alza o en baja, cuándo se usa el
 * sistema, qué módulos trabaja cada persona y quién nunca entró. */
export function SeguimientoPanel({ onVerPersona }: { onVerPersona: (email: string) => void }) {
  const [dias, setDias] = useState(30)
  const [datos, setDatos] = useState<Seguimiento | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<EstadoPersona | ''>('')

  useEffect(() => {
    let cancelado = false
    leerSeguimiento(dias)
      .then((d) => {
        if (cancelado) return
        setDatos(d)
        setError(null)
      })
      .catch((e: unknown) => {
        if (!cancelado) setError(e instanceof Error ? e.message : 'No se pudo cargar el seguimiento.')
      })
    return () => {
      cancelado = true
    }
  }, [dias])

  const cargando = !error && (datos === null || datos.dias !== dias)
  const maxCalor = useMemo(() => Math.max(0, ...(datos?.mapa.flat() ?? [0])), [datos])
  const pico = datos ? horasPico(datos.mapa) : null
  const fuera = datos ? usoFueraDeHorario(datos.mapa) : null
  const personas = (datos?.personas ?? []).filter((p) => !filtro || p.estado === filtro)

  return (
    <section className={styles.panel} aria-label="Seguimiento del equipo" aria-busy={cargando}>
      <div className={styles.barra}>
        <h2>
          Seguimiento del equipo
          <small>Cómo viene cada persona contra los {dias} días anteriores</small>
        </h2>
        <div className={styles.periodo} role="group" aria-label="Período">
          {PERIODOS.map((d) => (
            <button key={d} type="button" aria-pressed={dias === d} onClick={() => setDias(d)}>
              {d} días
            </button>
          ))}
        </div>
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}
      {!datos && !error && <p className={styles.vacio}>Cargando…</p>}

      {datos && (
        <div style={{ opacity: cargando ? 0.55 : 1, display: 'contents' }}>
          <div className={styles.kpis}>
            {ESTADOS.map((e) => (
              <button
                key={e}
                type="button"
                className={`${styles.card} ${styles.kpiBoton}`}
                aria-pressed={filtro === e}
                title={ETIQUETA_ESTADO[e].ayuda}
                onClick={() => setFiltro(filtro === e ? '' : e)}
              >
                <h3>{ETIQUETA_ESTADO[e].texto}</h3>
                <span className={styles.kpiValor}>{nf.format(datos.resumen[e])}</span>
                <span className={styles.kpiNota}>{ETIQUETA_ESTADO[e].ayuda}</span>
              </button>
            ))}
          </div>

          <div className={styles.card}>
            <h3>
              Personas <em>{filtro ? `solo «${ETIQUETA_ESTADO[filtro].texto}» · ` : ''}clic en el nombre para ver su historial</em>
            </h3>
            <div className={styles.scroll}>
              <table className={styles.tabla}>
                <thead>
                  <tr>
                    <th>Persona</th>
                    <th>Estado</th>
                    <th className={styles.num}>Acciones</th>
                    <th className={styles.num}>vs. antes</th>
                    <th className={styles.num}>Días activos</th>
                    <th className={styles.num}>Por día activo</th>
                    <th>Último movimiento</th>
                  </tr>
                </thead>
                <tbody>
                  {personas.length === 0 && (
                    <tr><td colSpan={7} className={styles.vacio}>Nadie con ese estado.</td></tr>
                  )}
                  {personas.map((p) => {
                    const e = ETIQUETA_ESTADO[p.estado]
                    return (
                      <tr key={p.email}>
                        <td>
                          <button type="button" className={styles.fila} onClick={() => onVerPersona(p.email)}>
                            <span className={styles.avatar} style={{ display: 'inline-grid', marginRight: 8, verticalAlign: 'middle' }}>{iniciales(p.nombre)}</span>
                            {p.nombre}
                          </button>
                        </td>
                        <td><span className={`${styles.etiqueta} ${styles[e.tono] ?? ''}`} title={e.ayuda}>{e.texto}</span></td>
                        <td className={styles.num}><b>{nf.format(p.acciones)}</b></td>
                        <td className={styles.num}>{variacion(p.variacion_pct, p.previas)}</td>
                        <td className={styles.num}>{nf.format(p.dias_activos)}</td>
                        <td className={styles.num}>{p.dias_activos ? p.por_dia_activo.toLocaleString('es-CL') : '—'}</td>
                        <td>{p.ultima_actividad ? fechaHora(p.ultima_actividad) : 'nunca'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className={styles.fila2}>
            <div className={styles.card}>
              <h3>
                Cuándo se usa el sistema <em>hora de Chile · más oscuro = más uso</em>
              </h3>
              <div className={styles.scroll}>
                <div className={styles.mapa} role="img" aria-label="Mapa de calor del uso por día y hora">
                  <span />
                  {Array.from({ length: 24 }, (_, h) => (
                    <span key={h} className={styles.hora}>{h % 3 === 0 ? h : ''}</span>
                  ))}
                  {datos.mapa.map((fila, d) => (
                    <FilaMapa key={d} dia={DIAS_SEMANA[d].slice(0, 3)} fila={fila} max={maxCalor} dow={DIAS_SEMANA[d]} />
                  ))}
                </div>
              </div>
              <p className={styles.kpiNota}>
                {pico
                  ? `Mayor uso: ${pico.dia.toLowerCase()} a las ${String(pico.hora).padStart(2, '0')}:00. `
                  : 'Todavía no hay uso registrado en este período. '}
                {fuera != null && `${fuera} % del uso ocurre fuera del horario de oficina (8 a 19 h, lunes a viernes).`}
              </p>
            </div>

            <div className={styles.card}>
              <h3>Qué parte del equipo usa cada módulo <em>personas con al menos una acción</em></h3>
              <div className={styles.adopcion}>
                {datos.adopcion.map((a) => (
                  <div key={a.categoria} className={styles.linea}>
                    <span>
                      <i className={styles.punto} style={{ background: COLOR_CATEGORIA[a.categoria] }} />
                      {a.modulo}
                    </span>
                    <span className={styles.pista}><i style={{ width: `${a.pct}%`, background: COLOR_CATEGORIA[a.categoria] }} /></span>
                    <b>{a.personas} de {a.de}</b>
                  </div>
                ))}
              </div>
              <p className={styles.kpiNota}>Un módulo con pocas personas es una oportunidad de capacitación o de revisar si de verdad se necesita.</p>
            </div>
          </div>

          <div className={styles.card}>
            <h3>Quién trabaja en qué <em>acciones por módulo en {dias} días</em></h3>
            <div className={styles.scroll}>
              <table className={styles.tabla}>
                <thead>
                  <tr>
                    <th>Persona</th>
                    {MODULOS.map((m) => (
                      <th key={m} className={styles.num}>{ETIQUETA_CATEGORIA[m]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {datos.personas.filter((p) => p.acciones > 0).map((p) => {
                    const max = Math.max(1, ...datos.personas.flatMap((q) => MODULOS.map((m) => q.por_categoria[m] ?? 0)))
                    return (
                      <tr key={p.email}>
                        <td>{p.nombre}</td>
                        {MODULOS.map((m) => {
                          const v = p.por_categoria[m] ?? 0
                          const n = nivelCalor(v, max)
                          return (
                            <td key={m} className={styles.num}>
                              <span className={styles.intensidad} style={{ background: COLOR_CALOR[n], color: n >= 3 ? '#fff' : 'inherit' }}>{v || '·'}</span>
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                  {datos.personas.every((p) => p.acciones === 0) && (
                    <tr><td colSpan={MODULOS.length + 1} className={styles.vacio}>Nadie registró acciones en este período.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function FilaMapa({ dia, fila, max, dow }: { dia: string; fila: number[]; max: number; dow: string }) {
  return (
    <>
      <span>{dia}</span>
      {fila.map((v, h) => (
        <span
          key={h}
          className={styles.celda}
          style={{ background: COLOR_CALOR[nivelCalor(v, max)] }}
          title={`${dow} ${String(h).padStart(2, '0')}:00 · ${v} ${v === 1 ? 'acción' : 'acciones'}`}
        />
      ))}
    </>
  )
}
