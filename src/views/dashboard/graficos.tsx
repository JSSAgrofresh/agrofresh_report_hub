import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { AREAS } from '@/constants/areas'
import type { AreaId } from '@/constants/areas'
import type { ActividadDashboard, PuntoDia, PuntoNombre, SeriesDashboard } from '@/features/dashboard'
import {
  agruparTop, armarSlides, celdasVerificacion, indiceMasCercano, maximoEje, saludo,
} from '@/features/dashboard/lib/graficos'
import styles from './graficos.module.css'

const fmtDia = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${d}-${m}`
}

/** Ancho real del contenedor (los textos del SVG no se deforman). En jsdom no hay ResizeObserver: usa 480. */
function useAncho<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null)
  const [ancho, setAncho] = useState(480)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setAncho(Math.max(160, el.clientWidth)))
    ro.observe(el)
    setAncho(Math.max(160, el.clientWidth))
    return () => ro.disconnect()
  }, [])
  return [ref, ancho]
}

function Tarjeta({ titulo, sub, children }: { titulo: string; sub?: string; children: ReactNode }) {
  return (
    <section className={styles.tarjeta} aria-label={titulo}>
      <div className={styles.cab}>
        <h3 className={styles.titulo}>{titulo}</h3>
        {sub && <span className={styles.sub}>{sub}</span>}
      </div>
      {children}
    </section>
  )
}

function Cargando({ cargando, hay, children }: { cargando: boolean; hay: boolean; children: ReactNode }) {
  if (cargando) return <p className={styles.vacio}>Cargando…</p>
  if (!hay) return <p className={styles.vacio}>Todavía no hay datos para mostrar.</p>
  return <>{children}</>
}

// ── Línea de tiempo (área) con línea guía y globito ──────────────────────

export function GraficoActividad({ datos, cargando }: { datos: PuntoDia[]; cargando: boolean }) {
  const [ref, ancho] = useAncho<HTMLDivElement>()
  const [activo, setActivo] = useState<number | null>(null)
  const alto = 190
  const m = { t: 10, r: 8, b: 22, l: 30 }
  const total = datos.reduce((s, d) => s + d.n, 0)
  const max = maximoEje(Math.max(0, ...datos.map((d) => d.n)))
  const w = ancho - m.l - m.r
  const h = alto - m.t - m.b
  const x = (i: number) => m.l + (datos.length <= 1 ? 0 : (i / (datos.length - 1)) * w)
  const y = (n: number) => m.t + h - (n / max) * h
  const linea = datos.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.n).toFixed(1)}`).join(' ')
  const area = datos.length ? `${linea} L${x(datos.length - 1).toFixed(1)},${m.t + h} L${x(0).toFixed(1)},${m.t + h} Z` : ''
  const mover = (e: React.PointerEvent<SVGSVGElement>) => {
    const caja = e.currentTarget.getBoundingClientRect()
    setActivo(indiceMasCercano(e.clientX - caja.left, m.l, w, datos.length))
  }
  const teclas = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight') setActivo((a) => Math.min(datos.length - 1, (a ?? -1) + 1))
    else if (e.key === 'ArrowLeft') setActivo((a) => Math.max(0, (a ?? datos.length) - 1))
    else if (e.key === 'Escape') setActivo(null)
  }
  const sel = activo !== null ? datos[activo] : null
  return (
    <Tarjeta titulo="Solicitudes por día" sub="últimos 30 días">
      <Cargando cargando={cargando} hay={datos.length > 0}>
        <div className={styles.lienzo} ref={ref}>
          <svg
            className={styles.dibujo}
            viewBox={`0 0 ${ancho} ${alto}`}
            height={alto}
            role="img"
            tabIndex={0}
            aria-label={`Solicitudes por día en los últimos 30 días: ${total} en total. Con las flechas recorres los días.`}
            onPointerMove={mover}
            onPointerLeave={() => setActivo(null)}
            onKeyDown={teclas}
            onBlur={() => setActivo(null)}
          >
            <defs>
              <linearGradient id="gradActividad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1C7FA6" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#1C7FA6" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <g key={f}>
                <line className={styles.grilla} x1={m.l} x2={m.l + w} y1={m.t + h - f * h} y2={m.t + h - f * h} />
                <text className={styles.eje} x={m.l - 6} y={m.t + h - f * h + 3.5} textAnchor="end">{Math.round(f * max)}</text>
              </g>
            ))}
            {datos.map((d, i) => (i % 7 === 0 ? i < datos.length - 4 : i === datos.length - 1) && (
              <text key={d.dia} className={styles.eje} x={x(i)} y={alto - 5} textAnchor={i === 0 ? 'start' : i === datos.length - 1 ? 'end' : 'middle'}>{fmtDia(d.dia)}</text>
            ))}
            <path d={area} fill="url(#gradActividad)" />
            <path d={linea} fill="none" stroke="#1C7FA6" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {sel && activo !== null && (
              <g>
                <line x1={x(activo)} x2={x(activo)} y1={m.t} y2={m.t + h} stroke="var(--color-border-strong)" strokeWidth="1" />
                <circle cx={x(activo)} cy={y(sel.n)} r="5" fill="#1C7FA6" stroke="var(--color-surface)" strokeWidth="2" />
              </g>
            )}
          </svg>
          {sel && activo !== null && (
            <div className={styles.tip} style={{ left: Math.min(Math.max(x(activo), 60), ancho - 60), top: Math.max(y(sel.n) - 12, 28) }}>
              {fmtDia(sel.dia)} · <b>{sel.n}</b> {sel.n === 1 ? 'solicitud' : 'solicitudes'}
            </div>
          )}
          <table className={styles.sr}>
            <caption>Solicitudes por día</caption>
            <tbody>{datos.map((d) => <tr key={d.dia}><th>{d.dia}</th><td>{d.n}</td></tr>)}</tbody>
          </table>
        </div>
      </Cargando>
    </Tarjeta>
  )
}

// ── Dona ─────────────────────────────────────────────────────────────────

export function GraficoDona({ titulo, sub, datos, cargando, unidad }: { titulo: string; sub?: string; datos: PuntoNombre[]; cargando: boolean; unidad: string }) {
  const partes = useMemo(() => agruparTop(datos), [datos])
  const total = partes.reduce((s, p) => s + p.n, 0)
  const [activa, setActiva] = useState<number | null>(null)
  const R = 50
  const C = 2 * Math.PI * R
  const GAP = partes.length > 1 ? 2 : 0
  const inicios = partes.map((_, i) => partes.slice(0, i).reduce((s, q) => s + (q.n / total) * C, 0))
  const ver = activa !== null ? partes[activa] : null
  return (
    <Tarjeta titulo={titulo} sub={sub}>
      <Cargando cargando={cargando} hay={total > 0}>
        <div className={styles.dona}>
          <svg className={`${styles.donaSvg} ${styles.dibujo}`} viewBox="0 0 132 132" role="img" aria-label={`${titulo}: ${partes.map((p) => `${p.nombre} ${p.n}`).join(', ')}`}>
            <g transform="rotate(-90 66 66)">
              {partes.map((p, i) => {
                const largo = (p.n / total) * C
                return (
                  <circle
                    key={p.nombre}
                    className={styles.arco}
                    cx="66" cy="66" r={R} fill="none" stroke={p.color}
                    strokeWidth={activa === i ? 20 : 16}
                    opacity={activa === null || activa === i ? 1 : 0.45}
                    strokeDasharray={`${Math.max(largo - GAP, 0.5)} ${C}`}
                    strokeDashoffset={-inicios[i]}
                    onPointerEnter={() => setActiva(i)}
                    onPointerLeave={() => setActiva(null)}
                  />
                )
              })}
            </g>
            <text className={styles.donaNum} x="66" y="66" textAnchor="middle">{(ver?.n ?? total).toLocaleString('es-CL')}</text>
            <text className={styles.donaEtq} x="66" y="80" textAnchor="middle">{ver ? ver.nombre.slice(0, 16) : unidad}</text>
          </svg>
          <ul className={styles.leyenda}>
            {partes.map((p, i) => (
              <li key={p.nombre} className={styles.leyendaFila} data-activa={activa === i} onPointerEnter={() => setActiva(i)} onPointerLeave={() => setActiva(null)}>
                <span className={styles.punto} style={{ background: p.color }} />
                <span className={styles.leyendaNombre} title={p.nombre}>{p.nombre}</span>
                <span className={styles.leyendaVal}>{p.n.toLocaleString('es-CL')}</span>
              </li>
            ))}
          </ul>
        </div>
      </Cargando>
    </Tarjeta>
  )
}

// ── Barras horizontales ─────────────────────────────────────────────────

export function GraficoBarras({ titulo, sub, datos, cargando }: { titulo: string; sub?: string; datos: PuntoNombre[]; cargando: boolean }) {
  const top = [...datos].filter((d) => d.n > 0).sort((a, b) => b.n - a.n).slice(0, 6)
  const max = Math.max(1, ...top.map((d) => d.n))
  return (
    <Tarjeta titulo={titulo} sub={sub}>
      <Cargando cargando={cargando} hay={top.length > 0}>
        <ul className={styles.barras}>
          {top.map((d) => (
            <li key={d.nombre} className={styles.barraFila}>
              <span className={styles.barraNombre} title={d.nombre}>{d.nombre}</span>
              <span className={styles.barraPista}>
                <span className={styles.barra} style={{ display: 'block', width: `${(d.n / max) * 100}%` }} />
              </span>
              <span className={styles.barraVal}>{d.n.toLocaleString('es-CL')}</span>
            </li>
          ))}
        </ul>
      </Cargando>
    </Tarjeta>
  )
}

// ── Tira de verificaciones ──────────────────────────────────────────────

const ETQ_ESTADO = { ok: 'Aceptable', mal: 'No aceptable', sin: 'Sin veredicto', falta: 'Sin registro' } as const
const ICONO_ESTADO = { ok: '✓', mal: '✕', sin: '–', falta: '' } as const

export function TiraVerificaciones({ registros, cargando }: { registros: SeriesDashboard['verificaciones']; cargando: boolean }) {
  const celdas = useMemo(() => celdasVerificacion(registros, new Date()), [registros])
  const hechas = registros.length
  return (
    <Tarjeta titulo="Verificaciones diarias" sub={cargando ? undefined : `${hechas} de 30 días`}>
      <Cargando cargando={cargando} hay>
        <div className={styles.tira} role="list">
          {celdas.map((c) => (
            <button key={c.fecha} type="button" role="listitem" className={styles.celdaV} data-estado={c.estado} title={`${fmtDia(c.fecha)} · ${ETQ_ESTADO[c.estado]}`} aria-label={`${fmtDia(c.fecha)}: ${ETQ_ESTADO[c.estado]}`}>
              {ICONO_ESTADO[c.estado]}
            </button>
          ))}
        </div>
        <div className={styles.notas}>
          {(['ok', 'mal', 'sin', 'falta'] as const).map((k) => (
            <span key={k} className={styles.nota}>
              <span className={styles.celdaV} data-estado={k} style={{ width: 14, height: 14, display: 'inline-grid', fontSize: 9 }}>{ICONO_ESTADO[k]}</span>
              {ETQ_ESTADO[k]}
            </span>
          ))}
        </div>
      </Cargando>
    </Tarjeta>
  )
}

// ── Carrusel ────────────────────────────────────────────────────────────

export function CarruselNovedades({ actividad, cargando }: { actividad: ActividadDashboard | null; cargando: boolean }) {
  const slides = useMemo(() => armarSlides(actividad), [actividad])
  const [i, setI] = useState(0)
  const [pausa, setPausa] = useState(false)
  const reducido = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  useEffect(() => {
    if (pausa || reducido || slides.length < 2) return
    const t = setInterval(() => setI((k) => (k + 1) % slides.length), 6000)
    return () => clearInterval(t)
  }, [pausa, reducido, slides.length])
  if (cargando || slides.length === 0) {
    return <section className={styles.tarjeta} aria-label="Novedades"><p className={styles.vacio}>{cargando ? 'Cargando…' : 'Sin novedades.'}</p></section>
  }
  const ir = (k: number) => setI((k + slides.length) % slides.length)
  const actual = Math.min(i, slides.length - 1)
  return (
    <section
      className={`${styles.tarjeta} ${styles.carrusel}`}
      aria-roledescription="carrusel"
      aria-label="Novedades del sistema"
      onPointerEnter={() => setPausa(true)}
      onPointerLeave={() => setPausa(false)}
      onFocus={() => setPausa(true)}
      onBlur={() => setPausa(false)}
    >
      <div className={styles.pista} style={{ transform: `translateX(-${actual * 100}%)` }} aria-live={pausa ? 'polite' : 'off'}>
        {slides.map((s, k) => (
          <div key={s.clave} className={styles.slide} data-tono={s.tono} role="group" aria-roledescription="diapositiva" aria-label={`${k + 1} de ${slides.length}`} aria-hidden={k !== actual}>
            <span className={styles.slideTag}>{s.tag}</span>
            <span className={styles.slideNum}>{s.numero}</span>
            <span className={styles.slideTitulo}>{s.titulo}</span>
            <ul className={styles.slideLista}>{s.lineas.map((l, n) => <li key={n}>{l}</li>)}</ul>
          </div>
        ))}
      </div>
      <button type="button" className={`${styles.flecha} ${styles.izq}`} aria-label="Anterior" onClick={() => ir(actual - 1)}>‹</button>
      <button type="button" className={`${styles.flecha} ${styles.der}`} aria-label="Siguiente" onClick={() => ir(actual + 1)}>›</button>
      <div className={styles.mandos}>
        {slides.map((s, k) => (
          <button key={s.clave} type="button" className={styles.punta} aria-label={`Ir a ${s.tag}`} aria-current={k === actual} onClick={() => setI(k)} />
        ))}
      </div>
    </section>
  )
}

// ── Bienvenida ──────────────────────────────────────────────────────────

export function HeroBienvenida({ nombre, actividad, cargando }: { nombre: string; actividad: ActividadDashboard | null; cargando: boolean }) {
  const ahora = new Date()
  const m = actividad?.metricas
  return (
    <section className={styles.hero} aria-label="Bienvenida">
      <p className={styles.heroSaludo}>{saludo(ahora.getHours())}, {nombre.split(' ')[0]}</p>
      <p className={styles.heroFecha}>{ahora.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
      {!cargando && m && (
        <div className={styles.heroChips}>
          <span className={styles.chip}>{m.esta_semana} solicitudes esta semana</span>
          <span className={styles.chip}>{m.verificacion_hoy ? '✓ Verificación de hoy lista' : 'Verificación de hoy pendiente'}</span>
          {m.pendientes_converter > 0 && <span className={styles.chip}>{m.pendientes_converter} en cola Converter</span>}
        </div>
      )}
    </section>
  )
}

// ── Título de área ──────────────────────────────────────────────────────

const DESCRIPCION_AREA: Record<AreaId | 'general', string> = {
  general: 'Lo más importante del sistema, de un vistazo.',
  cromatografia: 'Ingreso de datos, residuos e informes del laboratorio.',
  postventa: 'Equipos Accu-Tab, lecturas de pH/ORP e informes.',
  ryd: 'Investigación y desarrollo.',
  toma_muestras: 'Solicitudes de análisis y envío a laboratorios.',
}

export function TituloArea({ area }: { area: AreaId | 'general' }) {
  const cfg = area === 'general' ? null : AREAS[area]
  return (
    <header className={styles.area} style={{ '--tono': cfg?.colorPrimario ?? '#6dad3c' } as React.CSSProperties}>
      <span className={styles.areaBarra} />
      <div>
        <h2 className={styles.areaTitulo}>{cfg?.nombre ?? 'General'}</h2>
        <p className={styles.areaSub}>{DESCRIPCION_AREA[area]}</p>
      </div>
    </header>
  )
}

// ── Sparkline para los indicadores ──────────────────────────────────────

export function Sparkline({ datos, color = '#1C7FA6' }: { datos: number[]; color?: string }) {
  if (datos.length < 2) return null
  const W = 120
  const H = 34
  const max = Math.max(1, ...datos)
  const pts = datos.map((n, i) => [(i / (datos.length - 1)) * W, H - 3 - (n / max) * (H - 8)] as const)
  const d = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ')
  const [ux, uy] = pts[pts.length - 1]
  return (
    <svg className={styles.spark} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={ux} cy={uy} r="2.6" fill={color} stroke="var(--color-surface)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

