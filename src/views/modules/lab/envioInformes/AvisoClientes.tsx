import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { enviarPruebaAviso, obtenerAvisoClientes } from '@/features/envioInformes'
import type { AvisoClientes as Aviso } from '@/features/envioInformes'
import { HttpError } from '@/services/http/client'
import styles from './EnvioInformes.module.css'

function mensajeDe(e: unknown, defecto: string): string {
  return e instanceof HttpError ? e.message : defecto
}

/** El aviso de bienvenida a clientes («de ahora en adelante los informes salen por el Report
 * Hub»): se ve tal como llegaría y se puede mandar una prueba a Paz y Jorge. El envío a los
 * clientes todavía no existe a propósito. */
export function AvisoClientes() {
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    obtenerAvisoClientes()
      .then((a) => { if (vivo) setAviso(a) })
      .catch((e) => { if (vivo) setError(mensajeDe(e, 'No se pudo cargar el aviso.')) })
    return () => { vivo = false }
  }, [])

  async function probar() {
    setEnviando(true)
    setResultado(null)
    setError(null)
    try {
      const r = await enviarPruebaAviso()
      setResultado(r.ok)
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo enviar la prueba.'))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className={styles.configuracion}>
      {error && <p className={styles.informeError}>{error}</p>}
      {!aviso && !error && <p className={styles.vacio}>Cargando el aviso…</p>}
      {aviso && (
        <>
          <dl className={styles.cabecerasCorreo}>
            <dt>Asunto</dt><dd className={styles.asuntoVista}>{aviso.asunto}</dd>
          </dl>
          <iframe className={styles.marcoCorreo} title="Vista previa del aviso a clientes" sandbox="" srcDoc={aviso.html} />
          <div className={styles.barraEnvio}>
            <span className={styles.vacio}>
              La prueba sale solo a {aviso.destinatarios_prueba.join(' y ')}. El envío a clientes aún no está habilitado.
            </span>
            <Button type="button" onClick={probar} disabled={enviando}>
              {enviando ? 'Enviando…' : 'Probar el aviso'}
            </Button>
          </div>
          {resultado && <p className={styles.informeOk}>{resultado}</p>}
        </>
      )}
    </div>
  )
}
