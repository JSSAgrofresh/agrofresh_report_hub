import { useMemo, useState, type CSSProperties, type PointerEvent } from 'react'
import { Link } from 'react-router-dom'
import { iniciales } from '@/features/adminPanel'
import { useAuth } from '@/features/auth'
import {
  barrasDeSerie, duracionAcumulada, duracionSeg, ETIQUETA_ACTIVIDAD, ETIQUETA_TIPO, fechaCorta, hace, horaChile, indicesDeEje, OPCIONES_QUIEN, PERIODOS_ACUMULADO,
  PERIODOS_CLIENTES, PERIODOS_TOP, porcentajeDe, SEGUNDOS_REFRESCO, tendencia, textoInactividad, tonoDe, trazoPulso, useClientes, useContador, useHistorial,
  useInstalarApp, useMonitoreo, useTop,
  type BloquePulso, type Conectado, type EventoReciente, type InformeLlegado, type ModuloConGente, type OrdenClientes,
  type PeriodoAcumulado, type QuienTop, type ResumenMonitoreo, type SolicitudEnviada,
} from '@/features/monitoreo'
import { COLOR_CATEGORIA } from '@/features/adminPanel'
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

function Kpi({ etiqueta, valor, pie, tono }: { etiqueta: string; valor: number; pie?: string; tono?: 'verde' | 'azul' | 'ambar' | 'rojo' | 'violeta' | 'turquesa' }) {
  const v = useContador(valor)
  return (
    <div className={`${styles.kpi} ${styles[`kpi_${tono ?? 'verde'}`]}`}>
      <span className={styles.kpiEtiqueta}>{etiqueta}</span>
      <strong className={styles.kpiValor}>{v}</strong>
      {pie && <span className={styles.kpiPie}>{pie}</span>}
    </div>
  )
}

/** Un grupo de botones para elegir una opción (período, orden, quién). */
function Segmentos<T extends string | number>({ opciones, valor, alCambiar, etiqueta }: {
  opciones: readonly { valor: T; etiqueta: string }[]; valor: T; alCambiar: (v: T) => void; etiqueta: string
}) {
  return (
    <div className={styles.periodos} role="group" aria-label={etiqueta}>
      {opciones.map((o) => (
        <button key={String(o.valor)} type="button" className={o.valor === valor ? styles.periodoOn : ''} aria-pressed={o.valor === valor} onClick={() => alCambiar(o.valor)}>
          {o.etiqueta}
        </button>
      ))}
    </div>
  )
}

const comoOpciones = (ps: readonly { dias: number; etiqueta: string }[]) => ps.map((p) => ({ valor: p.dias, etiqueta: p.etiqueta }))

/** La actividad hora por hora de las últimas 24 h (el pulso de siempre). */
function PulsoHoras({ pulso }: { pulso: BloquePulso[] }) {
  const ANCHO = 320
  const ALTO = 96
  const [sel, setSel] = useState<number | null>(null)
  const trabajo = useMemo(() => trazoPulso(pulso.map((b) => b.trabajo), ANCHO, ALTO), [pulso])
  const accesos = useMemo(() => trazoPulso(pulso.map((b) => b.accesos), ANCHO, ALTO), [pulso])
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
    <>
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
    </>
  )
}

/** Las conexiones de cada uno de los últimos 30 días: una barra por día y, encima, cuántas personas distintas entraron. */
function ConexionesDias({ historial }: { historial: ReturnType<typeof useHistorial> }) {
  const ANCHO = 600
  const ALTO = 130
  const [sel, setSel] = useState<number | null>(null)
  const dias = useMemo(() => historial.datos?.por_dia ?? [], [historial.datos])
  const barras = useMemo(() => barrasDeSerie(dias.map((d) => d.conexiones), ANCHO, ALTO), [dias])
  if (historial.error && !historial.datos) return <p className={styles.vacio}>{historial.error}</p>
  if (!historial.datos) return <span className={styles.esqueleto} style={{ height: 170 }} />
  const h = historial.datos
  const maximo = Math.max(1, ...dias.map((d) => d.conexiones))
  const yPersonas = (v: number) => ALTO - (v / maximo) * (ALTO - 4)
  const idx = sel ?? dias.length - 1
  const actual = dias[idx]
  const personas = dias.map((d, i) => `${i === 0 ? 'M' : 'L'}${(((i + 0.5) / dias.length) * ANCHO).toFixed(1)},${yPersonas(d.personas).toFixed(1)}`).join(' ')

  const mover = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const p = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    setSel(Math.min(dias.length - 1, Math.floor(p * dias.length)))
  }

  return (
    <>
      <div className={styles.pulsoLectura} aria-live="polite">
        <b>{actual?.conexiones ?? 0}</b> {actual?.conexiones === 1 ? 'conexión' : 'conexiones'}
        <span>
          {actual ? `${actual.personas} ${actual.personas === 1 ? 'persona' : 'personas'} · ${fechaCorta(actual.dia)}` : ''}
          {sel === null ? ' · hoy' : ''}
          {actual?.aproximado && <em className={styles.aprox}> · por ingresos</em>}
        </span>
      </div>
      <div className={styles.barrasDia} onPointerMove={mover} onPointerDown={mover} onPointerLeave={() => setSel(null)} role="img"
        aria-label={`Conexiones por día de los últimos ${dias.length} días. Pico ${h.totales.pico?.conexiones ?? 0}`}>
        <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} preserveAspectRatio="none">
          {barras.map((b, i) => (
            <rect key={dias[i].dia} className={`${styles.bdia} ${dias[i].aproximado ? styles.bdiaAprox : ''} ${i === idx ? styles.bdiaSel : ''}`}
              x={b.x} y={b.y} width={b.ancho} height={b.alto} rx={3} style={{ '--i': i } as CSSProperties} />
          ))}
          <path className={styles.lineaPersonas} d={personas} />
        </svg>
      </div>
      <div className={styles.pulsoEjes}>
        {indicesDeEje(dias.length).map((k) => <span key={dias[k].dia}>{k === dias.length - 1 ? 'hoy' : fechaCorta(dias[k].dia)}</span>)}
      </div>
      <div className={styles.estadisticas}>
        <div className={styles.dato}><small>En {dias.length} días</small><b>{h.totales.conexiones}</b></div>
        <div className={styles.dato}><small>Personas distintas</small><b>{h.totales.personas}</b></div>
        <div className={styles.dato}><small>Día de más conexiones</small><b>{h.totales.pico ? `${fechaCorta(h.totales.pico.dia)} · ${h.totales.pico.conexiones}` : '—'}</b></div>
        <div className={styles.dato}><small>Promedio por día</small><b>{String(h.totales.promedio_dia).replace('.', ',')}</b></div>
      </div>
      <p className={styles.nota}>
        <i className={styles.leyendaBarra} /> conexiones · <i className={styles.leyendaLinea} /> personas distintas
        {!h.disponible || dias.some((d) => d.aproximado) ? ' · las barras claras son días anteriores al registro de visitas: se cuentan los ingresos al sistema' : ''}
      </p>
    </>
  )
}

function Conexiones({ pulso, historial }: { pulso: BloquePulso[]; historial: ReturnType<typeof useHistorial> }) {
  const [vista, setVista] = useState<'30' | '24'>('30')
  const total24 = pulso.reduce((s, b) => s + b.trabajo, 0)
  return (
    <Tarjeta titulo={vista === '30' ? 'Conexiones de los últimos 30 días' : 'Pulso de las últimas 24 h'}
      cuenta={vista === '30' ? (historial.datos ? `${historial.datos.totales.conexiones} conexiones` : undefined) : `${total24} acciones`}>
      <Segmentos etiqueta="Ver" valor={vista} alCambiar={setVista} opciones={[{ valor: '30', etiqueta: '30 días' }, { valor: '24', etiqueta: '24 h (acciones)' }]} />
      {vista === '30' ? <ConexionesDias historial={historial} /> : <PulsoHoras pulso={pulso} />}
    </Tarjeta>
  )
}

/** Cuánto tiempo han visto el sistema los clientes, acumulado, y las horas de cada uno de los últimos 30 días. */
function TiempoClientes({ historial }: { historial: ReturnType<typeof useHistorial> }) {
  const [periodo, setPeriodo] = useState<PeriodoAcumulado>('30')
  const dias = useMemo(() => historial.datos?.por_dia ?? [], [historial.datos])
  const barras = useMemo(() => barrasDeSerie(dias.map((d) => d.clientes_segundos), 300, 60), [dias])
  const a = historial.datos?.acumulado_clientes?.[periodo]
  const uso = a && a.segundos_conectado > 0 ? Math.round((a.segundos_activo / a.segundos_conectado) * 100) : 0
  return (
    <Tarjeta titulo="Tiempo de los clientes en el sistema" cuenta="acumulado" acento="#4fd1c5">
      <Segmentos etiqueta="Período" valor={periodo} alCambiar={setPeriodo} opciones={PERIODOS_ACUMULADO.map((p) => ({ valor: p.clave, etiqueta: p.etiqueta }))} />
      {historial.error && !historial.datos ? <p className={styles.vacio}>{historial.error}</p>
        : !historial.datos ? <span className={styles.esqueleto} style={{ height: 150 }} />
        : !historial.datos.disponible || !a ? <p className={styles.vacio}>Falta correr la migración 0070 en el servidor para medir las conexiones de los clientes.</p> : (
        <>
          <div className={styles.tiempoGrande}>
            <div><strong>{duracionAcumulada(a.segundos_conectado)}</strong><span>conectados en total</span></div>
            <div><strong className={styles.tiempoUso}>{duracionAcumulada(a.segundos_activo)}</strong><span>usándolo de verdad{a.segundos_conectado ? ` (${uso} %)` : ''}</span></div>
          </div>
          <div className={styles.estadisticas}>
            <div className={styles.dato}><small>Visitas</small><b>{a.visitas}</b></div>
            <div className={styles.dato}><small>Cuentas</small><b>{a.cuentas}</b></div>
            <div className={styles.dato}><small>Por visita</small><b>{duracionAcumulada(a.promedio_visita)}</b></div>
            <div className={styles.dato}><small>Por cuenta</small><b>{duracionAcumulada(a.promedio_cuenta)}</b></div>
          </div>
          <p className={styles.nota}>Horas de los clientes, día a día{periodo === 'todo' && a.primera ? ` · se mide desde el ${fechaCorta(a.primera.slice(0, 10))}` : ''}</p>
          <div className={styles.barrasMini} role="img" aria-label="Horas que los clientes estuvieron conectados cada día">
            <svg viewBox="0 0 300 60" preserveAspectRatio="none">
              {barras.map((b, i) => (
                <rect key={dias[i].dia} className={styles.bdiaTurquesa} x={b.x} y={b.y} width={b.ancho} height={b.alto} rx={2}>
                  <title>{`${fechaCorta(dias[i].dia)}: ${duracionAcumulada(dias[i].clientes_segundos)} · ${dias[i].clientes_conexiones} visitas`}</title>
                </rect>
              ))}
            </svg>
          </div>
          <div className={styles.pulsoEjes}>
            {indicesDeEje(dias.length, 3).map((k) => <span key={dias[k].dia}>{k === dias.length - 1 ? 'hoy' : fechaCorta(dias[k].dia)}</span>)}
          </div>
        </>
      )}
    </Tarjeta>
  )
}

function Avatar({ nombre, email, c }: { nombre: string; email: string; c: Pick<Conectado, 'estado' | 'actividad'> }) {
  const clase = c.estado !== 'en_linea' ? '' : c.actividad === 'pausa' ? styles.avatarPausa : c.actividad === 'segundo_plano' ? styles.avatarSegundo : styles.avatarVivo
  return (
    <span className={`${styles.avatar} ${clase}`} style={{ '--tono': tonoDe(email) } as CSSProperties}>
      {iniciales(nombre)}
    </span>
  )
}

/** La línea de estado de una persona: «Activo», «En pausa · sin tocar nada hace 5 min» o «Estuvo hace 12 min». */
function estadoTexto(c: Conectado, ahoraMs: number): { texto: string; clase: string } {
  if (c.estado !== 'en_linea') return { texto: `Estuvo ${hace(c.ultimo, ahoraMs)}`, clase: styles.eGris }
  if (c.actividad === 'pausa') return { texto: `En pausa · sin tocar nada ${textoInactividad(c.inactivo_segundos)}`, clase: styles.eAmbar }
  if (c.actividad === 'segundo_plano') return { texto: ETIQUETA_ACTIVIDAD.segundo_plano, clase: styles.eAzul }
  return { texto: ETIQUETA_ACTIVIDAD.activa, clase: styles.eVerde }
}

function Conectados({ datos, ahoraMs, nuevos, onAbrir }: { datos: ResumenMonitoreo; ahoraMs: number; nuevos: Set<string>; onAbrir: (c: Conectado) => void }) {
  const lista = datos.conectados
  return (
    <Tarjeta titulo="Gente conectada" cuenta={`${datos.activos} activos · ${datos.en_pausa} en pausa`} acento="#8be04a">
      {lista.length === 0 ? (
        <p className={styles.vacio}>Nadie conectado en este momento.</p>
      ) : (
        <ul className={styles.lista}>
          {lista.map((c, i) => (
            <li key={c.email} style={estiloI(i)}>
              <button type="button" className={`${styles.fila} ${nuevos.has(c.email) ? styles.nuevo : ''}`} onClick={() => onAbrir(c)}>
                <Avatar nombre={c.nombre} email={c.email} c={c} />
                <span className={styles.filaCuerpo}>
                  <b>{c.nombre}{c.yo && <em> · tú</em>}</b>
                  <small className={`${styles.estado} ${estadoTexto(c, ahoraMs).clase}`}><i />{estadoTexto(c, ahoraMs).texto}</small>
                  <small className={styles.pantalla}>
                    {c.estado === 'en_linea' ? 'Está en' : 'Estaba en'} <b>{c.pantalla}</b>
                    {c.en_inicio && <span className={styles.etiquetaInicio}>inicio</span>}
                  </small>
                  {c.estado === 'en_linea' && c.en_pantalla_desde && <small>en esta pantalla {hace(c.en_pantalla_desde, ahoraMs)}</small>}
                  {c.dispositivo && <small>{c.dispositivo}</small>}
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

function DondeEsta({ modulos }: { modulos: ModuloConGente[] }) {
  const max = Math.max(1, ...modulos.map((m) => m.personas))
  return (
    <Tarjeta titulo="Dónde está la gente" cuenta="ahora" acento="#8be04a">
      {modulos.length === 0 ? <p className={styles.vacio}>Nadie conectado en este momento.</p> : (
        <ul className={styles.lista}>
          {modulos.map((m, k) => (
            <li key={m.modulo} style={estiloI(k)} className={styles.moduloFila}>
              <span className={styles.moduloCab}><b>{m.modulo}</b><small>{m.personas} {m.personas === 1 ? 'persona' : 'personas'}</small></span>
              <span className={styles.barra2}><i style={{ width: `${(m.personas / max) * 100}%` }} /></span>
              <small className={styles.moduloNombres}>{m.nombres.join(' · ')}</small>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  )
}

function EnVivo({ eventos, ahoraMs, onAbrir }: { eventos: EventoReciente[]; ahoraMs: number; onAbrir: (e: EventoReciente) => void }) {
  return (
    <Tarjeta titulo="En vivo" cuenta="lo último que se hizo" acento="#b48cf0">
      {eventos.length === 0 ? <p className={styles.vacio}>Todavía no hay actividad.</p> : (
        <ul className={styles.lista}>
          {eventos.map((e, k) => (
            <li key={`${e.t}-${e.email}-${k}`} style={estiloI(k)}>
              <button type="button" className={`${styles.fila} ${styles.filaVivo}`} onClick={() => onAbrir(e)}>
                <i className={styles.puntoCat} style={{ background: COLOR_CATEGORIA[e.categoria] ?? '#9aa59e' }} />
                <span className={styles.filaCuerpo}>
                  <b>{e.nombre}</b>
                  <small className={styles.textoLibre}>{e.texto}</small>
                </span>
                <span className={styles.filaLado}><small>{hace(e.t, ahoraMs)}</small></span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  )
}

const ORDENES_CLIENTES: { valor: OrdenClientes; etiqueta: string }[] = [
  { valor: 'tiempo', etiqueta: 'Más tiempo' },
  { valor: 'reciente', etiqueta: 'Más recientes' },
]

const TOPE_CLIENTES = 10

function ClientesConectados({ ahoraMs, onAbrir }: { ahoraMs: number; onAbrir: (c: { email: string; nombre: string }) => void }) {
  const [dias, setDias] = useState<number>(7)
  const [orden, setOrden] = useState<OrdenClientes>('tiempo')
  const [todos, setTodos] = useState(false)
  const { datos, error } = useClientes(dias, orden)
  const cuentas = datos?.cuentas ?? []
  const visibles = todos ? cuentas : cuentas.slice(0, TOPE_CLIENTES)
  const maximo = Math.max(1, ...cuentas.map((c) => c.segundos_conectado))
  return (
    <Tarjeta titulo="Clientes que más tiempo estuvieron" cuenta={datos?.disponible ? `${cuentas.length} ${cuentas.length === 1 ? 'cuenta' : 'cuentas'}` : undefined} acento="#4fd1c5">
      <Segmentos etiqueta="Período" valor={dias} alCambiar={(v) => { setDias(v); setTodos(false) }} opciones={comoOpciones(PERIODOS_CLIENTES)} />
      <Segmentos etiqueta="Ordenar" valor={orden} alCambiar={setOrden} opciones={ORDENES_CLIENTES} />
      {error && !datos ? <p className={styles.vacio}>{error}</p>
        : !datos ? <p className={styles.vacio}>Cargando…</p>
        : !datos.disponible ? <p className={styles.vacio}>Falta correr la migración 0070 en el servidor para guardar las conexiones.</p>
        : cuentas.length === 0 ? <p className={styles.vacio}>Ningún cliente se conectó en este período.</p> : (
        <>
          <p className={styles.resumenClientes}>
            <b>{duracionAcumulada(datos.segundos_total ?? 0)}</b> conectados · <b>{duracionAcumulada(datos.segundos_activo_total ?? 0)}</b> usándolo · {datos.visitas_total ?? 0} visitas
            {datos.en_linea ? <> · <span className={styles.eVerdeTxt}>{datos.en_linea} en línea ahora</span></> : null}
          </p>
          <ul className={styles.lista}>
            {visibles.map((c, i) => (
              <li key={c.email} style={estiloI(i)}>
                <button type="button" className={styles.fila} onClick={() => onAbrir(c)}>
                  {orden === 'tiempo' && <span className={`${styles.puesto} ${i < 3 ? styles[`puesto${i + 1}`] : ''}`} aria-label={`Puesto ${i + 1}`}>{i + 1}</span>}
                  <Avatar nombre={c.nombre} email={c.email} c={{ estado: c.en_linea ? 'en_linea' : 'reciente', actividad: c.en_linea ? 'activa' : null }} />
                  <span className={styles.filaCuerpo}>
                    <b>{c.nombre}{c.tipo === 'comercial' && <em> · comercial</em>}</b>
                    <small>{[c.cliente, c.planta].filter(Boolean).join(' · ') || (c.tipo === 'comercial' ? 'Cuenta comercial' : '—')}</small>
                    <small className={`${styles.estado} ${c.en_linea ? styles.eVerde : styles.eGris}`}>
                      <i />{c.en_linea ? 'En línea ahora' : `Última vez ${hace(c.ultima, ahoraMs)}`}
                    </small>
                    <small>{c.sesiones} {c.sesiones === 1 ? 'visita' : 'visitas'} · usó el sistema {c.segundos_activo < 60 ? '<1 min' : duracionSeg(c.segundos_activo)}</small>
                    {orden === 'tiempo' && <span className={styles.barraTiempo}><i style={{ width: `${porcentajeDe(c.segundos_conectado, maximo)}%` }} /></span>}
                    {c.dispositivo && <small>{c.dispositivo}</small>}
                  </span>
                  <span className={styles.filaLado}>
                    <b className={styles.tiempo}>{c.segundos_conectado < 60 ? '<1 min' : duracionAcumulada(c.segundos_conectado)}</b>
                    <small>conectado</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {cuentas.length > TOPE_CLIENTES && (
            <button type="button" className={styles.verMas} onClick={() => setTodos((v) => !v)}>
              {todos ? 'Ver solo los primeros' : `Ver las ${cuentas.length} cuentas`}
            </button>
          )}
        </>
      )}
    </Tarjeta>
  )
}

/** Lo que más se hizo: las acciones que más se repitieron, quién hizo más y qué pantallas se abrieron más. */
function TopAcciones({ ahoraMs, onAbrir }: { ahoraMs: number; onAbrir: (c: { email: string; nombre: string }) => void }) {
  const [dias, setDias] = useState<number>(7)
  const [quien, setQuien] = useState<QuienTop>('todos')
  const [vista, setVista] = useState<'acciones' | 'personas' | 'pantallas'>('acciones')
  const { datos, error } = useTop(dias, quien)
  const lista = datos ? (vista === 'acciones' ? datos.acciones : vista === 'personas' ? datos.personas : datos.pantallas) : []
  const maximo = Math.max(1, ...lista.map((f) => f.total))
  return (
    <Tarjeta titulo="Lo que más se hizo" cuenta={datos ? `${datos.total_acciones} acciones · ${datos.personas_activas} ${datos.personas_activas === 1 ? 'persona' : 'personas'}` : undefined} acento="#b48cf0">
      <Segmentos etiqueta="Período" valor={dias} alCambiar={setDias} opciones={comoOpciones(PERIODOS_TOP)} />
      <Segmentos etiqueta="Quién" valor={quien} alCambiar={setQuien} opciones={OPCIONES_QUIEN} />
      <Segmentos etiqueta="Ver" valor={vista} alCambiar={setVista}
        opciones={[{ valor: 'acciones', etiqueta: 'Acciones' }, { valor: 'personas', etiqueta: 'Personas' }, { valor: 'pantallas', etiqueta: 'Pantallas' }]} />
      {error && !datos ? <p className={styles.vacio}>{error}</p>
        : !datos ? <p className={styles.vacio}>Cargando…</p>
        : lista.length === 0 ? (
          <p className={styles.vacio}>
            {vista === 'pantallas' && quien === 'clientes'
              ? 'Las pantallas que abren los clientes no se anotan: mira cuánto tiempo estuvieron conectados.'
              : 'Todavía no hay nada que mostrar en este período.'}
          </p>
        ) : (
        <ul className={styles.lista}>
          {vista === 'acciones' && datos.acciones.map((f, k) => (
            <li key={f.etiqueta} style={estiloI(k)} className={styles.moduloFila}>
              <span className={styles.moduloCab}><b>{f.etiqueta}</b><small>{f.total} {f.total === 1 ? 'vez' : 'veces'}</small></span>
              <span className={`${styles.barra2} ${styles.barraVioleta}`}><i style={{ width: `${porcentajeDe(f.total, maximo)}%` }} /></span>
              <small className={styles.moduloNombres}>{f.personas} {f.personas === 1 ? 'persona' : 'personas'}{f.modulo ? ` · ${f.modulo}` : ''} · última {hace(f.ultima, ahoraMs)}</small>
            </li>
          ))}
          {vista === 'personas' && datos.personas.map((f, k) => (
            <li key={f.email} style={estiloI(k)}>
              <button type="button" className={styles.fila} onClick={() => onAbrir(f)}>
                <span className={`${styles.puesto} ${k < 3 ? styles[`puesto${k + 1}`] : ''}`}>{k + 1}</span>
                <span className={styles.filaCuerpo}>
                  <b>{f.nombre}{f.tipo && <em> · {ETIQUETA_TIPO[f.tipo] ?? f.tipo}</em>}</b>
                  <small>Lo que más hace: {f.principal.toLowerCase()}</small>
                  <span className={`${styles.barra2} ${styles.barraVioleta}`}><i style={{ width: `${porcentajeDe(f.total, maximo)}%` }} /></span>
                </span>
                <span className={styles.filaLado}><b className={styles.tiempo}>{f.total}</b><small>acciones</small></span>
              </button>
            </li>
          ))}
          {vista === 'pantallas' && datos.pantallas.map((f, k) => (
            <li key={f.modulo} style={estiloI(k)} className={styles.moduloFila}>
              <span className={styles.moduloCab}><b>{f.modulo}</b><small>{f.total} {f.total === 1 ? 'visita' : 'visitas'}</small></span>
              <span className={`${styles.barra2} ${styles.barraVioleta}`}><i style={{ width: `${porcentajeDe(f.total, maximo)}%` }} /></span>
              <small className={styles.moduloNombres}>{f.personas} {f.personas === 1 ? 'persona' : 'personas'}</small>
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
  const app = useInstalarApp()
  const historial = useHistorial(30)

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
        {app.puede && <button type="button" className={styles.instalar} onClick={() => void app.instalar()}>Instalar app</button>}
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
              <Kpi etiqueta="En línea ahora" valor={datos.en_linea} pie={`${datos.activos} activos · ${datos.en_pausa} en pausa`} />
              <Kpi etiqueta="Acciones última hora" valor={datos.kpis.acciones_ultima_hora}
                pie={tendencia(datos.kpis.acciones_ultima_hora, datos.kpis.acciones_hora_anterior).texto} tono="violeta" />
              <Kpi etiqueta="Informes hoy" valor={datos.kpis.informes_hoy} pie="llegaron al correo" tono="azul" />
              <Kpi etiqueta="Solicitudes hoy" valor={datos.kpis.solicitudes_creadas_hoy} pie={`${datos.kpis.solicitudes_enviadas_hoy} enviadas`} tono="ambar" />
              <Kpi etiqueta="Clientes en línea" valor={datos.clientes_en_linea} pie={`${datos.kpis.personas_hoy} personas con trabajo hoy`} tono="turquesa" />
              <Kpi etiqueta="Atención" valor={alertas} pie={alertas ? 'por revisar' : 'todo en orden'} tono={alertas ? 'rojo' : 'verde'} />
            </div>

            <div className={styles.fila2}>
              <Conexiones pulso={datos.pulso} historial={historial} />
              <TiempoClientes historial={historial} />
            </div>
            <div className={styles.columnas}>
              <div className={styles.columna}>
                <Alertas datos={datos} ahoraMs={ahoraMs} />
                <Conectados datos={datos} ahoraMs={ahoraMs} nuevos={nuevos.conectados} onAbrir={(c) => setAbierto({ email: c.email, nombre: c.nombre })} />
              </div>
              <div className={styles.columna}>
                <ClientesConectados ahoraMs={ahoraMs} onAbrir={setAbierto} />
                <DondeEsta modulos={datos.por_modulo} />
                <Informes informes={datos.informes} ahoraMs={ahoraMs} nuevos={nuevos.informes} />
              </div>
              <div className={styles.columna}>
                <TopAcciones ahoraMs={ahoraMs} onAbrir={setAbierto} />
                <EnVivo eventos={datos.actividad_reciente} ahoraMs={ahoraMs} onAbrir={(e) => setAbierto({ email: e.email, nombre: e.nombre })} />
                <Solicitudes solicitudes={datos.solicitudes} ahoraMs={ahoraMs} nuevos={nuevos.solicitudes} />
              </div>
            </div>
            <p className={styles.pie}>Se actualiza sola cada {SEGUNDOS_REFRESCO} s · hora de Chile</p>
          </>
        )}
      </main>

      {abierto && <DetalleSheet key={abierto.email} email={abierto.email} nombre={abierto.nombre} onCerrar={() => setAbierto(null)} />}
    </div>
  )
}
