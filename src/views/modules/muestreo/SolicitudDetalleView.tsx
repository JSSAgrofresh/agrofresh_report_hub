import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IconFrasco } from '@/components/ui/icons'
import {
  obtenerSolicitud,
  urlDescargaExcel,
  urlDescargaPdf,
  enviarSolicitudPorCorreo,
  destinatariosDeSolicitud,
} from '@/features/tomaMuestras'
import type { Solicitud } from '@/features/tomaMuestras'
import { ROUTES } from '@/constants/routes'
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

export function SolicitudDetalleView() {
  const { archivo } = useParams<{ archivo: string }>()
  const navigate = useNavigate()
  const [solicitud, setSolicitud] = useState<Solicitud | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mostrarEnvio, setMostrarEnvio] = useState(false)
  const [emailEnvio, setEmailEnvio] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [mensajeEnvio, setMensajeEnvio] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [contactosLab, setContactosLab] = useState<string[] | null>(null)
  const inputEmailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!archivo) return
    obtenerSolicitud(archivo)
      .then(setSolicitud)
      .catch(() => setError('No se pudo cargar la solicitud.'))
  }, [archivo])

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
    // Sin correo escrito se usan los contactos del laboratorio.
    const manual = emailEnvio.trim()
    if (!manual && (contactosLab?.length ?? 0) === 0) return
    setEnviando(true)
    setMensajeEnvio(null)
    try {
      const res = await enviarSolicitudPorCorreo(archivo, manual || undefined)
      setMensajeEnvio({ tipo: 'ok', texto: res.ok })
      setEmailEnvio('')
      setMostrarEnvio(false)
    } catch {
      setMensajeEnvio({ tipo: 'error', texto: 'No se pudo enviar el correo. Verifica la dirección e intenta de nuevo.' })
    } finally {
      setEnviando(false)
    }
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
        title={`Solicitud ${solicitud.numero_solicitud}`}
        description={`${solicitud.laboratorio} · Generada el ${formatDateCL(solicitud.fecha_solicitud)} por ${solicitud.generado_por}`}
        acciones={
          <div className={styles.acciones}>
            <Button variant="secondary" onClick={() => navigate(ROUTES.tomaMuestras)}>
              Volver
            </Button>
            <a className={styles.botonDescarga} href={urlDescargaExcel(solicitud.archivo)} target="_blank" rel="noreferrer">
              Descargar Excel
            </a>
            <a className={styles.botonDescargaPdf} href={urlDescargaPdf(solicitud.archivo)} target="_blank" rel="noreferrer">
              Descargar PDF
            </a>
            <button
              className={styles.botonEnviar}
              onClick={() => { setMostrarEnvio(v => !v); setMensajeEnvio(null) }}
            >
              Enviar por correo
            </button>
          </div>
        }
      />

      {mostrarEnvio && (
        <div className={styles.panelEnvio}>
          <label className={styles.etiquetaEnvio}>
            Enviar PDF y Excel · {solicitud.laboratorio}
          </label>

          {contactosLab === null ? (
            <p className={styles.notaEnvio}>Buscando los contactos del laboratorio…</p>
          ) : contactosLab.length > 0 ? (
            <div className={styles.destinatarios}>
              {contactosLab.map((email) => (
                <span key={email} className={styles.destinatario}>
                  {email}
                </span>
              ))}
            </div>
          ) : (
            <p className={styles.notaEnvioAviso}>
              {solicitud.laboratorio} no tiene contactos de solicitud configurados. Agrégalos en
              Administración → Laboratorios → Contactos, o escribe un correo abajo.
            </p>
          )}

          <div className={styles.filaEnvio}>
            <input
              ref={inputEmailRef}
              type="email"
              className={styles.inputEmail}
              placeholder={
                contactosLab && contactosLab.length > 0
                  ? 'O escribe otro correo para enviar solo a esa dirección…'
                  : 'correo@ejemplo.com'
              }
              value={emailEnvio}
              onChange={e => setEmailEnvio(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleEnviar() }}
              disabled={enviando}
            />
            <button
              className={styles.botonEnviarConfirmar}
              onClick={handleEnviar}
              disabled={enviando || (!emailEnvio.trim() && (contactosLab?.length ?? 0) === 0)}
            >
              {enviando
                ? 'Enviando…'
                : emailEnvio.trim()
                  ? 'Enviar a ese correo'
                  : `Enviar a ${contactosLab?.length ?? 0} contacto${contactosLab?.length === 1 ? '' : 's'}`}
            </button>
            <button
              className={styles.botonCancelar}
              onClick={() => { setMostrarEnvio(false); setMensajeEnvio(null) }}
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
            <Campo etiqueta="Aplicación" valor={solicitud.aplicacion ?? ''} />
            <Campo etiqueta="Especie" valor={solicitud.especie ?? ''} />
            <Campo etiqueta="Variedad" valor={solicitud.variedad ?? ''} />
            <Campo etiqueta="Línea Proceso" valor={solicitud.linea_proceso ?? ''} />
            <Campo etiqueta="CSG" valor={solicitud.csg ?? ''} />
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
