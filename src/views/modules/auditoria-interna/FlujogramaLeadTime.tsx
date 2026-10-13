import { useMemo, useState } from 'react'
import { RECEPCION_ESTIMADA_DIAS, alcanzados, claveLaboratorio, nodoActual, resumenFlujo } from '@/features/auditoriaInterna'
import type { EvaluadaEntrega, NodoFlujo } from '@/features/auditoriaInterna'
import { formatDateCL } from '@/lib/locale'
import styles from './FlujogramaLeadTime.module.css'

const nf = new Intl.NumberFormat('es-CL')
const f1 = (v: number) => v.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 1 })
const fecha = (v: string | number | null | undefined) => (v == null || v === '' ? '—' : formatDateCL(typeof v === 'number' ? new Date(v) : v))

interface Punto {
  titulo: string
  detalle: string
  /** el punto es un estimado, no un hecho registrado */
  estimado?: boolean
}

const PUNTOS: Record<NodoFlujo, Punto> = {
  emitida: { titulo: 'Solicitud emitida', detalle: 'Sale desde Toma de muestras' },
  recepcion: {
    titulo: 'Recepcionada por el laboratorio',
    detalle: `${RECEPCION_ESTIMADA_DIAS} día después de emitida (no sabemos cuándo retiran las muestras)`,
    estimado: true,
  },
  analisis: { titulo: 'En análisis', detalle: 'Corre el plazo prometido, en días hábiles' },
  informe: { titulo: 'Informe recibido del laboratorio', detalle: 'PDF guardado en Auditoría interna' },
  cliente: { titulo: 'Informe enviado al cliente', detalle: 'Solo lo marcado como enviado (Converter o Solicitudes e informes)' },
  sistema: { titulo: 'Informe cargado al sistema', detalle: 'Resultados ya visibles en Report' },
  observado: { titulo: 'Reporte observado', detalle: 'Los resultados ya están en Report para el cliente' },
}


/** Filtros del listado «Estado de cada solicitud». */
type FiltroEstado = 'sin_informe' | 'vencidas' | 'sin_cliente' | 'sin_report' | 'completas' | 'todas'
const FILTROS_ESTADO: { clave: FiltroEstado; texto: string; cumple: (e: EvaluadaEntrega) => boolean }[] = [
  { clave: 'todas', texto: 'Todas', cumple: () => true },
  { clave: 'sin_informe', texto: 'Sin informe', cumple: (e) => !alcanzados(e).informe && !alcanzados(e).sistema },
  { clave: 'vencidas', texto: 'Pasaron su plazo', cumple: (e) => e.veredicto === 'vencida' },
  { clave: 'sin_cliente', texto: 'Sin enviar al cliente', cumple: (e) => alcanzados(e).informe && !alcanzados(e).cliente },
  { clave: 'sin_report', texto: 'Sin Report', cumple: (e) => alcanzados(e).informe && !alcanzados(e).sistema },
  { clave: 'completas', texto: 'Completas', cumple: (e) => alcanzados(e).sistema && alcanzados(e).cliente },
]

const etiquetaSolicitud = (e: EvaluadaEntrega) => e.sol.numero_solicitud ?? e.sol.archivo

/** Cómo sabemos que el informe salió al cliente. */
function origenCliente(o: string | null | undefined) {
  if (!o) return null
  return o === 'envio' ? 'Enviado desde «Envío de informes»' : `Marcado a mano por ${o.replace(/^manual:\s*/, '')}`
}

/** Lo que dice una solicitud de su avance dentro del plazo. */
function textoPlazo(e: EvaluadaEntrega) {
  if (e.plazo == null) return 'sin plazo cargado'
  const t = e.entregada && e.dias != null ? e.dias : e.edad
  return `${f1(t)} de ${e.plazo} d hábiles${e.analisis ? ` · ${e.analisis}` : ''}`
}

interface Props {
  ev: EvaluadaEntrega[]
  /** laboratorios para el filtro (en mayúsculas) */
  laboratorios: string[]
  lab: string
  onLab: (lab: string) => void
}

/**
 * El lead time como flujograma: de arriba hacia abajo, cada punto se enciende cuando los
 * hitos registrados llegan a esa etapa. A la izquierda el flujo; a la derecha, la lista de
 * solicitudes del punto que se toque. Con todas las solicitudes muestra cuántas pasaron por
 * cada punto y cuántas están ahí hoy; al elegir una sola, su propio recorrido con fechas.
 * Informe enviado al cliente e informe cargado al sistema van al mismo nivel. «Reporte
 * observado» se enciende cuando el informe ya está en Report (y anota qué clientes lo abrieron).
 */
export function FlujogramaLeadTime({ ev, laboratorios, lab, onLab }: Props) {
  const [elegida, setElegida] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('todas')
  const [busca, setBusca] = useState('')

  const delLab = useMemo(
    () => (lab ? ev.filter((e) => claveLaboratorio(e.sol.laboratorio) === lab) : ev),
    [ev, lab],
  )
  const validas = useMemo(() => delLab.filter((e) => e.veredicto !== 'excluida'), [delLab])
  const resumen = useMemo(() => resumenFlujo(delLab), [delLab])
  const una = elegida ? validas.find((e) => e.sol.archivo === elegida) ?? null : null

  // El rango de plazos prometidos de las solicitudes que están en análisis hoy.
  const plazosEnAnalisis = validas.filter((e) => nodoActual(e) === 'analisis' && e.plazo != null).map((e) => e.plazo as number)
  const rangoPlazo = plazosEnAnalisis.length
    ? Math.min(...plazosEnAnalisis) === Math.max(...plazosEnAnalisis)
      ? `${Math.min(...plazosEnAnalisis)} días hábiles`
      : `${Math.min(...plazosEnAnalisis)} a ${Math.max(...plazosEnAnalisis)} días hábiles`
    : null
  const pasadasDePlazo = validas.filter((e) => e.veredicto === 'vencida').length

  function estadoNodo(n: NodoFlujo) {
    if (una) {
      const a = alcanzados(una)
      const h = una.hitos
      const fechas: Record<NodoFlujo, string | null> = {
        emitida: fecha(una.sol.emitida_en),
        recepcion: fecha(una.recepcion),
        analisis: null,
        informe: fecha(h?.informe),
        cliente: fecha(h?.cliente),
        sistema: fecha(h?.report),
        observado: fecha(h?.observado ?? h?.report),
      }
      return {
        cifra: null as string | null,
        extra: n === 'analisis' ? textoPlazo(una) : n === 'cliente' && h?.cliente ? origenCliente(h.cliente_origen) : n === 'observado' && h?.observado_por?.length ? h.observado_por.join(' · ') : null,
        fechaNodo: a[n] ? fechas[n] : null,
        on: a[n],
        aqui: nodoActual(una) === n,
        ahora: null as string | null,
      }
    }
    const r = resumen[n]
    return {
      cifra: `${nf.format(r.alcanzaron)} ${r.alcanzaron === 1 ? 'solicitud llegó' : 'solicitudes llegaron'}`,
      extra: n === 'analisis' && rangoPlazo ? `plazo prometido: ${rangoPlazo}` : null,
      fechaNodo: null,
      on: r.alcanzaron > 0,
      aqui: r.ahoraAqui > 0,
      ahora: r.ahoraAqui > 0 ? `${nf.format(r.ahoraAqui)} ${r.ahoraAqui === 1 ? 'solicitud está aquí hoy' : 'solicitudes están aquí hoy'}` : null,
    }
  }

  const nodo = (n: NodoFlujo) => {
    const p = PUNTOS[n]
    const t = estadoNodo(n)
    const clave = `${styles.nodo} ${t.on ? styles.on : ''} ${t.aqui ? styles.aqui : ''}`
    const contenido = (
      <>
        {t.aqui && <span className={styles.latido} role="img" aria-label={t.ahora ?? 'Aquí está hoy'} title={t.ahora ?? 'Aquí está hoy'} />}
        <span className={styles.marca} aria-hidden="true">{t.on ? '✓' : ''}</span>
        <span className={styles.cuerpo}>
          <span className={styles.titulo}>
            {p.titulo}
            {p.estimado && <em className={styles.estimado}>estimado</em>}
          </span>
          <small>{p.detalle}</small>
          {t.fechaNodo && <span className={styles.fecha}>{t.fechaNodo}{p.estimado ? ' (estimada)' : ''}</span>}
          {t.cifra && <span className={styles.cifra}>{t.cifra}</span>}
          {t.extra && <span className={styles.extra}>{t.extra}</span>}
        </span>
      </>
    )
    return <div key={n} className={clave}>{contenido}</div>
  }

  const conteoEstado = useMemo(
    () => Object.fromEntries(FILTROS_ESTADO.map((f) => [f.clave, validas.filter(f.cumple).length])) as Record<FiltroEstado, number>,
    [validas],
  )
  const filasEstado = useMemo(() => {
    const cumple = FILTROS_ESTADO.find((f) => f.clave === filtroEstado)!.cumple
    const q = busca.trim().toLowerCase()
    return validas
      .filter(cumple)
      .filter((e) => !q || [etiquetaSolicitud(e), e.sol.laboratorio, e.sol.sold_to, e.sol.ship_to].join(' ').toLowerCase().includes(q))
      .sort((a, b) => b.edad - a.edad)
  }, [validas, filtroEstado, busca])

  return (
    <div className={styles.flujo}>
      <div className={styles.cabecera}>
        <span className={styles.sobre}>Flujo del lead time</span>
        <div className={styles.filtros}>
          <label className={styles.selector}>
            <span>Laboratorio</span>
            <select value={lab} onChange={(e) => { onLab(e.target.value); setElegida('') }} aria-label="Laboratorio del flujo">
              <option value="">Todos</option>
              {laboratorios.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          <label className={styles.selector}>
            <span>Ver</span>
            <select value={elegida} onChange={(e) => setElegida(e.target.value)} aria-label="Ver una solicitud">
              <option value="">Todas las solicitudes</option>
              {[...validas]
                .sort((a, b) => etiquetaSolicitud(a).localeCompare(etiquetaSolicitud(b), 'es', { numeric: true }))
                .map((e) => <option key={e.sol.archivo} value={e.sol.archivo}>{etiquetaSolicitud(e)} · {e.sol.laboratorio ?? '—'}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className={styles.disposicion}>
        <div className={styles.flujoCol}>
      <header className={styles.ficha}>
        {una ? (
          <>
            <span className={styles.fichaTitulo}>
              {etiquetaSolicitud(una)}
              <small>{una.sol.laboratorio ?? '—'}</small>
              <button type="button" className={styles.mas} onClick={() => setElegida('')}>← todas</button>
            </span>
            <span className={styles.fichaLinea}>
              <span>Sold To <b>{una.sol.sold_to ?? '—'}</b></span>
              <span>Ship To <b>{una.sol.ship_to ?? '—'}</b></span>
            </span>
            <span className={styles.fichaLinea}>
              <span>Solicitud <b>{fecha(una.sol.fecha_solicitud ?? una.sol.emitida_en)}</b></span>
              <span>Informe {una.hitos?.informe ? <b>{fecha(una.hitos.informe)}</b> : <em className={styles.pendiente}>Pendiente</em>}</span>
              <span>{una.plazo != null ? `Plazo ${una.plazo} d háb.` : 'Sin plazo'} · {una.entregada && una.dias != null ? `entregada en ${f1(una.dias)} d` : `lleva ${f1(una.edad)} d`}</span>
            </span>
          </>
        ) : (
          <>
            <span className={styles.fichaTitulo}>
              {lab || 'Todos los laboratorios'}
              <small>{nf.format(validas.length)} solicitudes · elige una OT de la tabla para ver su recorrido</small>
            </span>
          </>
        )}
      </header>

      <div className={styles.columna}>
        {nodo('emitida')}
        <i className={styles.hilo} aria-hidden="true" />
        {nodo('recepcion')}
        <i className={styles.hilo} aria-hidden="true" />
        {nodo('analisis')}
        {!una && pasadasDePlazo > 0 && (
          <p className={styles.alerta}>{nf.format(pasadasDePlazo)} {pasadasDePlazo === 1 ? 'solicitud ya pasó' : 'solicitudes ya pasaron'} su plazo sin informe</p>
        )}
        <i className={styles.hilo} aria-hidden="true" />
        {nodo('informe')}
        <i className={styles.hilo} aria-hidden="true" />
        <div className={styles.mismoNivel}>
          {nodo('cliente')}
          {nodo('sistema')}
        </div>
        <i className={styles.hilo} aria-hidden="true" />
        {nodo('observado')}
      </div>
        </div>
      <section className={styles.panelTabla} aria-label="Estado de cada solicitud">
        <div className={styles.panelCab}>
          <h4>Solicitudes</h4>
          <input
            type="search"
            className={styles.buscaEstado}
            placeholder="Buscar OT, cliente o planta…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Buscar solicitud"
          />
          <div className={styles.chips}>
            {FILTROS_ESTADO.map((f) => (
              <button key={f.clave} type="button" className={styles.chipFiltro} aria-pressed={filtroEstado === f.clave} onClick={() => setFiltroEstado(f.clave)}>
                {f.texto} <b>{nf.format(conteoEstado[f.clave])}</b>
              </button>
            ))}
          </div>
        </div>
        <div className={styles.tablaScroll}>
          <table className={styles.tabla}>
            <thead>
              <tr>
                <th>OT</th>
                <th title="Informe recibido del laboratorio">Inf.</th>
                <th title="Informe enviado al cliente">Cli.</th>
                <th title="Resultados cargados en Report">Rep.</th>
                <th>Plazo (d háb.)</th>
              </tr>
            </thead>
            <tbody>
              {filasEstado.length === 0 && (
                <tr><td colSpan={5} className={styles.vacio}>Ninguna solicitud con este estado.</td></tr>
              )}
              {filasEstado.map((e) => {
                const a = alcanzados(e)
                const punto = (v: boolean) => <span className={`${styles.punto} ${v ? styles.puntoSi : styles.puntoNo}`} role="img" aria-label={v ? 'sí' : 'no'} />
                const alternar = () => { setElegida(elegida === e.sol.archivo ? '' : e.sol.archivo) }
                return (
                  <tr
                    key={e.sol.archivo}
                    className={`${styles.fila} ${elegida === e.sol.archivo ? styles.filaElegida : ''}`}
                    onClick={alternar}
                    aria-selected={elegida === e.sol.archivo}
                    title={`${e.sol.laboratorio ?? ''} · ${e.sol.sold_to ?? ''} · ${e.sol.ship_to ?? ''}`}
                  >
                    <td><button type="button" className={styles.celdaBoton} onClick={(ev) => { ev.stopPropagation(); alternar() }}>{etiquetaSolicitud(e)}</button></td>
                    <td>{punto(a.informe)}</td>
                    <td>{punto(a.cliente)}</td>
                    <td>{punto(a.sistema)}</td>
                    <td>
                      {e.plazo == null ? '—' : (() => {
                        const usado = e.entregada && e.dias != null ? e.dias : e.edad
                        const atrasada = e.veredicto === 'vencida' || e.veredicto === 'tarde'
                        return (
                          <span className={styles.plazoCelda} title={`${f1(usado)} de ${e.plazo} días hábiles`}>
                            <span className={styles.plazoPista}>
                              <i
                                className={atrasada ? styles.plazoMalo : e.veredicto === 'cumplio' ? styles.plazoBueno : styles.plazoCorre}
                                style={{ width: `${Math.min(100, (usado / e.plazo) * 100)}%` }}
                              />
                            </span>
                            <span className={atrasada ? styles.tarde : undefined}>{f1(usado)}/{e.plazo}</span>
                          </span>
                        )
                      })()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
      </div>

    </div>
  )
}
