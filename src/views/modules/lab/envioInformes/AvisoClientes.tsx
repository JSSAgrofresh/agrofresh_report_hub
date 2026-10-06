import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import {
  enviarPruebaAviso, guardarAviso, obtenerAvisoClientes, restaurarAviso, vistaPreviaAviso,
} from '@/features/envioInformes'
import type { AvisoClientes as Aviso, DatosAviso } from '@/features/envioInformes'
import { HttpError } from '@/services/http/client'
import styles from './EnvioInformes.module.css'

function mensajeDe(e: unknown, defecto: string): string {
  return e instanceof HttpError ? e.message : defecto
}

// Con un backend anterior a esta versión el aviso llega sin título ni subtítulo: nunca `undefined`.
const datosDe = (a: DatosAviso): DatosAviso => ({
  asunto: a.asunto ?? '', titulo: a.titulo ?? '', subtitulo: a.subtitulo ?? '', texto: a.texto ?? '',
  plantilla: a.plantilla ?? 'estandar',
})
const iguales = (a: DatosAviso, b: DatosAviso) => JSON.stringify(datosDe(a)) === JSON.stringify(datosDe(b))

/** El aviso de bienvenida a clientes: se edita por completo (asunto, título, subtítulo y texto),
 * se ve tal como llegaría mientras se escribe, se guarda o se restaura al original, y se puede
 * mandar una prueba a Paz y Jorge con lo que está en pantalla. El envío a los clientes todavía
 * no existe a propósito. */
export function AvisoClientes() {
  const [guardado, setGuardado] = useState<Aviso | null>(null)
  const [edit, setEdit] = useState<DatosAviso | null>(null)
  // Vista previa de lo que se está escribiendo (solo vale mientras haya cambios sin guardar).
  const [borrador, setBorrador] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Aviso fijo cuando el servidor es anterior a esta versión (no se borra con el resto de mensajes).
  const [avisoServidor, setAvisoServidor] = useState<string | null>(null)
  const [vistaFalla, setVistaFalla] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)
  const turno = useRef(0)

  function cargar(a: Aviso) {
    if (a.titulo === undefined) {
      // Backend viejo (sin edición del aviso): se avisa en vez de dejar la pantalla rota.
      setAvisoServidor('El servidor todavía no tiene la versión nueva del aviso: hay que hacer git pull y reiniciar el backend.')
    }
    turno.current += 1   // una vista previa que venga en camino ya no corresponde
    setGuardado({ ...a, destinatarios_prueba: a.destinatarios_prueba ?? [] })
    setEdit(datosDe(a))
    setBorrador(null)
    setVistaFalla(false)
  }

  useEffect(() => {
    let vivo = true
    obtenerAvisoClientes()
      .then((a) => { if (vivo) cargar(a) })
      .catch((e) => { if (vivo) setError(mensajeDe(e, 'No se pudo cargar el aviso.')) })
    return () => { vivo = false }
  }, [])

  // La vista previa sigue lo que se escribe (con una pausa para no preguntar en cada tecla).
  useEffect(() => {
    if (!guardado || !edit) return
    if (iguales(edit, guardado)) {
      // De vuelta a lo guardado: se invalida lo que venga en camino (se muestra el correo guardado).
      turno.current += 1
      return
    }
    const mio = ++turno.current
    const id = setTimeout(() => {
      vistaPreviaAviso(edit)
        .then((r) => { if (turno.current === mio) { setBorrador(r.html); setVistaFalla(false) } })
        .catch(() => { if (turno.current === mio) setVistaFalla(true) })
    }, 400)
    return () => clearTimeout(id)
  }, [edit, guardado])

  function cambiar(campo: keyof DatosAviso, valor: string) {
    setResultado(null)
    setEdit((e) => (e ? { ...e, [campo]: valor } : e))
  }

  async function ejecutar(accion: () => Promise<void>, falla: string) {
    setOcupado(true)
    setResultado(null)
    setError(null)
    try {
      await accion()
    } catch (e) {
      setError(mensajeDe(e, falla))
    } finally {
      setOcupado(false)
    }
  }

  if (!edit || !guardado) {
    return (
      <div className={styles.configuracion}>
        {error ? <p className={styles.informeError}>{error}</p> : <p className={styles.vacio}>Cargando el aviso…</p>}
      </div>
    )
  }

  const sinCambios = iguales(edit, guardado)
  const html = sinCambios ? guardado.html : (borrador ?? guardado.html)
  const vacio = !edit.asunto.trim() || !edit.titulo.trim() || !edit.texto.trim()

  return (
    <div className={styles.configuracion}>
      {avisoServidor && <p className={styles.informeError}>{avisoServidor}</p>}
      {guardado.plantillas && guardado.plantillas.length > 0 && (
        <div>
          <span className={styles.etiquetaCampo}>Plantilla</span>
          <div className={styles.plantillas} role="radiogroup" aria-label="Plantilla del aviso">
            {guardado.plantillas.map((p, i, todas) => (
              <button
                key={p.clave}
                type="button"
                role="radio"
                aria-checked={edit.plantilla === p.clave}
                tabIndex={edit.plantilla === p.clave || (!todas.some((t) => t.clave === edit.plantilla) && i === 0) ? 0 : -1}
                disabled={ocupado}
                className={edit.plantilla === p.clave ? styles.plantillaActiva : styles.plantilla}
                title={p.descripcion}
                onClick={() => cambiar('plantilla', p.clave)}
                onKeyDown={(e) => {
                  // Como un grupo de radios: las flechas mueven la selección y el foco.
                  const paso = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
                  if (!paso) return
                  e.preventDefault()
                  const sig = todas[(i + paso + todas.length) % todas.length]
                  cambiar('plantilla', sig.clave)
                  const hermanos = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
                  hermanos?.[(i + paso + todas.length) % todas.length]?.focus()
                }}
              >
                {p.miniatura && <img src={p.miniatura} alt="" />}
                <span>{p.nombre}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className={styles.rejilla}>
        <label className={styles.campoTexto}>
          <span>Asunto</span>
          <input value={edit.asunto} maxLength={200} disabled={ocupado} onChange={(e) => cambiar('asunto', e.target.value)} />
        </label>
        <label className={styles.campoTexto}>
          <span>Título del encabezado</span>
          <input value={edit.titulo} maxLength={80} disabled={ocupado} onChange={(e) => cambiar('titulo', e.target.value)} />
        </label>
        <label className={styles.campoTexto}>
          <span>Subtítulo (opcional)</span>
          <input value={edit.subtitulo} maxLength={120} disabled={ocupado} onChange={(e) => cambiar('subtitulo', e.target.value)} />
        </label>
      </div>
      <label className={styles.campoTexto}>
        <span>Texto del correo</span>
        <textarea value={edit.texto} rows={14} disabled={ocupado} onChange={(e) => cambiar('texto', e.target.value)} />
        <small className={styles.ayudaFormato}>
          Formato: <code>**negrita**</code>, listas con <code>- </code> al inicio de la línea y títulos con <code># </code>.
          Una línea en blanco separa los párrafos.
        </small>
      </label>

      <iframe className={styles.marcoCorreo} title="Vista previa del aviso a clientes" sandbox="" srcDoc={html} />

      <div className={styles.barraEnvio}>
        <span className={styles.vacio}>
          {sinCambios
            ? (guardado.personalizado ? 'Guardado.' : 'Es el texto original.')
            : 'Hay cambios sin guardar.'}{' '}
          La prueba sale solo a {guardado.destinatarios_prueba.join(' y ')}. El envío a clientes aún no está habilitado.
        </span>
        <div className={styles.informeAcciones}>
          {guardado.personalizado && (
            <button
              type="button"
              className={styles.enlace}
              disabled={ocupado}
              onClick={() => {
                const aviso = sinCambios ? '' : ' También se pierden los cambios que no has guardado.'
                if (!window.confirm(`Se vuelve al texto original y se borra el aviso guardado.${aviso} ¿Continuar?`)) return
                void ejecutar(async () => cargar(await restaurarAviso()), 'No se pudo restaurar el aviso.')
              }}
            >
              Restaurar el original
            </button>
          )}
          <Button
            type="button"
            variant="secondary"
            disabled={ocupado || sinCambios || vacio}
            onClick={() => ejecutar(async () => {
              cargar(await guardarAviso(edit))
              setResultado('Aviso guardado.')
            }, 'No se pudo guardar el aviso.')}
          >
            Guardar cambios
          </Button>
          <Button
            type="button"
            disabled={ocupado || vacio}
            onClick={() => ejecutar(async () => {
              const r = await enviarPruebaAviso(edit)
              setResultado(r.ok)
            }, 'No se pudo enviar la prueba.')}
          >
            {ocupado ? 'Trabajando…' : 'Probar el aviso'}
          </Button>
        </div>
      </div>
      {vistaFalla && !sinCambios && <p className={styles.informeAviso}>No se pudo actualizar la vista previa: lo que ves puede no ser lo último que escribiste.</p>}
      {error && <p className={styles.informeError} role="alert">{error}</p>}
      {resultado && <p className={styles.informeOk} role="status">{resultado}</p>}
    </div>
  )
}
