import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { esCorreoValido } from '@/features/envioInformes'
import { etiquetaCorreo, guardarFijos, restaurarFijos } from '@/features/listasDistribucion'
import type { FijosLista } from '@/features/listasDistribucion'
import { ETIQUETA_LISTA } from '@/lib/servicio'
import type { ListaDistribucion } from '@/lib/servicio'
import { HttpError } from '@/services/http/client'
import { ListaCorreos } from '@/views/modules/lab/envioInformes/ListaCorreos'
import styles from './FijosDeLista.module.css'

function Correos({ lista }: { lista: string[] }) {
  return (
    <>
      {lista.map((e) => <code key={e} title={e}>{etiquetaCorreo(e)}</code>)}
    </>
  )
}

const mismos = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x, i) => x.toLowerCase() === b[i].toLowerCase())

interface FijosDeListaProps {
  fijos: FijosLista
  servicio: ListaDistribucion
  /** Se llama con lo que quedó vigente al guardar o restaurar. */
  onCambio?: (fijos: FijosLista) => void
}

/** Lo que recibe cada solicitud de esta lista, tenga o no plantas cargadas. Actimist, Ecofog y RYD
 * se pueden editar aquí mismo: rige en las solicitudes nuevas y en el Envío de informes. */
export function FijosDeLista({ fijos, servicio, onCambio }: FijosDeListaProps) {
  const siempre = fijos.para.length > 0
  const [editando, setEditando] = useState(false)
  const [para, setPara] = useState<string[]>(fijos.para)
  const [cc, setCc] = useState<string[]>(fijos.cc)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nombre = ETIQUETA_LISTA[servicio]

  function abrir() {
    setPara(fijos.para)
    setCc(fijos.cc)
    setError(null)
    setEditando(true)
  }

  async function ejecutar(accion: () => Promise<FijosLista>, falla: string) {
    setOcupado(true)
    setError(null)
    try {
      // Ojo: `onCambio?.(await accion())` no ejecutaría `accion` si `onCambio` no viene.
      const vigente = await accion()
      onCambio?.(vigente)
      setEditando(false)
    } catch (e) {
      setError(e instanceof HttpError ? e.message : falla)
    } finally {
      setOcupado(false)
    }
  }

  if (editando) {
    const malo = [...para, ...cc].find((c) => !esCorreoValido(c))
    const sinCambios = mismos(para, fijos.para) && mismos(cc, fijos.cc)
    return (
      <section className={styles.caja} aria-label={`Editar destinatarios de ${nombre}`}>
        <h3>Siempre reciben ({nombre})</h3>
        <div className={styles.edicion}>
          <ListaCorreos etiqueta="Para" valor={para} onChange={setPara} deshabilitado={ocupado} alerta={para.length === 0} />
          <ListaCorreos etiqueta="Copia" valor={cc} onChange={setCc} deshabilitado={ocupado} />
          <p className={styles.nota}>
            Reciben el correo de toda solicitud nueva de {nombre} y todo informe de {nombre} que se envíe, tenga o no la
            planta lista cargada; si la tiene, sus correos se suman. Las solicitudes ya enviadas no se reenvían.
          </p>
          {error && <p className={styles.error} role="alert">{error}</p>}
          {malo && <p className={styles.error}>«{malo}» no parece un correo.</p>}
          <div className={styles.acciones}>
            {fijos.personalizado && (
              <button
                type="button"
                className={styles.enlace}
                disabled={ocupado}
                onClick={() => {
                  if (!window.confirm(`Se vuelve a los destinatarios que trae el sistema para ${nombre}. ¿Continuar?`)) return
                  void ejecutar(() => restaurarFijos(servicio), 'No se pudo restaurar.')
                }}
              >
                Restaurar los originales
              </button>
            )}
            <Button type="button" variant="secondary" disabled={ocupado} onClick={() => setEditando(false)}>Cancelar</Button>
            <Button
              type="button"
              disabled={ocupado || sinCambios || para.length === 0 || !!malo}
              onClick={() => void ejecutar(() => guardarFijos(servicio, { para, cc }), 'No se pudo guardar.')}
            >
              {ocupado ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className={styles.caja} aria-label={`Destinatarios de ${nombre}`}>
      <h3>
        {siempre ? `Siempre reciben (${nombre})` : `Sin lista del cliente (${nombre})`}
        {fijos.personalizado && <span className={styles.etiqueta}>editado</span>}
      </h3>
      {siempre ? (
        <p>
          <b>Para</b> <Correos lista={fijos.para} /> · <b>Copia</b> <Correos lista={fijos.cc} />
          <span className={styles.nota}>Tenga o no la planta lista cargada; si la tiene, sus correos se suman.</span>
        </p>
      ) : (
        <p>
          Si una planta no tiene lista del cliente, los resultados van <b>Para</b> <Correos lista={fijos.respaldo} />
          {' '}(más los admin del Report Hub).
        </p>
      )}
      {fijos.editable && (
        <button type="button" className={styles.editar} onClick={abrir}>Editar</button>
      )}
    </section>
  )
}
