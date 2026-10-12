import { useMemo, useState } from 'react'
import { RECEPCION_ESTIMADA_DIAS, alcanzados, nodoActual, resumenFlujo } from '@/features/auditoriaInterna'
import type { EvaluadaEntrega, NodoFlujo } from '@/features/auditoriaInterna'
import { formatDateCL } from '@/lib/locale'
import styles from './FlujogramaLeadTime.module.css'

const nf = new Intl.NumberFormat('es-CL')
const f1 = (v: number) => v.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 1 })
const fecha = (v: string | number | null | undefined) => (v == null || v === '' ? '—' : formatDateCL(typeof v === 'number' ? new Date(v) : v))

interface Punto {
  nodo: NodoFlujo
  titulo: string
  detalle: string
  /** el punto es un estimado, no un hecho registrado */
  estimado?: boolean
}

const PUNTOS: Record<NodoFlujo, Punto> = {
  emitida: { nodo: 'emitida', titulo: 'Solicitud emitida', detalle: 'Sale desde Toma de muestras' },
  recepcion: {
    nodo: 'recepcion',
    titulo: 'Recepcionada por el laboratorio',
    detalle: `Estimado: ${RECEPCION_ESTIMADA_DIAS} día después de emitida (no sabemos cuándo retiran las muestras)`,
    estimado: true,
  },
  analisis: { nodo: 'analisis', titulo: 'En análisis', detalle: 'Corre el plazo prometido, en días hábiles' },
  informe: { nodo: 'informe', titulo: 'Informe recibido del laboratorio', detalle: 'PDF guardado en Auditoría interna' },
  cliente: { nodo: 'cliente', titulo: 'Informe enviado al cliente', detalle: 'Desde «Envío de informes», en producción' },
  sistema: { nodo: 'sistema', titulo: 'Informe cargado al sistema', detalle: 'Resultados ya visibles en Report' },
  observado: { nodo: 'observado', titulo: 'Reporte observado', detalle: 'El cliente vio sus resultados en Report por primera vez' },
}

function etiquetaSolicitud(e: EvaluadaEntrega) {
  return e.sol.numero_solicitud ?? e.sol.archivo
}

/** Lo que dice una solicitud de su avance dentro del plazo. */
function textoPlazo(e: EvaluadaEntrega) {
  if (e.plazo == null) return 'sin plazo cargado'
  const t = e.entregada && e.dias != null ? e.dias : e.edad
  return `${f1(t)} de ${e.plazo} d hábiles${e.analisis ? ` · ${e.analisis}` : ''}`
}

/**
 * El lead time como flujograma: de arriba hacia abajo, cada punto se enciende cuando el
 * tiempo transcurrido y los hitos registrados llegan a esa etapa. Con todas las solicitudes
 * muestra cuántas pasaron por cada punto y cuántas están ahí hoy; al elegir una sola, su
 * propio recorrido con fechas. Informe enviado al cliente e informe cargado al sistema van
 * al mismo nivel. «Reporte observado» sale de la primera vez que un cliente abre sus
 * resultados en Report.
 */
export function FlujogramaLeadTime({ ev, titulo }: { ev: EvaluadaEntrega[]; titulo: string }) {
  const [abierto, setAbierto] = useState<NodoFlujo | null>(null)
  const [elegida, setElegida] = useState('')
  const [verTodas, setVerTodas] = useState(false)

  const validas = useMemo(() => ev.filter((e) => e.veredicto !== 'excluida'), [ev])
  const resumen = useMemo(() => resumenFlujo(ev), [ev])
  const una = elegida ? validas.find((e) => e.sol.archivo === elegida) ?? null : null
  const ENCADENA: NodoFlujo[] = ['emitida', 'recepcion', 'analisis', 'informe']
  // Los cuatro primeros puntos listan lo que está AHÍ hoy; los últimos, todo lo que ya llegó.
  const dePunto = (n: NodoFlujo) => validas.filter((e) => (ENCADENA.includes(n) ? nodoActual(e) === n : alcanzados(e)[n]))

  // El rango de plazos prometidos de las solicitudes que están en análisis hoy.
  const plazosEnAnalisis = validas.filter((e) => nodoActual(e) === 'analisis' && e.plazo != null).map((e) => e.plazo as number)
  const rangoPlazo = plazosEnAnalisis.length
    ? Math.min(...plazosEnAnalisis) === Math.max(...plazosEnAnalisis)
      ? `${Math.min(...plazosEnAnalisis)} días hábiles`
      : `${Math.min(...plazosEnAnalisis)} a ${Math.max(...plazosEnAnalisis)} días hábiles`
    : null
  const pasadasDePlazo = validas.filter((e) => e.veredicto === 'vencida').length

  function textoNodo(n: NodoFlujo): { cifra: string | null; extra: string | null; fechaNodo: string | null; on: boolean; aqui: boolean } {
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
        observado: fecha(h?.observado),
      }
      return {
        cifra: null,
        extra: n === 'analisis' ? textoPlazo(una) : n === 'observado' && h?.observado_por?.length ? h.observado_por.join(' · ') : null,
        fechaNodo: a[n] ? fechas[n] : null,
        on: a[n],
        aqui: nodoActual(una) === n,
      }
    }
    const r = resumen[n]
    return {
      cifra: `${nf.format(r.alcanzaron)} ${r.alcanzaron === 1 ? 'solicitud llegó' : 'solicitudes llegaron'}`,
      extra: n === 'analisis' && rangoPlazo ? `plazo prometido: ${rangoPlazo}` : null,
      fechaNodo: null,
      on: r.alcanzaron > 0,
      aqui: r.ahoraAqui > 0,
    }
  }

  const nodo = (n: NodoFlujo) => {
    const p = PUNTOS[n]
    const t = textoNodo(n)
    const ahora = !una ? resumen[n].ahoraAqui : 0
    const clicable = !una
    const contenido = (
      <>
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
        {ahora > 0 && <span className={styles.ahora}>{nf.format(ahora)} aquí hoy</span>}
        {una && t.aqui && <span className={styles.ahora}>está aquí hoy</span>}
      </>
    )
    const clase = `${styles.nodo} ${t.on ? styles.on : ''} ${t.aqui ? styles.aqui : ''}`
    return clicable ? (
      <button
        key={n}
        type="button"
        className={clase}
        aria-expanded={abierto === n}
        onClick={() => { setAbierto(abierto === n ? null : n); setVerTodas(false) }}
      >
        {contenido}
      </button>
    ) : (
      <div key={n} className={clase}>{contenido}</div>
    )
  }

  const lista = abierto ? dePunto(abierto) : []
  const mostrar = verTodas ? lista : lista.slice(0, 10)

  return (
    <div className={styles.flujo}>
      <div className={styles.cabecera}>
        <span className={styles.sobre}>Flujo del lead time · {titulo}</span>
        <label className={styles.selector}>
          <span>Ver</span>
          <select value={elegida} onChange={(e) => { setElegida(e.target.value); setAbierto(null) }} aria-label="Ver una solicitud">
            <option value="">Todas las solicitudes</option>
            {[...validas]
              .sort((a, b) => etiquetaSolicitud(a).localeCompare(etiquetaSolicitud(b), 'es', { numeric: true }))
              .map((e) => <option key={e.sol.archivo} value={e.sol.archivo}>{etiquetaSolicitud(e)} · {e.sol.laboratorio ?? '—'}</option>)}
          </select>
        </label>
      </div>
      {una && (
        <p className={styles.resumenUna}>
          {una.sol.sold_to ?? '—'}{una.sol.ship_to ? ` · ${una.sol.ship_to}` : ''}
          {' · '}{una.plazo != null ? `plazo ${una.plazo} d hábiles${una.analisis ? ` (${una.analisis})` : ''}` : 'sin plazo cargado'}
        </p>
      )}

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

      {abierto && !una && (
        <div className={styles.detalle}>
          <h4>{PUNTOS[abierto].titulo} · {nf.format(lista.length)}</h4>
          {lista.length === 0 ? (
            <p className={styles.vacio}>
              {abierto === 'observado'
                ? 'Todavía ningún cliente abrió sus resultados en Report (o falta correr la migración 0057).'
                : 'No hay solicitudes en este punto.'}
            </p>
          ) : (
            <>
              <ul>
                {mostrar.map((e) => (
                  <li key={e.sol.archivo}>
                    <b>{etiquetaSolicitud(e)}</b>
                    <span>{e.sol.laboratorio ?? '—'} · {e.sol.sold_to ?? '—'}{e.sol.ship_to ? ` · ${e.sol.ship_to}` : ''}</span>
                    <small>
                      {abierto === 'observado'
                        ? `${fecha(e.hitos?.observado)} · ${(e.hitos?.observado_por ?? []).join(', ') || '—'}`
                        : abierto === 'cliente' || abierto === 'sistema'
                          ? fecha(abierto === 'cliente' ? e.hitos?.cliente : e.hitos?.report)
                          : textoPlazo(e)}
                    </small>
                  </li>
                ))}
              </ul>
              {lista.length > 10 && (
                <button type="button" className={styles.mas} onClick={() => setVerTodas((v) => !v)}>
                  {verTodas ? 'Mostrar menos' : `Ver las ${nf.format(lista.length)}`}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
