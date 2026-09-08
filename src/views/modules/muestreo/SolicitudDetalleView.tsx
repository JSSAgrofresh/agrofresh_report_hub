import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IconFrasco } from '@/components/ui/icons'
import {
  obtenerSolicitud,
  descargarExcelSolicitud,
  descargarPdfSolicitud,
  enviarSolicitudPorCorreo,
  destinatariosDeSolicitud,
  listarAnalitosConfig,
  listarFotosSolicitud,
  subirFotoSolicitud,
  eliminarFotoSolicitud,
  obtenerFotoSolicitud,
} from '@/features/tomaMuestras'
import type { AnalitoConfig, Solicitud } from '@/features/tomaMuestras'
import { ROUTES, rutaTomaMuestrasEditar } from '@/constants/routes'
import { formatDateCL } from '@/lib/locale'
import styles from './SolicitudDetalleView.module.css'

function Campo({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className={styles.campo}>
      <dt>{etiqueta}</dt>
      <dd>{valor || '—'}</dd>
    </div>
  )
}

const MAX_FOTOS_MUESTRA = 5

/** Miniatura de una foto ya subida: el backend no expone las fotos por una
 * URL pública -viven en R2 detrás del mismo login que el resto de la
 * solicitud-, así que se piden como blob autenticado y se arma un object URL
 * local, que se libera al desmontar o al cambiar de foto. */
function MiniaturaFoto({
  archivo,
  nombre,
  onQuitar,
  quitando,
}: {
  archivo: string
  nombre: string
  onQuitar: () => void
  quitando: boolean
}) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let objectUrl: string | null = null
    let vigente = true
    obtenerFotoSolicitud(archivo, nombre)
      .then((blob) => {
        if (!vigente) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch(() => {})
    return () => {
      vigente = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [archivo, nombre])

  return (
    <div className={styles.miniatura}>
      {url && <img src={url} alt="Foto de la muestra" />}
      <button
        type="button"
        className={styles.quitarFoto}
        aria-label="Quitar foto"
        onClick={onQuitar}
        disabled={quitando}
      >
        ×
      </button>
    </div>
  )
}

/** El valor guardado para un analito, buscando su etiqueta tal como la
 * escribió la solicitud ("Nombre (unidad)"), y si no aparece así, por
 * nombre sin importar la unidad -mismo criterio de búsqueda que usa el
 * backend al armar el Excel (ver `_valor_guardado` en solicitud_excel.py),
 * para que un cambio de unidad en el catálogo no vacíe una solicitud vieja. */
function dosisDeAnalito(campos: Record<string, string>, analito: AnalitoConfig): string | null {
  const etiqueta = analito.unidad ? `${analito.nombre} (${analito.unidad})` : analito.nombre
  if (etiqueta in campos) return campos[etiqueta]
  if (analito.nombre in campos) return campos[analito.nombre]
  const nombre = analito.nombre.trim()
  for (const [clave, valor] of Object.entries(campos)) {
    if (clave.split(' (')[0].trim() === nombre) return valor
  }
  return null
}

export function SolicitudDetalleView() {
  const { archivo } = useParams<{ archivo: string }>()
  const navigate = useNavigate()
  const [solicitud, setSolicitud] = useState<Solicitud | null>(null)
  const [analitosLab, setAnalitosLab] = useState<AnalitoConfig[]>([])
  const [error, setError] = useState<string | null>(null)
  const [mostrarEnvio, setMostrarEnvio] = useState(false)
  const [emailEnvio, setEmailEnvio] = useState('')
  const [invitados, setInvitados] = useState<string[]>([])
  const [enviando, setEnviando] = useState(false)
  const [mensajeEnvio, setMensajeEnvio] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [contactosLab, setContactosLab] = useState<string[] | null>(null)
  const inputEmailRef = useRef<HTMLInputElement>(null)

  // --- Fotos de la muestra: se piden por cámara y se suben directo a R2,
  // aparte del Excel de la solicitud (ver toma_muestras.py, endpoints
  // /fotos). `camaraActiva` refleja si el navegador ya tiene el stream de
  // video abierto -no si el usuario dio o no el permiso, eso el navegador lo
  // resuelve solo al llamar getUserMedia-.
  const [fotos, setFotos] = useState<string[]>([])
  const [camaraActiva, setCamaraActiva] = useState(false)
  const [subiendoFoto, setSubiendoFoto] = useState(false)
  const [quitandoFoto, setQuitandoFoto] = useState<string | null>(null)
  const [errorCamara, setErrorCamara] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    if (!archivo) return
    obtenerSolicitud(archivo)
      .then(setSolicitud)
      .catch(() => setError('No se pudo cargar la solicitud.'))
    listarFotosSolicitud(archivo)
      .then(setFotos)
      .catch(() => setFotos([]))
  }, [archivo])

  // Corta la cámara al salir de la pantalla -si no, el navegador sigue
  // mostrando el ícono de "cámara en uso" aunque la persona ya se fue.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  async function activarCamara() {
    setErrorCamara(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      })
      streamRef.current = stream
      setCamaraActiva(true)
      // El <video> recién se monta después de este setState, así que el
      // stream se asigna en un efecto aparte (ver más abajo) en vez de acá.
    } catch {
      setErrorCamara('No se pudo acceder a la cámara. Revisa que el navegador tenga permiso.')
    }
  }

  useEffect(() => {
    if (camaraActiva && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
    }
  }, [camaraActiva])

  function detenerCamara() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCamaraActiva(false)
  }

  async function tomarFoto() {
    if (!archivo || !videoRef.current || fotos.length >= MAX_FOTOS_MUESTRA) return
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
    if (!blob) return
    setSubiendoFoto(true)
    setErrorCamara(null)
    try {
      const actualizadas = await subirFotoSolicitud(archivo, blob, `foto_${Date.now()}.jpg`)
      setFotos(actualizadas)
    } catch {
      setErrorCamara('No se pudo guardar la foto. Intenta de nuevo.')
    } finally {
      setSubiendoFoto(false)
    }
  }

  async function quitarFoto(nombreFoto: string) {
    if (!archivo) return
    setQuitandoFoto(nombreFoto)
    try {
      const actualizadas = await eliminarFotoSolicitud(archivo, nombreFoto)
      setFotos(actualizadas)
    } catch {
      setErrorCamara('No se pudo quitar la foto. Intenta de nuevo.')
    } finally {
      setQuitandoFoto(null)
    }
  }

  // El catálogo del laboratorio es lo que permite mostrar cada analito
  // solicitado con su nombre y unidad, no solo el código crudo.
  useEffect(() => {
    if (!solicitud) return
    listarAnalitosConfig(solicitud.laboratorio)
      .then(setAnalitosLab)
      .catch(() => setAnalitosLab([]))
  }, [solicitud])

  // "Analitos solicitados": un renglón por cada código pedido, con su dosis
  // -o "Solicitado" si se marcó sin anotar una dosis-. Es la sección que
  // reemplaza tener que buscar la dosis de cada analito perdida entre el
  // resto de los campos de laboratorio (Tipo Aplicación, Gasto, etc).
  const analitosSolicitadosConDosis = useMemo(() => {
    if (!solicitud) return []
    return solicitud.analitos_solicitados.map((codigo) => {
      const analito = analitosLab.find((a) => a.codigo === codigo)
      const valor = analito ? dosisDeAnalito(solicitud.campos_laboratorio, analito) : null
      return {
        codigo,
        nombre: analito?.nombre ?? null,
        unidad: analito?.unidad ?? null,
        dosisAplicable: analito?.dosis_aplicable ?? true,
        dosis: valor && valor !== 'Solicitado' ? valor : null,
      }
    })
  }, [solicitud, analitosLab])

  // Los contactos del laboratorio se piden al abrir el panel, no al cargar la
  // vista: solo importan cuando se va a enviar.
  useEffect(() => {
    if (!mostrarEnvio || !archivo) return
    destinatariosDeSolicitud(archivo)
      .then((r) => setContactosLab(r.destinatarios))
      .catch(() => setContactosLab([]))
  }, [mostrarEnvio, archivo])

  async function handleEnviar() {
    if (!archivo) return
    const pendientes = agregarInvitados(emailEnvio)
    if (pendientes === null) return
    const destinatariosExtra = pendientes
    if ((contactosLab?.length ?? 0) + destinatariosExtra.length === 0) return
    setEnviando(true)
    setMensajeEnvio(null)
    try {
      const res = await enviarSolicitudPorCorreo(archivo, destinatariosExtra)
      setMensajeEnvio({ tipo: 'ok', texto: res.ok })
      setEmailEnvio('')
      setInvitados([])
      setMostrarEnvio(false)
    } catch {
      setMensajeEnvio({ tipo: 'error', texto: 'No se pudo enviar el correo. Verifica la dirección e intenta de nuevo.' })
    } finally {
      setEnviando(false)
    }
  }

  function agregarInvitados(valor: string, mostrarError = true): string[] | null {
    const candidatos = valor.split(/[;,\s]+/).map(email => email.trim()).filter(Boolean)
    if (candidatos.length === 0) return invitados
    const invalidos = candidatos.filter(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    if (invalidos.length > 0) {
      if (mostrarError) setMensajeEnvio({ tipo: 'error', texto: `Correo inválido: ${invalidos.join(', ')}` })
      return null
    }
    const configurados = new Set((contactosLab ?? []).map(email => email.toLowerCase()))
    const nuevos = [...invitados]
    candidatos.forEach(email => {
      if (!configurados.has(email.toLowerCase()) && !nuevos.some(actual => actual.toLowerCase() === email.toLowerCase())) {
        nuevos.push(email)
      }
    })
    setInvitados(nuevos)
    setEmailEnvio('')
    setMensajeEnvio(null)
    return nuevos
  }

  if (error) {
    return (
      <div>
        <Header title="Solicitud no encontrada" />
        <Card>
          <p className={styles.error}>{error}</p>
          <Button variant="secondary" onClick={() => navigate(ROUTES.tomaMuestras)}>
            Volver al listado
          </Button>
        </Card>
      </div>
    )
  }

  if (!solicitud) {
    return (
      <div>
        <Header title="Cargando solicitud…" />
        <Card>
          <p className={styles.estado}>Cargando…</p>
        </Card>
      </div>
    )
  }

  const camposLab = Object.entries(solicitud.campos_laboratorio)

  return (
    <div>
      <Header
        title={`Solicitud ${solicitud.numero_solicitud}${solicitud.enviada ? ' · Enviada' : ''}`}
        description={`${solicitud.laboratorio} · Generada el ${formatDateCL(solicitud.fecha_solicitud)} por ${solicitud.generado_por}${solicitud.enviada ? ' · Ya enviada: solo lectura' : ''}`}
        acciones={
          <div className={styles.acciones}>
            <Button variant="secondary" onClick={() => navigate(ROUTES.tomaMuestras)}>
              Volver
            </Button>
            {/* Editar y Enviar solo existen mientras la solicitud no se haya
                enviado: una vez enviada queda de solo lectura (el backend
                también lo rechaza con 409, esto es solo la pantalla). */}
            {!solicitud.enviada && (
              <Button
                variant="secondary"
                onClick={() => navigate(rutaTomaMuestrasEditar(solicitud.archivo))}
              >
                Editar
              </Button>
            )}
            <button
              type="button"
              className={styles.botonDescarga}
              onClick={() => void descargarExcelSolicitud(solicitud.archivo)}
            >
              Descargar Excel
            </button>
            <button
              type="button"
              className={styles.botonDescargaPdf}
              onClick={() => void descargarPdfSolicitud(solicitud.archivo)}
            >
              Descargar PDF
            </button>
            {!solicitud.enviada && (
              <button
                className={styles.botonEnviar}
                onClick={() => { setMostrarEnvio(v => !v); setMensajeEnvio(null) }}
              >
                Enviar por correo
              </button>
            )}
          </div>
        }
      />

      <Card>
        <div className={styles.avisoFotos}>
          <p className={styles.avisoFotosTitulo}>
            Recuerda escribir la siguiente información en la muestra
          </p>
          <dl className={styles.avisoFotosDatos}>
            <div className={styles.avisoFotosDato}>
              <dt>OT</dt>
              <dd>{solicitud.numero_solicitud}</dd>
            </div>
            <div className={styles.avisoFotosDato}>
              <dt>Sold To</dt>
              <dd>{solicitud.sold_to}</dd>
            </div>
            <div className={styles.avisoFotosDato}>
              <dt>Ship To</dt>
              <dd>{solicitud.ship_to || '—'}</dd>
            </div>
          </dl>
        </div>

        <h2 className={styles.tituloSeccion}>
          Fotos de la muestra ({fotos.length}/{MAX_FOTOS_MUESTRA})
        </h2>
        <p className={styles.descripcionEnvio}>
          Solo quedan guardadas junto a la solicitud en R2 -no se adjuntan al Excel ni al PDF-.
        </p>

        <div className={styles.camaraAcciones}>
          {!camaraActiva ? (
            <button
              type="button"
              className={styles.botonCamara}
              onClick={activarCamara}
              disabled={fotos.length >= MAX_FOTOS_MUESTRA}
            >
              Activar cámara
            </button>
          ) : (
            <>
              <button
                type="button"
                className={styles.botonCamara}
                onClick={() => void tomarFoto()}
                disabled={subiendoFoto || fotos.length >= MAX_FOTOS_MUESTRA}
              >
                {subiendoFoto ? 'Guardando…' : 'Tomar foto'}
              </button>
              <button type="button" className={styles.botonCamaraSecundario} onClick={detenerCamara}>
                Detener cámara
              </button>
            </>
          )}
          {fotos.length >= MAX_FOTOS_MUESTRA && (
            <span className={styles.contadorFotos}>Máximo de {MAX_FOTOS_MUESTRA} fotos alcanzado.</span>
          )}
        </div>

        {errorCamara && <p className={styles.error}>{errorCamara}</p>}

        {camaraActiva && (
          <video ref={videoRef} className={styles.videoCamara} autoPlay playsInline muted />
        )}

        {fotos.length > 0 && (
          <div className={styles.miniaturas}>
            {fotos.map((nombreFoto) => (
              <MiniaturaFoto
                key={nombreFoto}
                archivo={solicitud.archivo}
                nombre={nombreFoto}
                onQuitar={() => void quitarFoto(nombreFoto)}
                quitando={quitandoFoto === nombreFoto}
              />
            ))}
          </div>
        )}
      </Card>

      {mostrarEnvio && (
        <div className={styles.panelEnvio}>
          <label className={styles.etiquetaEnvio}>
            Enviar PDF y Excel · {solicitud.laboratorio}
          </label>
          <p className={styles.descripcionEnvio}>
            Contactos configurados para recibir solicitudes. Puedes sumar invitados para este envío.
          </p>

          {contactosLab === null ? (
            <p className={styles.notaEnvio}>Buscando los contactos del laboratorio…</p>
          ) : contactosLab.length > 0 ? (
            <div className={styles.destinatarios}>
              {contactosLab.map((email) => (
                <span key={email} className={styles.destinatario}>
                  <span className={styles.tipoDestinatario}>Configurado</span>{email}
                </span>
              ))}
            </div>
          ) : (
            <p className={styles.notaEnvioAviso}>
              {solicitud.laboratorio} no tiene contactos de solicitud configurados. Agrégalos en
              Administración → Laboratorios → Contactos, o escribe un correo abajo.
            </p>
          )}

          {invitados.length > 0 && (
            <div className={styles.destinatarios}>
              {invitados.map(email => (
                <span key={email} className={`${styles.destinatario} ${styles.invitado}`}>
                  <span className={styles.tipoDestinatario}>Invitado</span>{email}
                  <button
                    type="button"
                    className={styles.quitarInvitado}
                    aria-label={`Quitar ${email}`}
                    onClick={() => setInvitados(actuales => actuales.filter(actual => actual !== email))}
                    disabled={enviando}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className={styles.filaEnvio}>
            <input
              ref={inputEmailRef}
              type="text"
              className={styles.inputEmail}
              placeholder="Agregar correo invitado (puedes separar varios con coma)…"
              value={emailEnvio}
              onChange={e => setEmailEnvio(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarInvitados(emailEnvio) } }}
              disabled={enviando}
            />
            <button
              type="button"
              className={styles.botonAgregar}
              onClick={() => agregarInvitados(emailEnvio)}
              disabled={enviando || !emailEnvio.trim()}
            >
              Agregar invitado
            </button>
            <button
              className={styles.botonEnviarConfirmar}
              onClick={handleEnviar}
              disabled={enviando || ((contactosLab?.length ?? 0) + invitados.length === 0 && !emailEnvio.trim())}
            >
              {enviando
                ? 'Enviando…'
                : emailEnvio.trim()
                  ? 'Agregar invitado y enviar'
                  : `Enviar a ${(contactosLab?.length ?? 0) + invitados.length} contacto${(contactosLab?.length ?? 0) + invitados.length === 1 ? '' : 's'}`}
            </button>
            <button
              className={styles.botonCancelar}
              onClick={() => { setMostrarEnvio(false); setMensajeEnvio(null); setEmailEnvio(''); setInvitados([]) }}
              disabled={enviando}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {mensajeEnvio && (
        <div className={mensajeEnvio.tipo === 'ok' ? styles.mensajeOk : styles.mensajeError}>
          {mensajeEnvio.texto}
        </div>
      )}

      <div className={styles.grilla}>
        <Card>
          <h2 className={styles.tituloSeccion}>Identificación y solicitante</h2>
          <dl className={styles.fila}>
            <Campo etiqueta="N° Solicitud" valor={solicitud.numero_solicitud} />
            <Campo etiqueta="Fecha Solicitud" valor={formatDateCL(solicitud.fecha_solicitud)} />
            <Campo etiqueta="Laboratorio" valor={solicitud.laboratorio} />
            <Campo etiqueta="Solicitante" valor={solicitud.solicitante} />
            <Campo etiqueta="Generado Por" valor={solicitud.generado_por} />
            <Campo etiqueta="Email Solicitante" valor={solicitud.email_solicitante ?? ''} />
            <Campo etiqueta="Email Laboratorio" valor={solicitud.email_laboratorio ?? ''} />
          </dl>
        </Card>

        <Card>
          <h2 className={styles.tituloSeccion}>Cliente y ubicación</h2>
          <dl className={styles.fila}>
            <Campo etiqueta="Sold To" valor={solicitud.sold_to} />
            <Campo etiqueta="Ship To" valor={solicitud.ship_to ?? ''} />
            <Campo etiqueta="Especie" valor={solicitud.especie ?? ''} />
            <Campo etiqueta="Variedad" valor={solicitud.variedad ?? ''} />
            <Campo etiqueta="Línea Proceso" valor={solicitud.linea_proceso ?? ''} />
            <Campo etiqueta="Código del Productor" valor={solicitud.csg_productor ?? ''} />
            <Campo etiqueta="Código del Packing" valor={solicitud.csg_packing ?? ''} />
            <Campo etiqueta="Lote" valor={solicitud.lote ?? ''} />
          </dl>
        </Card>

        <Card>
          <h2 className={styles.tituloSeccion}>Información del muestreo</h2>
          <dl className={styles.fila}>
            <Campo etiqueta="Posición Muestreo" valor={solicitud.posicion_muestreo ?? ''} />
            <Campo etiqueta="N° Cámara" valor={solicitud.numero_camara ?? ''} />
            <Campo etiqueta="N° Orden" valor={solicitud.numero_orden ?? ''} />
            <Campo
              etiqueta="Kilos Procesados (KG)"
              valor={solicitud.kilos_procesados != null ? String(solicitud.kilos_procesados) : ''}
            />
            <Campo etiqueta="Producto Utilizado" valor={solicitud.producto_utilizado ?? ''} />
            <Campo etiqueta="Tipo Muestra" valor={solicitud.tipo_muestra ?? ''} />
            <Campo etiqueta="Fecha Muestreo" valor={solicitud.fecha_muestreo ? formatDateCL(solicitud.fecha_muestreo) : ''} />
            <Campo etiqueta="Hora Muestreo" valor={solicitud.hora_muestreo ?? ''} />
            <Campo etiqueta="Nombre Muestreador" valor={solicitud.nombre_muestreador ?? ''} />
          </dl>
        </Card>

        {analitosSolicitadosConDosis.length > 0 && (
          <Card className={styles.cardAncha}>
            <h2 className={styles.tituloSeccionLab}>
              <IconFrasco className={styles.iconoLab} />
              Analitos solicitados · {solicitud.laboratorio}
            </h2>
            <div className={styles.tablaCaja}>
              <table className={styles.tabla}>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Analito</th>
                    <th>Dosis</th>
                  </tr>
                </thead>
                <tbody>
                  {analitosSolicitadosConDosis.map((a) => (
                    <tr key={a.codigo}>
                      <td className={styles.mono}>{a.codigo}</td>
                      <td>{a.nombre ? `${a.nombre}${a.unidad ? ` (${a.unidad})` : ''}` : '—'}</td>
                      <td>
                        {a.dosisAplicable
                          ? a.dosis
                            ? `Dosis: ${a.dosis}`
                            : 'Dosis: —'
                          : (a.dosis ?? '—')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {camposLab.length > 0 && (
          <Card className={styles.cardAncha}>
            <h2 className={styles.tituloSeccionLab}>
              <IconFrasco className={styles.iconoLab} />
              Análisis de laboratorio · {solicitud.laboratorio}
            </h2>
            <div className={styles.tablaCaja}>
              <table className={styles.tabla}>
                <thead>
                  <tr>
                    <th>Campo</th>
                    <th>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {camposLab.map(([etiqueta, valor]) => (
                    <tr key={etiqueta}>
                      <td>{etiqueta}</td>
                      <td>{valor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <Card className={styles.cardAncha}>
          <h2 className={styles.tituloSeccion}>Observaciones</h2>
          <p className={styles.observacion}>{solicitud.observacion || '—'}</p>
        </Card>
      </div>
    </div>
  )
}
