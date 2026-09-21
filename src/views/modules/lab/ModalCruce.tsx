import { useRef, useState } from 'react'
import type { Solicitud } from '@/features/emitir'
import { TipoMuestraChip } from './TipoMuestraChip'
import styles from './ModalCruce.module.css'

interface ModalCruceProps {
  solicitud: Solicitud
  codigoMuestra: string
  onConfirmar: (foto: File, peso: number, unidad: string) => Promise<void>
  onCancelar: () => void
}

type EstadoFoto = 'sin-foto' | 'previsualizando' | 'tomando'

/**
 * Modal que aparece antes de confirmar el cruce.
 * Requiere foto (tomada con cámara o seleccionada) y peso > 0 para habilitar Confirmar.
 * Permite retomar la foto si no quedó bien.
 */
export function ModalCruce({ solicitud, codigoMuestra, onConfirmar, onCancelar }: ModalCruceProps) {
  const [estadoFoto, setEstadoFoto] = useState<EstadoFoto>('sin-foto')
  const [fotoArchivo, setFotoArchivo] = useState<File | null>(null)
  const [fotoUrl, setFotoUrl] = useState<string | null>(null)
  const [peso, setPeso] = useState('')
  const [unidad] = useState('kg')
  const [confirmando, setConfirmando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputFotoRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const tipoMuestra = solicitud.campos['Tipo Muestra'] ?? null
  const pesoNum = parseFloat(peso)
  const pesoValido = !isNaN(pesoNum) && pesoNum > 0
  const listo = fotoArchivo !== null && pesoValido

  function limpiarFoto() {
    if (fotoUrl) URL.revokeObjectURL(fotoUrl)
    setFotoArchivo(null)
    setFotoUrl(null)
    setEstadoFoto('sin-foto')
    detenerCamara()
  }

  function detenerCamara() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  async function abrirCamara() {
    setError(null)
    setEstadoFoto('tomando')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
    } catch (err) {
      detenerCamara()
      setEstadoFoto('sin-foto')
      if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
        setError('No se pudo acceder a la cámara. Revisa los permisos del navegador.')
      } else {
        setError('No se pudo iniciar la cámara. Usa el botón "Elegir archivo" como alternativa.')
      }
    }
  }

  function capturarFoto() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError('No se pudo capturar la foto. Intenta de nuevo.')
          return
        }
        const archivo = new File([blob], `cruce_${Date.now()}.jpg`, { type: 'image/jpeg' })
        const url = URL.createObjectURL(archivo)
        setFotoArchivo(archivo)
        setFotoUrl(url)
        setEstadoFoto('previsualizando')
        detenerCamara()
      },
      'image/jpeg',
      0.88,
    )
  }

  function seleccionarArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    if (!archivo) return
    if (!archivo.type.startsWith('image/')) {
      setError('Solo se aceptan imágenes (JPEG, PNG, WEBP).')
      return
    }
    if (fotoUrl) URL.revokeObjectURL(fotoUrl)
    const url = URL.createObjectURL(archivo)
    setFotoArchivo(archivo)
    setFotoUrl(url)
    setEstadoFoto('previsualizando')
    setError(null)
    // Limpiar el input para permitir seleccionar el mismo archivo de nuevo
    e.target.value = ''
  }

  async function confirmar() {
    if (!fotoArchivo || !pesoValido) return
    setConfirmando(true)
    setError(null)
    try {
      await onConfirmar(fotoArchivo, pesoNum, unidad)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar el cruce. Intenta de nuevo.')
      setConfirmando(false)
    }
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Completar cruce">
      <div className={styles.modal}>
        <div className={styles.cabecera}>
          <div>
            <h3 className={styles.titulo}>Completar cruce</h3>
            <p className={styles.subtitulo}>
              <span className={styles.codigoMuestra}>{codigoMuestra}</span>
              {tipoMuestra && (
                <>
                  {' — '}
                  <TipoMuestraChip tipo={tipoMuestra} compacto />
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            className={styles.botonCerrar}
            onClick={onCancelar}
            disabled={confirmando}
            aria-label="Cancelar"
          >
            ✕
          </button>
        </div>

        <div className={styles.cuerpo}>
          {/* 1. Foto obligatoria */}
          <div className={styles.seccion}>
            <label className={styles.rotulo}>
              Fotografía de la muestra
              <span className={styles.obligatorio}> *</span>
            </label>

            {estadoFoto === 'sin-foto' && (
              <div className={styles.zonaFoto}>
                <p className={styles.ayudaFoto}>
                  Toma una foto de la muestra antes de confirmar el cruce.
                </p>
                <div className={styles.botonesCaptura}>
                  <button
                    type="button"
                    className={styles.botonFoto}
                    onClick={() => void abrirCamara()}
                  >
                    📷 Usar cámara
                  </button>
                  <button
                    type="button"
                    className={styles.botonFotoSecundario}
                    onClick={() => inputFotoRef.current?.click()}
                  >
                    Elegir archivo
                  </button>
                </div>
                <input
                  ref={inputFotoRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  hidden
                  onChange={seleccionarArchivo}
                />
              </div>
            )}

            {estadoFoto === 'tomando' && (
              <div className={styles.visorCamara}>
                <video ref={videoRef} className={styles.video} playsInline muted autoPlay />
                <canvas ref={canvasRef} hidden />
                <div className={styles.controlesCamara}>
                  <button
                    type="button"
                    className={styles.botonCapturar}
                    onClick={capturarFoto}
                  >
                    ⊙ Capturar foto
                  </button>
                  <button
                    type="button"
                    className={styles.botonFotoSecundario}
                    onClick={() => {
                      detenerCamara()
                      setEstadoFoto('sin-foto')
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {estadoFoto === 'previsualizando' && fotoUrl && (
              <div className={styles.previsualizacion}>
                <img
                  src={fotoUrl}
                  alt="Vista previa de la muestra"
                  className={styles.imgPrevia}
                />
                <button
                  type="button"
                  className={styles.botonRetomar}
                  onClick={limpiarFoto}
                  disabled={confirmando}
                >
                  Retomar foto
                </button>
              </div>
            )}
          </div>

          {/* 2. Peso obligatorio */}
          <div className={styles.seccion}>
            <label className={styles.rotulo} htmlFor="peso-muestra">
              Peso de la muestra
              <span className={styles.obligatorio}> *</span>
            </label>
            <div className={styles.filaPeso}>
              <input
                id="peso-muestra"
                type="number"
                className={styles.campoPeso}
                value={peso}
                onChange={(e) => setPeso(e.target.value)}
                placeholder="0.000"
                min="0.001"
                step="0.001"
                disabled={confirmando}
                aria-describedby="peso-unidad"
              />
              <span id="peso-unidad" className={styles.unidadPeso}>
                {unidad}
              </span>
            </div>
            {peso && !pesoValido && (
              <p className={styles.errorCampo}>El peso debe ser mayor a cero.</p>
            )}
          </div>

          {error && <p className={styles.errorGeneral}>{error}</p>}
        </div>

        <div className={styles.pie}>
          <button
            type="button"
            className={styles.botonCancelar}
            onClick={onCancelar}
            disabled={confirmando}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={styles.botonConfirmar}
            onClick={() => void confirmar()}
            disabled={!listo || confirmando}
            title={!listo ? 'Completa la foto y el peso para continuar' : undefined}
          >
            {confirmando ? 'Cruzando…' : 'Confirmar cruce'}
          </button>
        </div>
      </div>
    </div>
  )
}
