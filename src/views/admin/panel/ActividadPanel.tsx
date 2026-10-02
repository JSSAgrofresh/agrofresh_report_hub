import { useEffect, useState } from 'react'
import {
  COLOR_CATEGORIA,
  ETIQUETA_CATEGORIA,
  iniciales,
  leerActividad,
  leerResumen,
} from '@/features/adminPanel'
import type { ActividadPanel as Actividad, CategoriaActividad, ResumenPanel } from '@/features/adminPanel'
import { fechaHora } from '@/lib/fechaHoraChile'
import { BarrasDiarias } from './Graficos'
import styles from './PanelAdmin.module.css'

const nf = new Intl.NumberFormat('es-CL')
const PERIODOS = [7, 30, 90]
const FILTROS: { id: string; etiqueta: string }[] = [
  { id: '', etiqueta: 'Todo' },
  { id: 'solicitudes', etiqueta: 'Toma de muestras' },
  { id: 'cargas', etiqueta: 'Cargas' },
  { id: 'verificaciones', etiqueta: 'Verificaciones' },
  { id: 'laboratorio', etiqueta: 'Laboratorio' },
  { id: 'informes', etiqueta: 'Informes' },
  { id: 'acceso', etiqueta: 'Accesos' },
  { id: 'sensible', etiqueta: 'Cambios sensibles' },
]

/** Qué hace cada persona: ranking a la izquierda; al elegir a alguien, su ficha
 * y su historial; sin nadie elegido, el historial de todo el equipo. */
export function ActividadPanel({ emailInicial, onCambiarEmail }: { emailInicial: string | null; onCambiarEmail: (e: string | null) => void }) {
  const [dias, setDias] = useState(30)
  const [categoria, setCategoria] = useState('')
  const [datos, setDatos] = useState<{ clave: string; act: Actividad } | null>(null)
  const [resumen, setResumen] = useState<ResumenPanel | null>(null)
  const [error, setError] = useState<string | null>(null)

  const clave = `${dias}|${emailInicial ?? ''}|${categoria}`

  useEffect(() => {
    let cancelado = false
    leerActividad({ dias, email: emailInicial ?? undefined, categoria: categoria || undefined })
      .then((a) => {
        if (cancelado) return
        setDatos({ clave, act: a })
        setError(null)
      })
      .catch((e: unknown) => {
        if (!cancelado) setError(e instanceof Error ? e.message : 'No se pudo cargar la actividad.')
      })
    return () => {
      cancelado = true
    }
  }, [dias, emailInicial, categoria, clave])

  useEffect(() => {
    let cancelado = false
    leerResumen(dias)
      .then((r) => { if (!cancelado) setResumen(r) })
      .catch(() => undefined)
    return () => {
      cancelado = true
    }
  }, [dias])

  const act = datos?.act ?? null
  const cargando = !error && (datos === null || datos.clave !== clave)
  const persona = resumen?.usuarios.find((u) => u.email.toLowerCase() === (emailInicial ?? '').toLowerCase()) ?? null
  const maxAcciones = Math.max(1, ...(resumen?.usuarios.map((u) => u.acciones) ?? [1]))

  return (
    <section className={styles.panel} aria-label="Actividad por persona" aria-busy={cargando}>
      <div className={styles.barra}>
        <h2>
          {persona ? persona.nombre : 'Actividad del equipo'}
          <small>{persona ? `${persona.email} · ${persona.tipo}` : 'Qué hace cada persona: elige a alguien para ver su ficha'}</small>
        </h2>
        <div className={styles.periodo} role="group" aria-label="Período">
          {PERIODOS.map((d) => (
            <button key={d} type="button" aria-pressed={dias === d} onClick={() => setDias(d)}>{d} días</button>
          ))}
        </div>
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}

      <div className={styles.dosCol}>
        <div className={styles.card}>
          <h3>Personas <em>acciones en {dias} días</em></h3>
          {emailInicial && (
            <button type="button" className={styles.volver} onClick={() => onCambiarEmail(null)}>← Todo el equipo</button>
          )}
          {!resumen && <p className={styles.vacio}>Cargando…</p>}
          {resumen?.usuarios.map((u) => (
            <button
              key={u.email}
              type="button"
              className={`${styles.persona} ${u.dormida ? styles.dormida : ''}`}
              aria-pressed={u.email.toLowerCase() === (emailInicial ?? '').toLowerCase()}
              onClick={() => onCambiarEmail(u.email)}
            >
              <span className={styles.avatar}>{iniciales(u.nombre)}</span>
              <span className={styles.quien}>
                <span className={styles.nombre}>{u.nombre}</span>
                <span className={styles.sub}>
                  {u.ultima_actividad ? `Último: ${fechaHora(u.ultima_actividad)}` : 'Sin actividad registrada'}
                  {u.dormida && ' · dormida'}
                </span>
              </span>
              <span className={styles.barraUso}><i style={{ width: `${u.acciones ? Math.max(4, (u.acciones / maxAcciones) * 100) : 0}%` }} /></span>
              <span className={styles.cuenta}>{nf.format(u.acciones)}</span>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0, opacity: cargando ? 0.55 : 1 }}>
          {act && (
            <div className={styles.card}>
              <h3>{persona ? `Lo que hizo ${persona.nombre.split(' ')[0]}` : 'Acciones por día'} <em>acciones registradas</em></h3>
              <BarrasDiarias serie={act.serie} />
              {act.ficha && (
                <div className={styles.ficha}>
                  <div><b>{nf.format(act.ficha.acciones)}</b><span>acciones</span></div>
                  <div><b>{nf.format(act.ficha.accesos)}</b><span>ingresos</span></div>
                  <div><b>{nf.format(act.ficha.visitas)}</b><span>visitas a módulos</span></div>
                </div>
              )}
              {act.visitas_por_modulo.length > 0 && (
                <ul className={styles.desglose} aria-label="Visitas por módulo">
                  {act.visitas_por_modulo.map((v) => (
                    <li key={v.modulo}><span>{v.modulo}</span><b>{nf.format(v.visitas)} visitas</b></li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className={styles.card}>
            <h3>Historial <em>{act ? `${nf.format(act.total)} registros` : ''}</em></h3>
            <div className={styles.filtros} role="group" aria-label="Tipo de acción">
              {FILTROS.map((f) => (
                <button key={f.id} type="button" className={styles.chip} aria-pressed={categoria === f.id} onClick={() => setCategoria(f.id)}>
                  {f.etiqueta}
                </button>
              ))}
            </div>
            {act && act.eventos.length === 0 && <p className={styles.vacio}>No hay registros con estos filtros.</p>}
            {act?.eventos.map((e, i) => (
              <div key={`${e.t}-${i}`} className={styles.evento}>
                <i style={{ background: COLOR_CATEGORIA[e.categoria] ?? '#77837b' }} />
                <div>
                  {!emailInicial && <b>{e.nombre ?? e.email ?? 'Sistema'} </b>}
                  {e.texto}
                  <small>{fechaHora(e.t)} · {ETIQUETA_CATEGORIA[e.categoria as CategoriaActividad] ?? e.categoria}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
