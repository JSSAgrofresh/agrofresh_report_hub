import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { editarCruce } from '@/features/emitir'
import type { Solicitud } from '@/features/emitir'
import { FotoCruce } from './FotoCruce'
import styles from './EditarCruceModal.module.css'

interface EditarCruceModalProps {
  solicitud: Solicitud
  onGuardado: () => void | Promise<void>
  onCancelar: () => void
}

/** Corregir un cruce ya hecho: el N° de muestra, el peso (alguien digitó un
 * cero de más) y, si hace falta, cambiar la foto. */
export function EditarCruceModal({ solicitud, onGuardado, onCancelar }: EditarCruceModalProps) {
  const [codigo, setCodigo] = useState(solicitud.codigo_muestra ?? '')
  const [peso, setPeso] = useState(solicitud.peso_muestra != null ? String(solicitud.peso_muestra) : '')
  const [foto, setFoto] = useState<File | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const unidad = solicitud.unidad_peso ?? 'kg'

  const fotoUrl = useMemo(() => (foto ? URL.createObjectURL(foto) : null), [foto])
  useEffect(() => () => { if (fotoUrl) URL.revokeObjectURL(fotoUrl) }, [fotoUrl])

  const pesoNum = parseFloat(peso.replace(',', '.'))
  const pesoValido = !isNaN(pesoNum) && pesoNum > 0
  const codigoValido = codigo.trim() !== ''
  const cambio =
    foto !== null || codigo.trim() !== (solicitud.codigo_muestra ?? '') || pesoNum !== (solicitud.peso_muestra ?? NaN)

  async function guardar() {
    setGuardando(true)
    setError(null)
    try {
      await editarCruce(solicitud.archivo, { codigoMuestra: codigo.trim(), peso: pesoNum, unidad, foto })
      await onGuardado()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el cambio. Intenta de nuevo.')
      setGuardando(false)
    }
  }

  return (
    <Modal
      titulo="Corregir cruce"
      subtitulo={solicitud.campos['N° Solicitud'] || solicitud.archivo}
      onCerrar={() => !guardando && onCancelar()}
      pie={
        <>
          <button type="button" className={styles.secundario} onClick={onCancelar} disabled={guardando}>
            Cancelar
          </button>
          <button
            type="button"
            className={styles.primario}
            onClick={() => void guardar()}
            disabled={guardando || !pesoValido || !codigoValido || !cambio}
          >
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </>
      }
    >
      <div className={styles.cuerpo}>
        <label className={styles.campo}>
          <span>N° de muestra</span>
          <input value={codigo} onChange={(e) => setCodigo(e.target.value)} disabled={guardando} data-foco />
        </label>
        <label className={styles.campo}>
          <span>Peso ({unidad})</span>
          <input
            type="number"
            inputMode="decimal"
            min="0.001"
            step="0.001"
            value={peso}
            onChange={(e) => setPeso(e.target.value)}
            disabled={guardando}
          />
          {peso !== '' && !pesoValido && <small className={styles.error}>El peso debe ser mayor a cero.</small>}
        </label>

        <div className={styles.campo}>
          <span>Foto</span>
          <div className={styles.foto}>
            {fotoUrl ? (
              <img src={fotoUrl} alt="Foto nueva de la muestra" />
            ) : solicitud.tiene_foto ? (
              <FotoCruce archivo={solicitud.archivo} alt="Foto actual de la muestra" />
            ) : (
              <p>Esta solicitud no tiene foto.</p>
            )}
          </div>
          <label className={styles.cambiarFoto}>
            {foto ? 'Elegir otra' : solicitud.tiene_foto ? 'Cambiar foto' : 'Agregar foto'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              disabled={guardando}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) setFoto(f)
                e.target.value = ''
              }}
            />
          </label>
        </div>

        {error && <p className={styles.error}>{error}</p>}
      </div>
    </Modal>
  )
}
