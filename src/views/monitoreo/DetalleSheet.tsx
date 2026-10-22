import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { COLOR_CATEGORIA, ETIQUETA_CATEGORIA, iniciales, type CategoriaActividad } from '@/features/adminPanel'
import {
  duracion, horaChile, obtenerDetalleUsuario, TEXTO_ORIGEN_DESDE, tonoDe,
  type DetalleUsuario,
} from '@/features/monitoreo'
import styles from './MonitoreoView.module.css'

interface Props {
  email: string
  nombre: string
  onCerrar: () => void
}

type Estado = { fase: 'cargando' } | { fase: 'error'; mensaje: string } | { fase: 'ok'; datos: DetalleUsuario }

/** Lo que hizo una persona desde que se conectó, en una hoja que sube desde abajo. */
export function DetalleSheet({ email, nombre, onCerrar }: Props) {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' })

  useEffect(() => {
    let vivo = true
    const leer = () =>
      obtenerDetalleUsuario(email)
        .then((datos) => vivo && setEstado({ fase: 'ok', datos }))
        .catch((e: unknown) => vivo && setEstado({ fase: 'error', mensaje: e instanceof Error ? e.message : 'No se pudo leer.' }))
    void leer()
    const id = window.setInterval(() => { if (!document.hidden) void leer() }, 20000)
    return () => { vivo = false; window.clearInterval(id) }
  }, [email])

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', alTeclear)
    const previo = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', alTeclear); document.body.style.overflow = previo }
  }, [onCerrar])

  const d = estado.fase === 'ok' ? estado.datos : null
  const tono = tonoDe(email)

  return createPortal(
    <div className={styles.velo} onClick={onCerrar} role="presentation">
      <section
        className={styles.hoja}
        role="dialog"
        aria-modal="true"
        aria-label={`Actividad de ${nombre}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.agarre} aria-hidden="true" />
        <header className={styles.hojaCabecera}>
          <span className={styles.avatarGrande} style={{ '--tono': tono } as React.CSSProperties}>
            {iniciales(nombre)}
            {d?.en_linea && <i className={styles.punto} />}
          </span>
          <div className={styles.hojaTitulo}>
            <h2>{nombre}</h2>
            <p>
              {d?.en_linea ? <b className={styles.enLinea}>En línea</b> : <span>Sin conexión ahora</span>}
              {d?.modulo_actual && <> · {d.modulo_actual}</>}
            </p>
          </div>
          <button type="button" className={styles.cerrar} onClick={onCerrar} aria-label="Cerrar">✕</button>
        </header>

        {estado.fase === 'cargando' && <div className={styles.cargaHoja}><span className={styles.esqueleto} /><span className={styles.esqueleto} /><span className={styles.esqueleto} /></div>}
        {estado.fase === 'error' && <p className={styles.vacio}>{estado.mensaje}</p>}

        {d && (
          <div className={styles.hojaCuerpo}>
            <p className={styles.desde}>
              Mostrando lo que hizo <b>{TEXTO_ORIGEN_DESDE[d.origen_desde]}</b> ({horaChile(d.desde)}
              {' · '}{duracion(d.desde, d.ahora)})
            </p>

            <div className={styles.chips}>
              <span className={styles.chip}><b>{d.acciones}</b> acciones</span>
              {(Object.entries(d.por_categoria) as [string, number][]).sort((a, b) => b[1] - a[1]).map(([cat, n]) => (
                <span key={cat} className={styles.chip}>
                  <i style={{ background: COLOR_CATEGORIA[cat] ?? '#9aa59e' }} />
                  {ETIQUETA_CATEGORIA[cat as CategoriaActividad] ?? cat} <b>{n}</b>
                </span>
              ))}
            </div>

            {d.recorrido.length > 0 && (
              <div className={styles.recorrido} aria-label="Recorrido por módulos">
                {d.recorrido.map((m, i) => (
                  <span key={`${m}-${i}`} style={{ '--i': i } as React.CSSProperties}>{m}</span>
                ))}
              </div>
            )}

            {d.eventos.length === 0 ? (
              <p className={styles.vacio}>Todavía no hizo nada en este período.</p>
            ) : (
              <ol className={styles.linea}>
                {d.eventos.map((ev, i) => (
                  <li key={`${ev.t}-${i}`} style={{ '--i': Math.min(i, 14), '--c': COLOR_CATEGORIA[ev.categoria] ?? '#9aa59e' } as React.CSSProperties}>
                    <time>{horaChile(ev.t)}</time>
                    <span className={styles.lineaPunto} />
                    <div>
                      <p>{ev.texto}</p>
                      {ev.modulo && <small>{ev.modulo}</small>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </section>
    </div>,
    document.body,
  )
}
