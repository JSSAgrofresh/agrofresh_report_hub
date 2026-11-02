import { useCallback, useEffect, useRef, useState } from 'react'
import { ROUTES } from '@/constants/routes'
import {
  DIAPOSITIVAS, ENGRANAJES, NODOS, PASOS_SIMULACION,
  anteriorDe, diapositivaDe, enviarComando, guardarNotaPresentacion, indiceDe, siguienteDe, useEstadoPresentacion,
} from '@/features/presentacion'
import type { TipoComando } from '@/features/presentacion'
import styles from './PresentacionControlView.module.css'

/**
 * El control remoto de la presentación, pensado para el teléfono en vertical (pantalla de bolsillo del administrador
 * general): avanza y retrocede, salta a una diapositiva, enciende la simulación, abre el ecosistema y activa paneles.
 * Las notas por diapositiva viven acá y solo se ven acá. Habla con el computador a través del servidor.
 */
export function PresentacionControlView() {
  const { datos, error } = useEstadoPresentacion({ control: true })
  // Lo que se escribió en este teléfono manda sobre lo que trae el servidor.
  const [editadas, setEditadas] = useState<Record<string, string>>({})
  const [guardado, setGuardado] = useState<'' | 'guardando' | 'guardado' | 'error'>('')
  const [aviso, setAviso] = useState<string | null>(null)
  // A dónde va la presentación apenas se toca (el computador tarda un par de segundos en confirmarlo).
  const [prevista, setPrevista] = useState<string | null>(null)
  const olvidarPrevista = useRef<number | null>(null)
  const temporizador = useRef<number | null>(null)

  const activa = !!datos?.activa
  const estado = datos?.estado ?? {}
  const idActual = prevista ?? estado.slide ?? 'portada'
  const actual = diapositivaDe(idActual)
  const n = indiceDe(idActual)
  const siguiente = siguienteDe(idActual)
  const anterior = anteriorDe(idActual)

  const notas = { ...(datos?.notas ?? {}), ...editadas }

  // Que la pantalla del teléfono no se apague mientras se presenta.
  useEffect(() => {
    let candado: WakeLockSentinel | null = null
    const pedir = () => {
      if (document.hidden) return
      navigator.wakeLock?.request('screen').then((c) => { candado = c }, () => undefined)
    }
    pedir()
    document.addEventListener('visibilitychange', pedir)
    return () => {
      document.removeEventListener('visibilitychange', pedir)
      void candado?.release().catch(() => undefined)
    }
  }, [])

  const mandar = useCallback(async (tipo: TipoComando, datosOrden?: Record<string, unknown>, destino?: string) => {
    navigator.vibrate?.(12)
    if (destino) {
      setPrevista(destino)
      if (olvidarPrevista.current) window.clearTimeout(olvidarPrevista.current)
      olvidarPrevista.current = window.setTimeout(() => setPrevista(null), 7000)
    }
    try {
      await enviarComando(tipo, datosOrden)
      setAviso(null)
    } catch (e) {
      setPrevista(null)
      setAviso(e instanceof Error ? e.message : 'No se pudo mandar la orden.')
    }
  }, [])

  const escribirNota = (texto: string) => {
    setEditadas((p) => ({ ...p, [idActual]: texto }))
    setGuardado('guardando')
    if (temporizador.current) window.clearTimeout(temporizador.current)
    temporizador.current = window.setTimeout(() => {
      guardarNotaPresentacion(idActual, texto).then(() => setGuardado('guardado'), () => setGuardado('error'))
    }, 700)
  }
  useEffect(() => () => {
    if (temporizador.current) window.clearTimeout(temporizador.current)
    if (olvidarPrevista.current) window.clearTimeout(olvidarPrevista.current)
  }, [])

  const sim = estado.sim
  const enViaje = idActual === 'viaje'
  const enMotor = idActual === 'motor'
  const nota = notas[idActual] ?? ''
  const notaSiguiente = siguiente ? notas[siguiente.id] : ''

  return (
    <main className={styles.control}>
      <header className={styles.cabecera}>
        <a className={styles.salir} href={ROUTES.dashboard} aria-label="Volver al sistema">←</a>
        <h1 className={styles.titulo}>Control remoto</h1>
        <span className={activa ? styles.enLinea : styles.sinLinea} role="status">
          <i aria-hidden="true" />
          {activa ? 'Conectado' : 'Sin presentación'}
        </span>
      </header>

      {!activa && (
        <section className={styles.espera} aria-live="polite">
          <h2>Abre la presentación en tu computador</h2>
          <p>
            En el sistema: <strong>Administración General → Funciones → Presentación del sistema → Abrir presentación</strong>.
            En cuanto se abra, este control se conecta solo.
          </p>
          {error && <p className={styles.error}>{error}</p>}
        </section>
      )}

      {aviso && <p className={styles.error} role="alert">{aviso}</p>}

      {activa && estado.decision && (
        <section className={styles.decision} aria-label="Decisión pendiente" aria-live="assertive">
          <h2>¿Aceptar este informe?</h2>
          <p>
            <strong>{estado.decision.lab}</strong> · {estado.decision.cli}
            <br />
            <small>Informe {estado.decision.num}</small>
          </p>
          <div className={styles.fila}>
            <button type="button" className={`${styles.boton} ${styles.principal}`} onClick={() => void mandar('decidir', { v: 'accept' })}>Aceptar</button>
            <button type="button" className={`${styles.boton} ${styles.rechazar}`} onClick={() => void mandar('decidir', { v: 'reject' })}>Rechazar</button>
          </div>
        </section>
      )}

      <section className={styles.actual} aria-label="Diapositiva actual">
        <span className={styles.contador}>{n + 1} / {DIAPOSITIVAS.length}</span>
        <h2>{actual?.nombre ?? '—'}</h2>
        <p>{actual?.detalle}</p>
        <div className={styles.flechas}>
          <button type="button" className={styles.flecha} disabled={!activa || !anterior} onClick={() => void mandar('anterior', undefined, anterior?.id)}>
            <span aria-hidden="true">←</span> Atrás
          </button>
          <button type="button" className={`${styles.flecha} ${styles.principal}`} disabled={!activa || !siguiente} onClick={() => void mandar('siguiente', undefined, siguiente?.id)}>
            Adelante <span aria-hidden="true">→</span>
          </button>
        </div>
        {siguiente && <p className={styles.luego}>Sigue: <strong>{siguiente.nombre}</strong></p>}
      </section>

      <section className={styles.notas} aria-label="Notas de esta diapositiva">
        <label htmlFor="nota-actual">Nota para «{actual?.nombre}» <small>(solo la ves tú, aquí)</small></label>
        <textarea
          id="nota-actual"
          value={nota}
          onChange={(e) => escribirNota(e.target.value)}
          placeholder="Lo que quieres acordarte de decir…"
          rows={4}
          maxLength={2000}
        />
        <span className={styles.estadoNota} aria-live="polite">
          {guardado === 'guardando' ? 'Guardando…' : guardado === 'guardado' ? 'Guardado' : guardado === 'error' ? 'No se pudo guardar' : ''}
        </span>
        {notaSiguiente && <p className={styles.notaSiguiente}><strong>Nota de «{siguiente?.nombre}»:</strong> {notaSiguiente}</p>}
      </section>

      {enViaje && (
        <section className={styles.panel} aria-label="Simulación">
          <h3>Simulación</h3>
          <div className={styles.fila}>
            <button type="button" className={`${styles.boton} ${styles.principal}`} disabled={!activa} onClick={() => void mandar('simular')}>
              {sim?.playing ? '⏸ Pausar' : '▶ Simular'}
            </button>
            <button type="button" className={styles.boton} disabled={!activa || (sim?.paso ?? 0) <= 0} onClick={() => void mandar('paso', { n: Math.max(0, (sim?.paso ?? 0) - 1) })}>← Paso</button>
            <button type="button" className={styles.boton} disabled={!activa || (sim?.paso ?? -1) >= PASOS_SIMULACION.length - 1} onClick={() => void mandar('paso', { n: (sim?.paso ?? -1) + 1 })}>Paso →</button>
          </div>
          <ol className={styles.pasos}>
            {PASOS_SIMULACION.map((p, i) => (
              <li key={p}>
                <button type="button" className={i === sim?.paso ? styles.pasoActual : styles.paso} disabled={!activa} onClick={() => void mandar('paso', { n: i })}>
                  <b>{i + 1}</b> {p}
                </button>
              </li>
            ))}
          </ol>
          <h3>Paneles</h3>
          <div className={styles.fila}>
            <button type="button" className={estado.tab !== 'tok' ? styles.chipOn : styles.chip} disabled={!activa} onClick={() => void mandar('pestana', { t: 'ico' })}>Los íconos</button>
            <button type="button" className={estado.tab === 'tok' ? styles.chipOn : styles.chip} disabled={!activa} onClick={() => void mandar('pestana', { t: 'tok' })}>Qué viaja</button>
          </div>
          <div className={styles.chips}>
            {NODOS.map((nodo) => (
              <button key={nodo.k} type="button" className={estado.nodo === nodo.k ? styles.chipOn : styles.chip} disabled={!activa} onClick={() => void mandar('nodo', { k: nodo.k })}>{nodo.nombre}</button>
            ))}
          </div>
        </section>
      )}

      {enMotor && (
        <section className={styles.panel} aria-label="Engranajes">
          <h3>Engranajes</h3>
          <div className={styles.chips}>
            {ENGRANAJES.map((g) => (
              <button key={g.k} type="button" className={estado.engranaje === g.k ? styles.chipOn : styles.chip} disabled={!activa} onClick={() => void mandar('engranaje', { k: g.k })}>{g.nombre}</button>
            ))}
          </div>
        </section>
      )}

      <section className={styles.panel} aria-label="Ecosistema en vivo">
        <h3>Ecosistema en vivo</h3>
        <div className={styles.fila}>
          <button type="button" className={`${styles.boton} ${estado.eco ? '' : styles.principal}`} disabled={!activa} onClick={() => void mandar('eco', { abierto: !estado.eco })}>
            {estado.eco ? 'Cerrar el ecosistema' : 'Abrir el ecosistema'}
          </button>
          {estado.eco && (
            <button type="button" className={styles.boton} disabled={!activa} onClick={() => void mandar('pausa_eco', { pausa: !estado.pausaEco })}>
              {estado.pausaEco ? '▶ Seguir' : '⏸ Pausar'}
            </button>
          )}
        </div>
      </section>

      <section className={styles.panel} aria-label="Ir a una diapositiva">
        <h3>Ir a…</h3>
        <ol className={styles.saltos}>
          {DIAPOSITIVAS.map((d, i) => (
            <li key={d.id}>
              <button type="button" className={d.id === idActual ? styles.pasoActual : styles.paso} disabled={!activa} onClick={() => void mandar('ir', { slide: d.id }, d.id)}>
                <b>{i + 1}</b> {d.nombre}
              </button>
            </li>
          ))}
        </ol>
      </section>
    </main>
  )
}
