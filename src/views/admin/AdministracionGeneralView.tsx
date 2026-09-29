import { useEffect, useMemo, useState } from 'react'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/features/auth'
import { esAdminGeneral } from '@/features/usuarios'
import {
  ETIQUETA_CAMPO,
  ORDEN_CAMPOS,
  filtrarCorrecciones,
  listarCorrecciones,
  olvidarCorreccion,
  resumirCorrecciones,
} from '@/features/correcciones'
import type { CampoCorreccion, CorreccionConverter } from '@/features/correcciones'
import { Indicador } from '@/components/ui/Indicador'
import { IconoActualizar, IconoAlerta, IconoBuscar, IconoCerrar, IconoPapelera } from '@/components/ui/iconosAccion'
import { Modal } from '@/components/ui/Modal'
import { fechaHora } from '@/lib/fechaHoraChile'
import styles from './AdministracionGeneralView.module.css'

const nf = new Intl.NumberFormat('es-CL')

/**
 * Administración General: lo que solo ve y toca el admin general. Por ahora
 * trae el historial de correcciones del Converter: cada vez que alguien elige a
 * mano el valor oficial de un Sold To, Ship To, Especie o Variedad, el sistema
 * lo recuerda y lo aplica solo la próxima vez. Acá se ve qué aprendió, de quién
 * y cuántas veces lo usó, y se olvida lo que haya aprendido mal.
 */
export function AdministracionGeneralView() {
  const { user } = useAuth()
  const puedeEditar = user ? esAdminGeneral(user) : false

  const [datos, setDatos] = useState<CorreccionConverter[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [recarga, setRecarga] = useState(0)
  const [campo, setCampo] = useState<CampoCorreccion | ''>('')
  const [texto, setTexto] = useState('')
  const [aOlvidar, setAOlvidar] = useState<CorreccionConverter | null>(null)
  const [olvidando, setOlvidando] = useState(false)
  const [errorOlvidar, setErrorOlvidar] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    listarCorrecciones()
      .then((l) => {
        if (cancelado) return
        setDatos(l)
        setError(null)
      })
      .catch((e: unknown) => {
        if (!cancelado) setError(e instanceof Error ? e.message : 'No se pudo cargar el historial.')
      })
      .finally(() => {
        if (!cancelado) setCargando(false)
      })
    return () => {
      cancelado = true
    }
  }, [recarga])

  const resumen = useMemo(() => resumirCorrecciones(datos ?? []), [datos])
  const filas = useMemo(() => filtrarCorrecciones(datos ?? [], campo, texto), [datos, campo, texto])

  async function confirmarOlvido() {
    if (!aOlvidar) return
    setOlvidando(true)
    setErrorOlvidar(null)
    try {
      await olvidarCorreccion(aOlvidar.id)
      setDatos((prev) => (prev ?? []).filter((c) => c.id !== aOlvidar.id))
      setAOlvidar(null)
    } catch (e) {
      setErrorOlvidar(e instanceof Error ? e.message : 'No se pudo olvidar.')
    } finally {
      setOlvidando(false)
    }
  }

  return (
    <div className={styles.pagina}>
      <Header
        title="Administración General"
        description="Historial de correcciones del Converter: lo que aprendió cada vez que alguien corrigió a mano un Sold To, Ship To, especie o variedad. Si el mismo texto vuelve a llegar, se corrige solo."
        acciones={
          <Button variant="secondary" onClick={() => { setCargando(true); setRecarga((n) => n + 1) }} disabled={cargando} className={styles.boton}>
            <IconoActualizar width={16} height={16} className={cargando ? styles.girando : undefined} />
            {cargando ? 'Actualizando…' : 'Actualizar'}
          </Button>
        }
      />

      {error && (
        <div className={styles.errorCaja} role="alert">
          <IconoAlerta />
          <span>{error}</span>
          <Button variant="secondary" onClick={() => { setCargando(true); setRecarga((n) => n + 1) }}>Reintentar</Button>
        </div>
      )}

      {!datos && !error && (
        <div className={styles.indicadores} aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className={styles.esqueleto}><Skeleton style={{ width: '50%', height: 14 }} /><Skeleton style={{ width: '30%', height: 30 }} /></div>)}
        </div>
      )}

      {datos && (
        <div className={cargando ? styles.recargando : undefined}>
          <div className={styles.indicadores}>
            <Indicador etiqueta="Asociaciones guardadas" valor={nf.format(resumen.total)} sub="textos que el sistema ya sabe corregir" />
            <Indicador etiqueta="Correcciones automáticas" valor={nf.format(resumen.aplicadasSolas)} sub="veces que el Converter las aplicó solo" />
            <Indicador
              etiqueta="Nunca reutilizadas"
              valor={nf.format(resumen.sinUsar)}
              sub={resumen.sinUsar ? 'aún no han vuelto a aparecer en un informe' : 'todas se han reutilizado'}
            />
          </div>

          <div className={styles.filtros} role="search">
            <div className={styles.segmentado} role="group" aria-label="Filtrar por campo">
              <button type="button" aria-pressed={campo === ''} className={campo === '' ? styles.segActivo : ''} onClick={() => setCampo('')}>
                Todos <span>{nf.format(resumen.total)}</span>
              </button>
              {ORDEN_CAMPOS.map((c) => (
                <button key={c} type="button" aria-pressed={campo === c} className={campo === c ? styles.segActivo : ''} onClick={() => setCampo(campo === c ? '' : c)}>
                  {ETIQUETA_CAMPO[c]} <span>{nf.format(resumen.porCampo[c])}</span>
                </button>
              ))}
            </div>
            <label className={styles.buscar}>
              <IconoBuscar className={styles.lupa} width={16} height={16} />
              <input type="search" placeholder="Buscar texto, cliente, archivo o persona…" aria-label="Buscar" value={texto} onChange={(e) => setTexto(e.target.value)} />
            </label>
            {(campo || texto) && (
              <button type="button" className={styles.limpiar} onClick={() => { setCampo(''); setTexto('') }}>
                <IconoCerrar width={14} height={14} /> Limpiar
              </button>
            )}
          </div>

          {datos.length === 0 ? (
            <div className={styles.vacio}>
              <h3>Aún no hay correcciones guardadas</h3>
              <p>Cuando en el Converter alguien elija a mano el valor oficial de un Sold To, Ship To, especie o variedad, quedará registrado acá.</p>
            </div>
          ) : filas.length === 0 ? (
            <div className={styles.vacio}>
              <h3>Nada coincide con el filtro</h3>
              <Button variant="secondary" onClick={() => { setCampo(''); setTexto('') }}>Limpiar filtros</Button>
            </div>
          ) : (
            <section className={styles.tablaCard} aria-label="Correcciones guardadas">
              <div className={styles.tablaScroll}>
                <table className={styles.tabla}>
                  <thead>
                    <tr>
                      <th>Campo</th>
                      <th>Texto del informe</th>
                      <th>Se corrige a</th>
                      <th>Guardada por</th>
                      <th className={styles.num}>Usos</th>
                      {puedeEditar && <th className={styles.colAcciones}>Acciones</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((c) => (
                      <tr key={c.id}>
                        <td><span className={styles.campo}>{ETIQUETA_CAMPO[c.campo]}</span></td>
                        <td>
                          <span className={styles.crudo}>{c.valor_crudo}</span>
                          {c.contexto && <span className={styles.contexto}>en {c.contexto}</span>}
                        </td>
                        <td>
                          <span className={styles.oficial}>{c.valor_oficial}</span>
                          {c.revisiones > 0 && <span className={styles.contexto}>corregida {c.revisiones} {c.revisiones === 1 ? 'vez' : 'veces'}</span>}
                        </td>
                        <td>
                          <span className={styles.persona}>{c.creado_por_nombre ?? '—'}</span>
                          <span className={styles.contexto}>{fechaHora(c.creado_en)}{c.archivo_origen ? ` · ${c.archivo_origen}` : ''}</span>
                        </td>
                        <td className={styles.num}>
                          <span className={c.usos ? styles.usos : styles.sinUsos}>{nf.format(c.usos)}</span>
                          {c.ultimo_uso && <span className={styles.contexto}>último: {fechaHora(c.ultimo_uso)}</span>}
                        </td>
                        {puedeEditar && (
                          <td className={styles.colAcciones}>
                            <button type="button" className={styles.olvidar} aria-label={`Olvidar la asociación de ${c.valor_crudo}`} title="Olvidar esta asociación" onClick={() => { setErrorOlvidar(null); setAOlvidar(c) }}>
                              <IconoPapelera width={16} height={16} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}

      {aOlvidar && (
        <Modal
          titulo="¿Olvidar esta asociación?"
          onCerrar={() => setAOlvidar(null)}
          pie={
            <>
              <Button variant="ghost" onClick={() => setAOlvidar(null)} disabled={olvidando} data-foco>Cancelar</Button>
              <Button className={styles.peligro} onClick={() => void confirmarOlvido()} disabled={olvidando}>{olvidando ? 'Olvidando…' : 'Olvidar'}</Button>
            </>
          }
        >
          <p>
            «<b>{aOlvidar.valor_crudo}</b>» dejará de corregirse solo a «<b>{aOlvidar.valor_oficial}</b>». La próxima vez que llegue ese texto, el Converter volverá a pedir que se elija a mano.
          </p>
          <p>Los informes que ya se cargaron no cambian.</p>
          {errorOlvidar && <p className={styles.errorTexto} role="alert">{errorOlvidar}</p>}
        </Modal>
      )}
    </div>
  )
}
