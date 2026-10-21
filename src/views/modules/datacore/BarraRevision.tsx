import { useEffect, useRef, useState } from 'react'
import { revisarCorreoAhora } from '@/features/correoInformes'
import type { UltimoSondeo } from '@/features/correoInformes'
import { fechaHoraCorta } from '@/features/notificaciones'
import styles from './BarraRevision.module.css'

const DIAS = [7, 14, 30, 60]
const MINUTOS_COLGADA = 20

interface Props {
  /** La última revisión que conoce el servidor (para el aviso y para saber si hay una en curso). */
  ultimo: UltimoSondeo | null
  /** Pide la última revisión al servidor (la bandeja la trae junto con la lista). */
  leerUltimo: () => Promise<UltimoSondeo | null>
  /** Terminó una revisión: el resto del panel tiene que releer. */
  onTerminada: () => void
  intervaloMs?: number
}

/**
 * «Revisar el correo ahora»: arranca la revisión del buzón en el servidor (puede tardar minutos, por eso corre
 * de fondo) y sigue su avance hasta que termine.
 */
export function BarraRevision({ ultimo, leerUltimo, onTerminada, intervaloMs = 3000 }: Props) {
  const [dias, setDias] = useState(14)
  const [revisando, setRevisando] = useState(false)
  // Cada «Revisar» abre una vuelta nueva: si se reinicia la revisión, la vuelta anterior deja de mirar.
  const vuelta = useRef(0)
  const [progreso, setProgreso] = useState(0)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Si al abrir la pantalla ya hay una revisión en curso (la lanzó otra pestaña), se sigue su avance.
  // Una revisión sin terminar hace más de 20 min quedó colgada (p. ej. se reinició el servidor): no cuenta como en curso.
  const colgada = ultimo != null && ultimo.terminado_en == null && Date.now() - new Date(ultimo.iniciado_en).getTime() > MINUTOS_COLGADA * 60_000
  const enCurso = ultimo != null && ultimo.terminado_en == null && !colgada
  useEffect(() => {
    if (!enCurso || revisando) return
    let vigente = true
    const id = window.setInterval(() => {
      void leerUltimo().then((s) => {
        if (vigente && s && s.terminado_en) onTerminada()
      })
    }, intervaloMs)
    return () => {
      vigente = false
      window.clearInterval(id)
    }
  }, [enCurso, revisando, leerUltimo, onTerminada, intervaloMs])

  async function revisar(forzar = false) {
    const mia = ++vuelta.current
    setRevisando(true)
    setMensaje(null)
    setError(null)
    setProgreso(0)
    try {
      const { id } = await revisarCorreoAhora(dias, forzar)
      for (let n = 0; n < 400; n++) {
        await new Promise((r) => window.setTimeout(r, intervaloMs))
        const s = await leerUltimo()
        if (vuelta.current !== mia) return
        if (s) setProgreso(s.nuevos)
        if (s && s.id === id && s.terminado_en) {
          if (s.error) setError(s.error)
          else setMensaje(`Listo: ${s.examinados} correos nuevos revisados, ${s.nuevos} informes registrados.`)
          onTerminada()
          return
        }
      }
      setError('La revisión sigue en curso. Vuelve a mirar en unos minutos.')
    } catch (e) {
      if (vuelta.current === mia) setError(e instanceof Error ? e.message : 'No se pudo revisar el correo.')
    } finally {
      if (vuelta.current === mia) setRevisando(false)
    }
  }

  const ocupado = revisando || enCurso
  return (
    <div className={styles.barra}>
      <div className={styles.texto}>
        {ultimo ? (
          <span>
            {colgada ? 'La última revisión quedó colgada: ' : enCurso && !revisando ? 'Revisando el correo… ' : 'Última revisión: '}
            {fechaHoraCorta(ultimo.terminado_en ?? ultimo.iniciado_en)} · {ultimo.nuevos} informes nuevos
            {ultimo.error ? ` · con error: ${ultimo.error}` : ''}
          </span>
        ) : (
          <span>El correo todavía no se ha revisado.</span>
        )}
        {mensaje && <span className={styles.exito}>{mensaje}</span>}
        {error && <span className={styles.error} role="alert">{error}</span>}
      </div>
      <label className={styles.etiqueta}>
        Últimos
        <select value={dias} onChange={(e) => setDias(Number(e.target.value))} disabled={ocupado}>
          {DIAS.map((d) => (
            <option key={d} value={d}>
              {d} días
            </option>
          ))}
        </select>
      </label>
      {ocupado && (
        <button type="button" className={styles.reiniciar} onClick={() => void revisar(true)} title="Si la revisión no avanza, empieza otra de cero">
          Reiniciar la revisión
        </button>
      )}
      <button type="button" className={styles.boton} onClick={() => void revisar(colgada)} disabled={ocupado}>
        {ocupado ? `Revisando el correo… (${progreso} informes hasta ahora)` : 'Revisar el correo ahora'}
      </button>
    </div>
  )
}
