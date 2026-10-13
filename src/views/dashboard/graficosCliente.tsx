import { Link } from 'react-router-dom'
import { MODULOS } from '@/constants/modules'
import type { PanelCliente } from '@/features/dashboard'
import { saludo } from '@/features/dashboard/lib/graficos'
import { Cargando, Tarjeta } from './graficos'
import styles from './graficos.module.css'

const ENTERO = (n: number) => n.toLocaleString('es-CL')

/** «2026-10-08» -> «8 de octubre de 2026». */
function fechaLarga(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** «2026-10» -> «oct 26» (con el año, para el globito). */
function mesCorto(aaaamm: string): string {
  const [y, m] = aaaamm.split('-').map(Number)
  return `${nombreMes(m)} ${String(y).slice(2)}`
}

/** «oct»: tres letras, para que quepan los 12 meses en una tarjeta angosta. */
function nombreMes(m: number): string {
  return new Date(2000, m - 1, 1).toLocaleDateString('es-CL', { month: 'short' }).replace('.', '').slice(0, 3)
}

/** Saludo con el nombre de la planta y cuántos análisis se le han hecho. */
export function SaludoCliente({ nombre, datos, cargando }: { nombre: string; datos: PanelCliente | null; cargando: boolean }) {
  const ahora = new Date()
  return (
    <section className={styles.hero} aria-label="Bienvenida">
      <p className={styles.heroSaludo}>{saludo(ahora.getHours())}, {nombre}</p>
      <p className={styles.heroFecha}>{ahora.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
      {cargando ? (
        <p className={styles.heroFecha}>Cargando tus análisis…</p>
      ) : datos ? (
        <>
          <div className={styles.cifras}>
            <div className={styles.cifra}><b>{ENTERO(datos.informes)}</b><span>informes de análisis</span></div>
            <div className={styles.cifra}><b>{ENTERO(datos.mediciones)}</b><span>resultados medidos</span></div>
          </div>
          <div className={styles.heroChips}>
            <span className={styles.chip}>{ENTERO(datos.ultimos_30_dias)} en los últimos 30 días</span>
            {datos.especies > 0 && <span className={styles.chip}>{datos.especies} {datos.especies === 1 ? 'especie' : 'especies'}</span>}
          </div>
        </>
      ) : null}
    </section>
  )
}

export function UltimoInformeCliente({ datos, cargando }: { datos: PanelCliente | null; cargando: boolean }) {
  const u = datos?.ultimo ?? null
  const ruta = MODULOS.find((m) => m.id === 'reports')?.ruta
  return (
    <Tarjeta titulo="Último informe">
      <Cargando cargando={cargando} hay={!!u}>
        {u && (
          <>
            <p className={styles.ultimoFecha}>{fechaLarga(u.fecha)}</p>
            <p className={styles.ultimoDetalle}>{[u.especie, u.variedad].filter(Boolean).join(' · ') || 'Sin especie'}</p>
            <ul className={styles.ultimoLista}>
              <li><span>Informe</span><b>{u.informe ?? '—'}</b></li>
              <li><span>Laboratorio</span><b>{u.laboratorio ?? '—'}</b></li>
            </ul>
            {ruta && <Link to={ruta} className={styles.ultimoEnlace}>Ver en Report →</Link>}
          </>
        )}
      </Cargando>
    </Tarjeta>
  )
}

export function InformesPorMes({ datos, cargando }: { datos: PanelCliente | null; cargando: boolean }) {
  const meses = datos?.por_mes ?? []
  const max = Math.max(1, ...meses.map((m) => m.n))
  return (
    <Tarjeta titulo="Informes por mes" sub="últimos 12 meses">
      <Cargando cargando={cargando} hay={meses.some((m) => m.n > 0)}>
        <div className={styles.meses} role="img" aria-label="Informes por mes">
          {meses.map((m) => (
            <div key={m.dia} className={styles.mes} title={`${mesCorto(m.dia)}: ${m.n}`}>
              <span className={styles.mesN}>{m.n > 0 ? m.n : ''}</span>
              <span
                className={`${styles.mesBarra} ${m.n === 0 ? styles.mesBarraVacia : ''}`}
                style={{ height: `${Math.max(3, (m.n / max) * 100)}%` }}
              />
              <span className={styles.mesNombre}>{nombreMes(Number(m.dia.slice(5)))}</span>
            </div>
          ))}
        </div>
      </Cargando>
    </Tarjeta>
  )
}
