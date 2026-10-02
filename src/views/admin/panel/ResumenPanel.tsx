import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '@/constants/routes'
import {
  COLOR_CATEGORIA,
  iniciales,
  leerResumen,
  nivelSalud,
  tendencia,
} from '@/features/adminPanel'
import type { ItemAtencion, ResumenPanel as Resumen } from '@/features/adminPanel'
import { fechaHora } from '@/lib/fechaHoraChile'
import { BarrasDiarias, Dona } from './Graficos'
import styles from './PanelAdmin.module.css'

const nf = new Intl.NumberFormat('es-CL')
const PERIODOS = [7, 30, 90]

type Destino = { pestana: 'actividad' | 'listas' } | { ruta: string }

const DESTINO_ATENCION: Record<string, Destino> = {
  verificaciones: { ruta: ROUTES.agrofreshLabVerificacionesHistorico },
  pendientes: { ruta: ROUTES.ingesta },
  sin_tecnico: { pestana: 'listas' },
  sin_comercial: { pestana: 'listas' },
  sin_cliente: { pestana: 'listas' },
  pdf: { ruta: ROUTES.auditoriaInternaSolicitudes },
  dormidas: { pestana: 'actividad' },
  fallos_login: { pestana: 'actividad' },
}

const COLOR_MODULO: Record<string, string> = {
  'Toma de muestras': COLOR_CATEGORIA.solicitudes,
  'Ingesta / Converter': COLOR_CATEGORIA.cargas,
  Verificaciones: COLOR_CATEGORIA.verificaciones,
  'AgroFresh Lab': COLOR_CATEGORIA.laboratorio,
  'Auditoría / Informes': COLOR_CATEGORIA.informes,
}

interface Props {
  onIrAPestana: (p: 'actividad' | 'listas') => void
  onVerPersona: (email: string) => void
}

export function ResumenPanel({ onIrAPestana, onVerPersona }: Props) {
  const navigate = useNavigate()
  const [dias, setDias] = useState(30)
  const [datos, setDatos] = useState<Resumen | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    leerResumen(dias)
      .then((r) => {
        if (cancelado) return
        setDatos(r)
        setError(null)
      })
      .catch((e: unknown) => {
        if (!cancelado) setError(e instanceof Error ? e.message : 'No se pudo cargar el resumen.')
      })
    return () => {
      cancelado = true
    }
  }, [dias])

  const cargando = !error && (datos === null || datos.dias !== dias)

  function ir(item: ItemAtencion) {
    const d = DESTINO_ATENCION[item.clave]
    if (!d) return
    if ('pestana' in d) onIrAPestana(d.pestana)
    else navigate(d.ruta)
  }

  return (
    <section className={styles.panel} aria-label="Resumen de Administración General" aria-busy={cargando}>
      <div className={styles.barra}>
        <h2>
          Resumen
          <small>Solo lo ves tú · se compara contra los {dias} días anteriores</small>
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
          <Kpis d={datos} />

          <div className={styles.fila2}>
            <div className={styles.card}>
              <h3>Actividad del equipo por día <em>acciones registradas</em></h3>
              <BarrasDiarias serie={datos.serie} />
            </div>
            <div className={styles.card}>
              <h3>Uso por módulo <em>% de acciones</em></h3>
              {datos.por_modulo.length === 0 ? (
                <p className={styles.vacio}>Todavía no hay acciones en este período.</p>
              ) : (
                <Dona
                  centro={nf.format(datos.por_modulo.reduce((s, m) => s + m.total, 0))}
                  partes={datos.por_modulo.map((m) => ({ nombre: m.modulo, valor: m.total, color: COLOR_MODULO[m.modulo] ?? '#e39a5b' }))}
                />
              )}
            </div>
          </div>

          <div className={styles.fila3}>
            <div className={styles.card}>
              <h3>Actividad por persona <em>acciones · ver ficha</em></h3>
              {datos.usuarios.filter((u) => u.acciones > 0 || u.visitas > 0).slice(0, 7).map((u) => {
                const max = Math.max(1, datos.usuarios[0]?.acciones ?? 1)
                return (
                  <button key={u.email} type="button" className={styles.persona} onClick={() => onVerPersona(u.email)}>
                    <span className={styles.avatar}>{iniciales(u.nombre)}</span>
                    <span className={styles.quien}>
                      <span className={styles.nombre}>{u.nombre}</span>
                      <span className={styles.sub}>{u.ultima_actividad ? fechaHora(u.ultima_actividad) : 'sin actividad'}</span>
                    </span>
                    <span className={styles.barraUso}><i style={{ width: `${Math.max(3, (u.acciones / max) * 100)}%` }} /></span>
                    <span className={styles.cuenta}>{nf.format(u.acciones)}</span>
                  </button>
                )
              })}
              {datos.usuarios.every((u) => u.acciones === 0 && u.visitas === 0) && (
                <p className={styles.vacio}>Nadie registró actividad en este período.</p>
              )}
            </div>

            <div className={styles.card}>
              <h3>Cambios sensibles <em>permisos, cuentas, borrados</em></h3>
              {datos.seguridad.sensibles.length === 0 ? (
                <p className={styles.vacio}>Sin cambios sensibles en el período.</p>
              ) : (
                datos.seguridad.sensibles.map((e, i) => (
                  <div key={i} className={styles.evento}>
                    <i style={{ background: COLOR_CATEGORIA.sensible }} />
                    <div>
                      <b>{e.nombre ?? e.email ?? '—'}</b> {e.texto}
                      <small>{fechaHora(e.t)}</small>
                    </div>
                  </div>
                ))
              )}
              {datos.seguridad.fallos_login.length > 0 && (
                <>
                  <h3 style={{ marginTop: 12 }}>Ingresos fallidos</h3>
                  <ul className={styles.desglose}>
                    {datos.seguridad.fallos_login.map((f) => (
                      <li key={f.quien}><span>{f.quien}</span><b>{f.intentos}</b></li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <div className={styles.card}>
              <h3>Requiere tu atención</h3>
              {datos.atencion.map((a) => {
                const cuerpo = (
                  <>
                    <span className={`${styles.semaforo} ${styles[a.severidad]}`} />
                    {a.titulo}
                    <b>{nf.format(a.cantidad)}</b>
                  </>
                )
                const cls = `${styles.alerta} ${a.cantidad === 0 ? styles.cero : ''}`
                return DESTINO_ATENCION[a.clave] && a.cantidad > 0 ? (
                  <button key={a.clave} type="button" className={cls} onClick={() => ir(a)}>{cuerpo}</button>
                ) : (
                  <div key={a.clave} className={cls}>{cuerpo}</div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function Kpis({ d }: { d: Resumen }) {
  const k = d.kpis
  const act = tendencia(k.usuarios_activos.valor, k.usuarios_activos.previo)
  const sol = tendencia(k.solicitudes.valor, k.solicitudes.previo)
  const con = tendencia(k.concretadas.pct, k.concretadas.previo, { unidad: 'pts' })
  const tie = tendencia(k.tiempo_informe.dias, k.tiempo_informe.previo, { unidad: 'días', masEsMejor: false })
  const nivel = nivelSalud(k.salud.puntaje)
  const conDescuento = k.salud.componentes.filter((c) => c.descuento > 0)
  return (
    <div className={styles.kpis}>
      <div className={styles.card}>
        <h3>Usuarios activos <em>de {k.usuarios_activos.total}</em></h3>
        <span className={styles.kpiValor}>{nf.format(k.usuarios_activos.valor)}</span>
        <span className={`${styles.kpiPie} ${styles[act.tono]}`}>{act.texto}</span>
      </div>
      <div className={styles.card}>
        <h3>Solicitudes emitidas</h3>
        <span className={styles.kpiValor}>{nf.format(k.solicitudes.valor)}</span>
        <span className={`${styles.kpiPie} ${styles[sol.tono]}`}>
          {k.solicitudes.variacion_pct == null ? sol.texto : `${k.solicitudes.variacion_pct > 0 ? '▲' : '▼'} ${Math.abs(k.solicitudes.variacion_pct).toLocaleString('es-CL')} %`}
        </span>
      </div>
      <div className={styles.card}>
        <h3>Informes concretados <em>PDF + Report</em></h3>
        <span className={styles.kpiValor}>{k.concretadas.pct == null ? '—' : `${k.concretadas.pct.toLocaleString('es-CL')} %`}</span>
        <span className={`${styles.kpiPie} ${styles[con.tono]}`}>{con.texto}</span>
        <span className={styles.kpiNota}>{nf.format(k.concretadas.pendientes)} pendientes de {nf.format(k.concretadas.de)} solicitudes a laboratorios externos</span>
      </div>
      <div className={styles.card}>
        <h3>Solicitud → informe</h3>
        <span className={styles.kpiValor}>
          {k.tiempo_informe.dias == null ? '—' : k.tiempo_informe.dias.toLocaleString('es-CL')} <small>días</small>
        </span>
        <span className={`${styles.kpiPie} ${styles[tie.tono]}`}>{tie.texto}</span>
        {k.tiempo_informe.por_laboratorio.length > 0 && (
          <ul className={styles.desglose}>
            {k.tiempo_informe.por_laboratorio.map((l) => (
              <li key={l.laboratorio}><span>{l.laboratorio}</span><b>{l.dias == null ? '—' : `${l.dias.toLocaleString('es-CL')} d`}</b></li>
            ))}
          </ul>
        )}
      </div>
      <div className={styles.card}>
        <h3>Salud de los datos</h3>
        <span className={`${styles.kpiValor} ${styles[nivel === 'bueno' ? 'bueno' : nivel === 'regular' ? 'regular' : 'malo']}`}>
          {k.salud.puntaje} <small>/ 100</small>
        </span>
        {conDescuento.length === 0 ? (
          <span className={`${styles.kpiPie} ${styles.bueno}`}>Todo en orden</span>
        ) : (
          <ul className={styles.desglose}>
            {conDescuento.map((c) => (
              <li key={c.clave} title={c.titulo}><span>{c.titulo.split(' (')[0]}: {nf.format(c.cantidad)}</span><b>−{c.descuento}</b></li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

