import { useCallback, useEffect, useRef, useState } from 'react'
import styles from './EscanerCamara.module.css'

interface EscanerCamaraProps {
  onLeido: (codigo: string) => void
  onCerrar: () => void
  titulo?: string
}

type Estado = 'iniciando' | 'activo' | 'confirmar' | 'sin-soporte' | 'permiso-denegado' | 'error'

/**
 * Abre la cámara trasera del teléfono y detecta códigos de barras o QR usando
 * la BarcodeDetector API nativa (Chrome 83+, Android). En browsers sin soporte
 * muestra un mensaje claro para que el usuario use el lector de pistola.
 *
 * Evita lecturas duplicadas: el mismo código no se reporta dos veces en 1,5 s.
 */
export function EscanerCamara({ onLeido, onCerrar, titulo = 'Escanear con cámara' }: EscanerCamaraProps) {
  const [estado, setEstado] = useState<Estado>('iniciando')
  const [mensajeError, setMensajeError] = useState<string | null>(null)
  const [codigoDetectado, setCodigoDetectado] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const detectorRef = useRef<unknown>(null)
  const animFrameRef = useRef<number | null>(null)
  const ultimoLeidoRef = useRef<string | null>(null)
  const ultimoTsRef = useRef<number>(0)
  const cerradoRef = useRef(false)
  const pausadoRef = useRef(false)
  const reanudarRef = useRef<(() => void) | null>(null)

  const detener = useCallback(() => {
    cerradoRef.current = true
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  useEffect(() => {
    return () => {
      detener()
    }
  }, [detener])

  useEffect(() => {
    let cancelado = false

    async function iniciar() {
      // 1. ¿El browser soporta BarcodeDetector?
      if (!('BarcodeDetector' in window)) {
        setEstado('sin-soporte')
        return
      }

      // 2. Crear el detector
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const BarcodeDetectorCls = (window as any).BarcodeDetector as {
          new (opts: { formats: string[] }): unknown
          getSupportedFormats?: () => Promise<string[]>
        }
        detectorRef.current = new BarcodeDetectorCls({
          formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'qr_code', 'data_matrix', 'upc_a', 'upc_e', 'itf', 'codabar'],
        })
      } catch {
        setEstado('sin-soporte')
        return
      }

      // 3. Solicitar acceso a la cámara trasera
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        })
      } catch (err) {
        if (cancelado) return
        if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
          setEstado('permiso-denegado')
        } else {
          setEstado('error')
          setMensajeError('No se pudo acceder a la cámara. Verifica que no esté en uso por otra aplicación.')
        }
        return
      }

      if (cancelado) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }

      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        try {
          await videoRef.current.play()
        } catch {
          if (cancelado) return
          setEstado('error')
          setMensajeError('No se pudo reproducir el video de la cámara.')
          return
        }
      }

      if (cancelado) return
      setEstado('activo')

      // 4. Loop de detección de códigos
      async function detectar() {
        if (cerradoRef.current || cancelado || pausadoRef.current) return
        const video = videoRef.current
        const detector = detectorRef.current
        if (!video || !detector || video.readyState < 2) {
          animFrameRef.current = requestAnimationFrame(() => { void detectar() })
          return
        }

        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const codigos = await (detector as any).detect(video) as Array<{ rawValue: string }>
          if (codigos.length > 0 && !cerradoRef.current && !cancelado && !pausadoRef.current) {
            const codigo = codigos[0].rawValue.trim()
            const ahora = Date.now()
            if (codigo && (codigo !== ultimoLeidoRef.current || ahora - ultimoTsRef.current > 1500)) {
              ultimoLeidoRef.current = codigo
              ultimoTsRef.current = ahora
              // Pausar el loop y pedir confirmación al usuario
              pausadoRef.current = true
              setCodigoDetectado(codigo)
              setEstado('confirmar')
              return
            }
          }
        } catch {
          // BarcodeDetector puede lanzar si el frame no está listo; ignorar
        }

        if (!cerradoRef.current && !cancelado && !pausadoRef.current) {
          animFrameRef.current = requestAnimationFrame(() => { void detectar() })
        }
      }

      // Expone la función de reanudar para el botón "Volver a escanear"
      reanudarRef.current = () => {
        if (cerradoRef.current || cancelado) return
        pausadoRef.current = false
        ultimoLeidoRef.current = null
        setCodigoDetectado(null)
        setEstado('activo')
        animFrameRef.current = requestAnimationFrame(() => { void detectar() })
      }

      animFrameRef.current = requestAnimationFrame(() => { void detectar() })
    }

    void iniciar()

    return () => {
      cancelado = true
    }
  }, [detener, onLeido])

  function cerrar() {
    detener()
    onCerrar()
  }

  function confirmar() {
    if (!codigoDetectado) return
    detener()
    onLeido(codigoDetectado)
  }

  function repetir() {
    reanudarRef.current?.()
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={titulo}>
      <div className={styles.contenedor}>
        <div className={styles.cabecera}>
          <span className={styles.titulo}>{titulo}</span>
          <button type="button" className={styles.botonCerrar} onClick={cerrar} aria-label="Cerrar escáner">
            ✕
          </button>
        </div>

        {estado === 'iniciando' && (
          <div className={styles.mensaje}>
            <p>Iniciando cámara…</p>
          </div>
        )}

        {estado === 'sin-soporte' && (
          <div className={styles.mensaje}>
            <p className={styles.mensajeError}>
              Este navegador no soporta el escaneo con cámara.
            </p>
            <p className={styles.mensajeSugerencia}>
              Usa Google Chrome en Android, o escanea con la pistola de códigos de barras.
            </p>
            <button type="button" className={styles.botonSecundario} onClick={cerrar}>
              Cerrar
            </button>
          </div>
        )}

        {estado === 'permiso-denegado' && (
          <div className={styles.mensaje}>
            <p className={styles.mensajeError}>
              No se pudo acceder a la cámara. El permiso fue denegado.
            </p>
            <p className={styles.mensajeSugerencia}>
              Revisa los permisos de la aplicación en tu dispositivo (Ajustes → Aplicaciones → Navegador → Permisos → Cámara) y vuelve a intentarlo.
            </p>
            <button type="button" className={styles.botonSecundario} onClick={cerrar}>
              Cerrar
            </button>
          </div>
        )}

        {estado === 'error' && (
          <div className={styles.mensaje}>
            <p className={styles.mensajeError}>
              {mensajeError ?? 'No se pudo iniciar el escáner.'}
            </p>
            <button type="button" className={styles.botonSecundario} onClick={cerrar}>
              Cerrar
            </button>
          </div>
        )}

        {estado === 'confirmar' && codigoDetectado && (
          <div className={styles.confirmacion}>
            <p className={styles.confirmacionTexto}>Se encontró este código:</p>
            <p className={styles.confirmacionCodigo}>{codigoDetectado}</p>
            <p className={styles.confirmacionAyuda}>¿Es el correcto?</p>
            <div className={styles.confirmacionBotones}>
              <button type="button" className={styles.botonAceptar} onClick={confirmar}>
                Aceptar
              </button>
              <button type="button" className={styles.botonSecundario} onClick={repetir}>
                Volver a escanear
              </button>
            </div>
          </div>
        )}

        {(estado === 'activo' || estado === 'iniciando') && (
          <div className={styles.visor}>
            <video
              ref={videoRef}
              className={styles.video}
              playsInline
              muted
              autoPlay
            />
            <div className={styles.marcador} aria-hidden="true">
              <div className={styles.marcadorEsquina} />
            </div>
            <p className={styles.instruccion}>
              Apunta al código de barras o QR
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
