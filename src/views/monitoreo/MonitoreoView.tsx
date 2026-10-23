import { useMemo, useState, type CSSProperties, type PointerEvent } from 'react'
import { Link } from 'react-router-dom'
import { iniciales } from '@/features/adminPanel'
import { useAuth } from '@/features/auth'
import {
  hace, horaChile, SEGUNDOS_REFRESCO, tonoDe, trazoPulso, useContador, useMonitoreo,
  type BloquePulso, type Conectado, type InformeLlegado, type ResumenMonitoreo, type SolicitudEnviada,
} from '@/features/monitoreo'
import { CORREO_MAESTRO } from '@/features/usuarios'
import { ROUTES } from '@/constants/routes'
import { DetalleSheet } from './DetalleSheet'
import styles from './MonitoreoView.module.css'

const estiloI = (i: number) => ({ '--i': Math.min(i, 12) }) as CSSProperties

function Tarjeta({ titulo, cuenta, children, acento }: { titulo: string; cuenta?: string; children: React.ReactNode; acento?: string }) {
  return (
    <section className={styles.tarjeta} style={acento ? ({ '--acento': acento } as CSSProperties) : undefined}>
      <header className={styles.tarjetaCabecera}>
        <h2>{titulo}</h2>
        {cuenta && <span>{cuenta}</span>}
      </header>
      {children}
    </section>
  )
}

function Kpi({ etiqueta, valor, pie, tono }: { etiqueta: string; valor: number; pie?: string; tono?: 'verde' | 'azul' | 'ambar' | 'rojo' }) {
  const v = useContador(valor)
  return (
    <div className={`${styles.kpi} ${styles[`kpi_${tono ?? 'verde'}`]}`}>
      <span className={styles.kpiEtiqueta}>{etiqueta}</span>
      <strong className={styles.kpiValor}>{v}</strong>
      {pie && <span className={styles.kpiPie}>{pie}</span>}
    </div>
  )
}

function Pulso({ pulso }: { pulso: BloquePulso[] }) {
  const ANCHO = 320
  const ALTO = 96
  const [sel, setSel] = useState<number | null>(null)
  const trabajo = useMemo(() => trazoPulso(pulso.map((b) => b.trabajo), ANCHO, ALTO), [pulso])
  const accesos = useMemo(() => trazoPulso(pulso.map((b) => b.accesos), ANCHO, ALTO), [pulso])
  const total = pulso.reduce((s, b) => s + b.trabajo, 0)
  const pico = pulso.reduce((m, b) => (b.trabajo > m.trabajo ? b : m), pulso[0])
  const idx = sel ?? pulso.length - 1
  const actual = pulso[idx]

  const mover = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const p = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    setSel(Math.round(p * (pulso.length - 1)))
  }
  const x = pulso.length > 1 ? (idx / (pulso.length - 1)) * ANCHO : ANCHO / 2

  return (
    <Tarjeta titulo="Pulso de las últimas 24 h" cuenta={`${total} acciones`}>
      <div className={styles.pulsoLectura} aria-live="polite">
        <b>{actual ? actual.trabajo : 0}</b> acciones
        <span>{actual ? `${horaChile(actual.hora)} h` : ''}{sel === null ? ' · hora en curso' : ''}</span>
      </div>
      <div
        className={styles.pulso}
        onPointerMove={mover}
        onPointerDown={mover}
        onPointerLeave={() => setSel(null)}
        role="img"
        aria-label={`Actividad por hora. Pico ${pico?.trabajo ?? 0} a las ${horaChile(pico?.hora)}`}
      >
        <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="pulsoRelleno" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8be04a" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#8be04a" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path className={styles.pulsoArea} d={trabajo.area} fill="url(#pulsoRelleno)" />
          <path className={styles.pulsoAccesos} d={accesos.linea} pathLength={1} />
          <path className={styles.pulsoLinea} d={trabajo.linea} pathLength={1} />
          <line className={styles.pulsoGuia} x1={x} x2={x} y1={0} y2={ALTO} />
        </svg>
        {trabajo.ultimo && sel === null && (
          <i className={styles.pulsoPunto} style={{ left: `${(trabajo.ultimo.x / ANCHO) * 100}%`, top: `${(trabajo.ultimo.y / ALTO) * 100}%` }} />
        )}
      </div>
      <div className={styles.pulsoEjes}>
        {[0, 6, 12, 18, 23].map((k) => <span key={k}>{horaChile(pulso[k]?.hora).slice(0, 2)} h</span>)}
      </div>
    </Tarjeta>
  )
}

function Avatar({ nombre, email, enLinea }: { nombre: string; email: string; enLinea: boolean }) {
  return (
    <span className={`${styles.avatar} ${enLinea ? styles.avatarVivo : ''}`} style={{ '--tono': tonoDe(email) } as CSSProperties}>
      {iniciales(nombre)}
    </span>
  )
}

function Conectados({ datos, ahoraMs, nuevos, onAbrir }: { datos: ResumenMonitoreo; ahoraMs: number; nuevos: Set<string>; onAbrir: (c: Conectado) => void }) {
  const lista = datos.conectados
  return (
    <Tarjeta titulo="Gente conectada" cuenta={`${datos.en_linea} en línea`} acento="#8be04a">
      {lista.length === 0 ? (
        <p className={styles.vacio}>Nadie conectado en este momento.</p>
      ) : (
        <ul className={styles.lista}>
          {lista.map((c, i) => (
            <li key={c.email} style={estiloI(i)}>
              <button type="button" className={`${styles.fila} ${nuevos.has(c.email) ? styles.nuevo : ''}`} onClick={() => onAbrir(c)}>
                <Avatar nombre={c.nombre} email={c.email} enLinea={c.estado === 'en_linea'} />
                <span className={styles.filaCuerpo}>
                  <b>{c.nombre}{c.yo && <em> · tú</em>}</b>
                  <small>
                    {c.estado === 'en_linea' ? (c.modulo ?? 'Conectado') : `Estuvo ${hace(c.ultimo, ahoraMs)}${c.modulo ? ` · ${c.modulo}` : ''}`}
                  </small>
                  {c.ultima_accion && <small className={styles.accion}>↳ {c.ultima_accion}</small>}
                </span>
                <span className={styles.filaLado}>
                  <b>{c.acciones_hoy}</b>
                  <small>hoy</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  )
}

function pastillaInforme(i: InformeLlegado): { texto: string; clase: string } {
  if (i.decision === 'rechazado') return { texto: 'Rechazado', clase: styles.pGris }
  if (i.decision === 'aceptado') return { texto: 'Aceptado', clase: styles.pVerde }
  if (i.estado === 'rojo') return { texto: 'Revisar envío', clase: styles.pRojo }
  if (i.estado === 'amarillo') return { texto: 'Por revisar', clase: styles.pAmbar }
  return { texto: i.ya_cargado ? 'Ya cargado' : 'Listo', clase: styles.pVerde }
}

function Informes({ informes, ahoraMs, nuevos }: { informes: InformeLlegado[]; ahoraMs: number; nuevos: Set<string> }) {
  return (
    <Tarjeta titulo="Informes que han llegado" cuenta="correo" acento="#5aa7e0">
      {informes.length === 0 ? <p className={styles.vacio}>Aún no llega ningún informe.</p> : (
        <ul className={styles.lista}>
          {informes.map((i, k) => {
            const p = pastillaInforme(i)
            return (
              <li key={i.id} style={estiloI(k)} className={`${styles.item} ${nuevos.has(String(i.id)) ? styles.nuevo : ''}`}>
                <span className={styles.lab} style={{ '--tono': tonoDe(i.laboratorio ?? '?') } as CSSProperties}>{(i.laboratorio ?? '?').slice(0, 3).toUpperCase()}</span>
                <span className={styles.filaCuerpo}>
                  <b>{i.nro_informe ?? 'Sin N°'}</b>
                  <small>{[i.ship_to ?? i.laboratorio, i.ot].filter(Boolean).join(' · ') || '—'}</small>
                </span>
                <span className={styles.filaLado}>
                  <span className={`${styles.pastilla} ${p.clase}`}>{p.texto}</span>
                  <small>{hace(i.llegada, ahoraMs)}</small>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Tarjeta>
  )
}

function Solicitudes({ solicitudes, ahoraMs, nuevos }: { solicitudes: SolicitudEnviada[]; ahoraMs: number; nuevos: Set<string> }) {
  return (
    <Tarjeta titulo="Últimas solicitudes enviadas" cuenta="a laboratorios" acento="#e8c32e">
      {solicitudes.length === 0 ? <p className={styles.vacio}>Todavía no se envía ninguna solicitud.</p> : (
        <ul className={styles.lista}>
          {solicitudes.map((s, k) => (
            <li key={s.id} style={estiloI(k)} className={`${styles.item} ${nuevos.has(String(s.id)) ? styles.nuevo : ''}`}>
              <span className={`${styles.estadoEnvio} ${s.exitoso ? styles.pVerde : styles.pRojo}`} aria-label={s.exitoso ? 'Enviada' : 'Falló'}>{s.exitoso ? '✓' : '✕'}</span>
              <span className={styles.filaCuerpo}>
                <b>{s.numero ?? 'Sin N°'}{s.laboratorio && <em> · {s.laboratorio}</em>}</b>
                <small>{s.exitoso ? (s.ship_to ?? '—') : (s.error ?? 'No se pudo enviar')}</small>
                {s.enviado_por && <small className={styles.accion}>por {s.enviado_por}</small>}
              </span>
              <span className={styles.filaLado}><small>{hace(s.t, ahoraMs)}</small></span>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  )
}

function Alertas({ datos, ahoraMs }: { datos: ResumenMonitoreo; ahoraMs: number }) {
  const { envios_fallidos: fallidos, informes_en_rojo: rojos } = datos.alertas
  if (fallidos.length === 0 && rojos === 0) return null
  return (
    <Tarjeta titulo="Requiere tu atención" cuenta={`${fallidos.length + rojos}`} acento="#ff6b5e">
      <ul className={styles.lista}>
        {rojos > 0 && (
          <li className={styles.item}>
            <span className={`${styles.estadoEnvio} ${styles.pRojo}`}>!</span>
            <span className={styles.filaCuerpo}><b>{rojos} informe{rojos === 1 ? '' : 's'} con el envío mal hecho</b><small>Están en rojo en Ingreso de Informes</small></span>
          </li>
        )}
        {fallidos.map((f, k) => (
          <li key={`${f.referencia}-${k}`} className={styles.item}>
            <span className={`${styles.estadoEnvio} ${styles.pRojo}`}>✕</span>
            <span className={styles.filaCuerpo}><b>{f.tipo} {f.referencia}</b><small>{f.error}</small></span>
            <span className={styles.filaLado}><small>{hace(f.creado_en, ahoraMs)}</small></span>
          </li>
        ))}
      </ul>
    </Tarjeta>
  )
}

export function MonitoreoView() {
  const { user } = useAuth()
  const esPrincipal = user?.tipoAcceso === 'admin_general' && user.email.toLowerCase() === CORREO_MAESTRO
  if (!esPrincipal) {
    return (
      <div className={styles.raiz}><div className={styles.fondo} aria-hidden="true" />
        <main className={styles.contenido}><p className={styles.vacio}>El monitoreo es solo para el administrador principal.</p>
          <Link className={styles.volver} to={ROUTES.dashboard}>Volver</Link></main>
      </div>
    )
  }
  return <Monitoreo />
}

function Monitoreo() {
  const { datos, error, nuevos, refrescando, refrescar, ahoraMs, ultimaVuelta, segundosDesdeVuelta } = useMonitoreo()
  const [abierto, setAbierto] = useState<{ email: string; nombre: string } | null>(null)

  const alertas = datos ? datos.alertas.envios_fallidos.length + datos.alertas.informes_en_rojo : 0

  return (
    <div className={styles.raiz}>
      <div className={styles.fondo} aria-hidden="true"><i /><i /><i /></div>
      <header className={styles.barra}>
        <Link to={ROUTES.dashboard} className={styles.volver} aria-label="Volver al sistema">‹</Link>
        <div className={styles.marca}>
          <h1>Monitoreo</h1>
          <p className={error ? styles.sinSenal : styles.envivo}>
            <i />{error ? 'Sin conexión' : 'En vivo'}
            {datos && !error && <span> · hace {segundosDesdeVuelta} s</span>}
          </p>
        </div>
        <button type="button" className={`${styles.refrescar} ${refrescando ? styles.girando : ''}`} onClick={() => void refrescar()} aria-label="Actualizar ahora">
          <svg viewBox="0 0 36 36" aria-hidden="true">
            <circle className={styles.anilloFondo} cx="18" cy="18" r="15" />
            <circle key={ultimaVuelta} className={styles.anillo} cx="18" cy="18" r="15" style={{ animationDuration: `${SEGUNDOS_REFRESCO}s` }} />
            <path d="M24 14.5A7 7 0 1 0 25 19M24 10v4.5h-4.5" />
          </svg>
        </button>
      </header>

      <main className={styles.contenido}>
        {error && !datos && <p className={styles.vacio}>{error}</p>}
        {!datos && !error && (
          <div className={styles.cargaInicial}>{[0, 1, 2, 3].map((i) => <span key={i} className={styles.esqueleto} style={{ height: i === 0 ? 120 : 90 }} />)}</div>
        )}
        {datos && (
          <>
            <div className={styles.kpis}>
              <Kpi etiqueta="En línea ahora" valor={datos.en_linea} pie={`${datos.kpis.personas_hoy} personas hoy`} />
              <Kpi etiqueta="Informes hoy" valor={datos.kpis.informes_hoy} pie="llegaron al correo" tono="azul" />
              <Kpi etiqueta="Solicitudes hoy" valor={datos.kpis.solicitudes_creadas_hoy} pie={`${datos.kpis.solicitudes_enviadas_hoy} enviadas`} tono="ambar" />
              <Kpi etiqueta="Atención" valor={alertas} pie={alertas ? 'por revisar' : 'todo en orden'} tono={alertas ? 'rojo' : 'verde'} />
            </div>

            <Pulso pulso={datos.pulso} />
            <div className={styles.columnas}>
              <div className={styles.columna}>
                <Alertas datos={datos} ahoraMs={ahoraMs} />
                <Conectados datos={datos} ahoraMs={ahoraMs} nuevos={nuevos.conectados} onAbrir={(c) => setAbierto({ email: c.email, nombre: c.nombre })} />
              </div>
              <div className={styles.columna}><Informes informes={datos.informes} ahoraMs={ahoraMs} nuevos={nuevos.informes} /></div>
              <div className={styles.columna}><Solicitudes solicitudes={datos.solicitudes} ahoraMs={ahoraMs} nuevos={nuevos.solicitudes} /></div>
            </div>
            <p className={styles.pie}>Se actualiza sola cada {SEGUNDOS_REFRESCO} s · hora de Chile</p>
          </>
        )}
      </main>

      {abierto && <DetalleSheet key={abierto.email} email={abierto.email} nombre={abierto.nombre} onCerrar={() => setAbierto(null)} />}
    </div>
  )
}
