import { useEffect, useMemo, useState } from 'react'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/features/auth'
import { esAdminGeneral } from '@/features/usuarios'
import {
  eliminarArchivo,
  eliminarCarpeta,
  fechaHora,
  formatoTamano,
  listarCarpeta,
  renombrarArchivo,
  rutaPdfArchivo,
} from '@/features/auditoriaInterna'
import type { ArchivoEntrada, ContenidoCarpeta } from '@/features/auditoriaInterna'
import { httpClient } from '@/services/http/client'
import { descargarArchivo } from '@/services/http/descargar'
import {
  IconoAlerta,
  IconoBuscar,
  IconoCandado,
  IconoCarpeta,
  IconoDescargar,
  IconoInicio,
  IconoLapiz,
  IconoOjo,
  IconoPapelera,
  IconoPdf,
} from './iconos'
import { Modal } from './Modal'
import styles from './CarpetasView.module.css'

type Accion =
  | { tipo: 'borrar-archivo'; archivo: ArchivoEntrada }
  | { tipo: 'borrar-carpeta'; nombre: string; ruta: string }
  | { tipo: 'renombrar'; archivo: ArchivoEntrada }
  | { tipo: 'ver'; archivo: ArchivoEntrada }

/** Visor del PDF dentro de la app. Se baja con el token (un <iframe src> directo
 * respondería 401) y se muestra desde una URL local que se libera al cerrar. */
function VistaPrevia({ archivo }: { archivo: ArchivoEntrada }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    let local: string | null = null
    httpClient
      .getArchivoConNombre(rutaPdfArchivo(archivo.ruta))
      .then(({ blob }) => {
        if (cancelado) return
        local = URL.createObjectURL(blob)
        setUrl(local)
      })
      .catch((e: unknown) => {
        if (!cancelado) setError(e instanceof Error ? e.message : 'No se pudo abrir el PDF.')
      })
    return () => {
      cancelado = true
      if (local) URL.revokeObjectURL(local)
    }
  }, [archivo.ruta])

  if (error) return <p className={styles.errorTexto} role="alert">{error}</p>
  if (!url) return <div className={styles.cargandoVisor}><Skeleton style={{ width: '100%', height: '100%' }} /></div>
  return <iframe className={styles.visor} src={url} title={`Vista previa de ${archivo.nombre}`} />
}

function FormRenombrar({ archivo, onListo, onCerrar }: { archivo: ArchivoEntrada; onListo: () => void; onCerrar: () => void }) {
  const [nombre, setNombre] = useState(archivo.nombre.replace(/\.pdf$/i, ''))
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar() {
    if (!nombre.trim()) return
    setTrabajando(true)
    setError(null)
    try {
      await renombrarArchivo(archivo.ruta, nombre.trim())
      onListo()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo renombrar.')
      setTrabajando(false)
    }
  }

  return (
    <Modal
      titulo="Renombrar informe"
      subtitulo={archivo.nombre}
      onCerrar={onCerrar}
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar} disabled={trabajando}>Cancelar</Button>
          <Button onClick={() => void guardar()} disabled={trabajando || !nombre.trim()}>Renombrar</Button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); void guardar() }} className={styles.formulario}>
        <label>
          <span>Nuevo nombre (se le agrega .pdf)</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={150} />
        </label>
        {error && <p className={styles.errorTexto} role="alert">{error}</p>}
      </form>
    </Modal>
  )
}

function ConfirmarBorrado({
  titulo,
  detalle,
  onConfirmar,
  onCerrar,
}: {
  titulo: string
  detalle: string
  onConfirmar: () => Promise<void>
  onCerrar: () => void
}) {
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <Modal
      titulo={titulo}
      onCerrar={onCerrar}
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar} disabled={trabajando} data-foco>Cancelar</Button>
          <Button
            className={styles.peligro}
            disabled={trabajando}
            onClick={async () => {
              setTrabajando(true)
              try {
                await onConfirmar()
              } catch (e) {
                setError(e instanceof Error ? e.message : 'No se pudo borrar.')
                setTrabajando(false)
              }
            }}
          >
            {trabajando ? 'Borrando…' : 'Borrar'}
          </Button>
        </>
      }
    >
      <p>{detalle}</p>
      <p className={styles.aviso}><IconoAlerta width={16} height={16} /> Esta acción no se puede deshacer.</p>
      {error && <p className={styles.errorTexto} role="alert">{error}</p>}
    </Modal>
  )
}

/**
 * Carpetas de auditoría: los PDF que Converter guarda en el bucket "auditoria"
 * de R2, como <laboratorio>/<ship to>/<archivo>.pdf. Las carpetas nacen con su
 * primer informe. Cualquiera con el módulo mira y descarga; borrar y renombrar
 * es solo del admin general, y la carpeta raíz no se puede borrar.
 */
export function CarpetasView() {
  const { user } = useAuth()
  const puedeEditar = user ? esAdminGeneral(user) : false

  const [ruta, setRuta] = useState('')
  const [contenido, setContenido] = useState<ContenidoCarpeta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [recarga, setRecarga] = useState(0)
  const [filtro, setFiltro] = useState('')
  const [accion, setAccion] = useState<Accion | null>(null)

  useEffect(() => {
    let cancelado = false
    listarCarpeta(ruta)
      .then((c) => {
        if (cancelado) return
        setContenido(c)
        setError(null)
      })
      .catch((e: unknown) => {
        if (cancelado) return
        setContenido(null)
        setError(e instanceof Error ? e.message : 'No se pudo abrir la carpeta.')
      })
      .finally(() => {
        if (!cancelado) setCargando(false)
      })
    return () => {
      cancelado = true
    }
  }, [ruta, recarga])

  function ir(nueva: string) {
    setCargando(true)
    setFiltro('')
    setRuta(nueva)
  }

  function recargar() {
    setAccion(null)
    setCargando(true)
    setRecarga((n) => n + 1)
  }

  const migas = ruta ? ruta.split('/') : []
  const q = filtro.trim().toLowerCase()
  const carpetas = useMemo(() => (contenido?.carpetas ?? []).filter((c) => !q || c.nombre.toLowerCase().includes(q)), [contenido, q])
  const archivos = useMemo(
    () => (contenido?.archivos ?? []).filter((a) => !q || [a.nombre, a.numero_solicitud, a.nro_informe].some((v) => (v ?? '').toLowerCase().includes(q))),
    [contenido, q],
  )
  const vacia = contenido && contenido.carpetas.length === 0 && contenido.archivos.length === 0
  const sinResultados = contenido && !vacia && carpetas.length === 0 && archivos.length === 0

  return (
    <div className={styles.pagina}>
      <Header
        title="Carpetas de auditoría"
        description="Los informes en PDF, ordenados por laboratorio y ship to. Cada carpeta aparece cuando llega su primer informe."
      />

      <div className={styles.barra}>
        <nav className={styles.migas} aria-label="Ruta de la carpeta">
          <button type="button" onClick={() => ir('')} className={!ruta ? styles.migaActiva : ''} aria-current={!ruta ? 'page' : undefined}>
            <IconoInicio width={16} height={16} />
            auditoria
          </button>
          {migas.map((nombre, i) => (
            <span key={i} className={styles.migaGrupo}>
              <span className={styles.migaSeparador} aria-hidden="true">/</span>
              <button
                type="button"
                onClick={() => ir(migas.slice(0, i + 1).join('/'))}
                className={i === migas.length - 1 ? styles.migaActiva : ''}
                aria-current={i === migas.length - 1 ? 'page' : undefined}
              >
                {nombre}
              </button>
            </span>
          ))}
          {!ruta && (
            <span className={styles.protegida} title="La carpeta raíz de auditoría no se puede borrar">
              <IconoCandado width={13} height={13} /> Protegida
            </span>
          )}
        </nav>
        <label className={styles.buscar}>
          <IconoBuscar className={styles.lupa} width={16} height={16} />
          <input type="search" placeholder="Filtrar en esta carpeta…" aria-label="Filtrar en esta carpeta" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        </label>
      </div>

      {error && (
        <div className={styles.errorCaja} role="alert">
          <IconoAlerta />
          <span>{error}</span>
          <Button variant="secondary" onClick={recargar}>Reintentar</Button>
        </div>
      )}

      {cargando && !contenido && !error && (
        <div className={styles.grilla} aria-busy="true">
          {[0, 1, 2].map((i) => <Skeleton key={i} style={{ height: 72, borderRadius: 12 }} />)}
        </div>
      )}

      {contenido && (
        <div className={cargando ? styles.recargando : undefined}>
          {vacia && (
            <div className={styles.vacio}>
              <IconoCarpeta width={30} height={30} />
              <h3>{ruta ? 'Esta carpeta está vacía' : 'Todavía no hay informes guardados'}</h3>
              <p>
                {ruta
                  ? 'No queda ningún informe acá.'
                  : 'Las carpetas se crean solas: cuando se sube el primer informe desde Converter, aparece la del laboratorio y, dentro, la del ship to.'}
              </p>
            </div>
          )}
          {sinResultados && (
            <div className={styles.vacio}>
              <IconoBuscar width={28} height={28} />
              <h3>Nada coincide con «{filtro}»</h3>
              <Button variant="secondary" onClick={() => setFiltro('')}>Quitar el filtro</Button>
            </div>
          )}

          {carpetas.length > 0 && (
            <ul className={styles.grilla}>
              {carpetas.map((c) => (
                <li key={c.ruta} className={styles.carpeta}>
                  <button type="button" className={styles.carpetaBoton} onClick={() => ir(c.ruta)}>
                    <span className={styles.carpetaIcono}><IconoCarpeta width={22} height={22} /></span>
                    <span className={styles.carpetaNombre}>{c.nombre}</span>
                  </button>
                  {puedeEditar && (
                    <button
                      type="button"
                      className={styles.carpetaBorrar}
                      aria-label={`Borrar la carpeta ${c.nombre}`}
                      title="Borrar carpeta"
                      onClick={() => setAccion({ tipo: 'borrar-carpeta', nombre: c.nombre, ruta: c.ruta })}
                    >
                      <IconoPapelera width={16} height={16} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {archivos.length > 0 && (
            <section className={styles.tablaCard} aria-label="Informes de esta carpeta">
              <div className={styles.tablaScroll}>
                <table className={styles.tabla}>
                  <thead>
                    <tr>
                      <th>Informe</th>
                      <th>Solicitud</th>
                      <th>N° informe</th>
                      <th>Enviado</th>
                      <th className={styles.num}>Tamaño</th>
                      <th className={styles.colAcciones}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {archivos.map((a) => (
                      <tr key={a.ruta}>
                        <td>
                          <button type="button" className={styles.nombreArchivo} onClick={() => setAccion({ tipo: 'ver', archivo: a })} title="Ver el PDF">
                            <IconoPdf width={20} height={20} />
                            <span>{a.nombre}</span>
                          </button>
                        </td>
                        <td>{a.numero_solicitud ? <span className={styles.ot}>{a.numero_solicitud}</span> : <span className={styles.tenue}>Sin amarrar</span>}</td>
                        <td className={styles.tenue2}>{a.nro_informe ?? '—'}</td>
                        <td className={styles.fecha}>
                          {a.fecha_envio ? fechaHora(a.fecha_envio) : <span className={styles.faltante}>Sin fecha</span>}
                        </td>
                        <td className={`${styles.num} ${styles.fecha}`}>{formatoTamano(a.tamano_bytes)}</td>
                        <td className={styles.colAcciones}>
                          <span className={styles.acciones}>
                            <button type="button" className={styles.icono} aria-label={`Ver ${a.nombre}`} title="Ver" onClick={() => setAccion({ tipo: 'ver', archivo: a })}><IconoOjo /></button>
                            <button type="button" className={styles.icono} aria-label={`Descargar ${a.nombre}`} title="Descargar" onClick={() => void descargarArchivo(rutaPdfArchivo(a.ruta), a.nombre)}><IconoDescargar /></button>
                            {puedeEditar && (
                              <>
                                <button type="button" className={styles.icono} aria-label={`Renombrar ${a.nombre}`} title="Renombrar" onClick={() => setAccion({ tipo: 'renombrar', archivo: a })}><IconoLapiz /></button>
                                <button type="button" className={`${styles.icono} ${styles.iconoPeligro}`} aria-label={`Borrar ${a.nombre}`} title="Borrar" onClick={() => setAccion({ tipo: 'borrar-archivo', archivo: a })}><IconoPapelera /></button>
                              </>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}

      {accion?.tipo === 'ver' && (
        <Modal titulo={accion.archivo.nombre} subtitulo={accion.archivo.numero_solicitud ? `Solicitud ${accion.archivo.numero_solicitud}` : undefined} ancho="grande" onCerrar={() => setAccion(null)}
          pie={<Button variant="secondary" onClick={() => void descargarArchivo(rutaPdfArchivo(accion.archivo.ruta), accion.archivo.nombre)}><IconoDescargar width={16} height={16} /> Descargar</Button>}
        >
          <VistaPrevia archivo={accion.archivo} />
        </Modal>
      )}
      {accion?.tipo === 'renombrar' && <FormRenombrar archivo={accion.archivo} onListo={recargar} onCerrar={() => setAccion(null)} />}
      {accion?.tipo === 'borrar-archivo' && (
        <ConfirmarBorrado
          titulo="¿Borrar este informe?"
          detalle={`Se borrará «${accion.archivo.nombre}» de la carpeta de auditoría.`}
          onConfirmar={async () => { await eliminarArchivo(accion.archivo.ruta); recargar() }}
          onCerrar={() => setAccion(null)}
        />
      )}
      {accion?.tipo === 'borrar-carpeta' && (
        <ConfirmarBorrado
          titulo={`¿Borrar la carpeta «${accion.nombre}»?`}
          detalle="Se borrarán la carpeta y todos los informes que tiene adentro."
          onConfirmar={async () => { await eliminarCarpeta(accion.ruta); recargar() }}
          onCerrar={() => setAccion(null)}
        />
      )}
    </div>
  )
}
