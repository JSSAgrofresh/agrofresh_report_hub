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
})
const iguales = (a: DatosAviso, b: DatosAviso) => JSON.stringify(datosDe(a)) === JSON.stringify(datosDe(b))

/** El aviso de bienvenida a clientes: se edita por completo (asunto, título, subtítulo y texto),
 * se ve tal como llegaría mientras se escribe, se guarda o se restaura al original, y se puede
 * mandar una prueba a Paz y Jorge con lo que está en pantalla. El envío a los clientes todavía
 * no existe a propósito. */
export function AvisoClientes() {
  const [guardado, setGuardado] = useState<Aviso | null>(null)
  const [edit, setEdit] = useState<DatosAviso | null>(null)
  const [html, setHtml] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)
  const turno = useRef(0)

  function cargar(a: Aviso) {
    if (a.titulo === undefined) {
      // Backend viejo (sin edición del aviso): se avisa en vez de dejar la pantalla rota.
      setError('El servidor todavía no tiene la versión nueva del aviso: hay que hacer git pull y reiniciar el backend.')
    }
    setGuardado({ ...a, destinatarios_prueba: a.destinatarios_prueba ?? [] })
    setEdit(datosDe(a))
    setHtml(a.html)
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
    if (!guardado || !edit || iguales(edit, guardado)) return
    const mio = ++turno.current
    const id = setTimeout(() => {
      vistaPreviaAviso(edit)
        .then((r) => { if (turno.current === mio) setHtml(r.html) })
        .catch(() => undefined)
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
  const vacio = !edit.asunto.trim() || !edit.titulo.trim() || !edit.texto.trim()

  return (
    <div className={styles.configuracion}>
      {error && <p className={styles.informeError}>{error}</p>}
      <div className={styles.rejilla}>
        <label className={styles.campoTexto}>
          <span>Asunto</span>
          <input value={edit.asunto} maxLength={200} onChange={(e) => cambiar('asunto', e.target.value)} />
        </label>
        <label className={styles.campoTexto}>
          <span>Título del encabezado</span>
          <input value={edit.titulo} maxLength={80} onChange={(e) => cambiar('titulo', e.target.value)} />
        </label>
        <label className={styles.campoTexto}>
          <span>Subtítulo (opcional)</span>
          <input value={edit.subtitulo} maxLength={120} onChange={(e) => cambiar('subtitulo', e.target.value)} />
        </label>
      </div>
      <label className={styles.campoTexto}>
        <span>Texto del correo</span>
        <textarea value={edit.texto} rows={14} onChange={(e) => cambiar('texto', e.target.value)} />
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
              onClick={() => ejecutar(async () => cargar(await restaurarAviso()), 'No se pudo restaurar el aviso.')}
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
      {resultado && <p className={styles.informeOk}>{resultado}</p>}
    </div>
  )
}
