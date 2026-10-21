import { useCallback, useState } from 'react'
import {
  aceptarInforme,
  aceptarVarios,
  marcarInformado,
  pdfInformeCorreo,
  rechazarInforme,
  resolverSeguimiento,
} from '@/features/correoInformes'
import { agrupar } from '@/features/correoInformes'
import type { Bloque, InformeCorreo } from '@/features/correoInformes'
import { fechaHoraCorta } from '@/features/notificaciones'
import styles from './ColaDeTrabajo.module.css'

type Accion = { id: number; tipo: 'rechazar' | 'informado' | 'resolver'; nota: string }

interface Props {
  /** Informes pendientes (última copia de cada uno); null mientras se leen. */
  informes: InformeCorreo[] | null
  error: string | null
  /** Qué bloques de trabajo muestra este widget. */
  grupos: Bloque[]
  /** Se hizo algo: hay que releer. */
  onCambio: () => void
  /** Abre el informe completo (esperado contra llegó, homogeneizar) sin salir del tablero. */
  onAbrir: (i: InformeCorreo) => void
  vacio: string
}

function que(i: InformeCorreo): string {
  const h = i.hallazgos.find((x) => x.nivel === 'rojo') ?? i.hallazgos.find((x) => x.nivel === 'amarillo')
  return h ? h.texto : 'Todo calza con su solicitud.'
}

/**
 * Un widget de trabajo: los informes pendientes que caen en ciertos bloques, con los botones en la misma fila
 * (aceptar, rechazar, «ya informé»…) para no tener que abrir cada informe.
 */
export function ColaDeTrabajo({ informes, error, grupos, onCambio, onAbrir, vacio }: Props) {
  const [marcados, setMarcados] = useState<Set<number> | null>(null)
  const [ocupado, setOcupado] = useState<number | 'lote' | null>(null)
  const [accion, setAccion] = useState<Accion | null>(null)
  const [fallas, setFallas] = useState<Record<number, string>>({})
  const [aviso, setAviso] = useState<string | null>(null)

  const g = agrupar(informes ?? [])
  const listos = g.listo
  const homogeneizar = g.homogeneizar
  const seguimiento = g.seguimiento
  const informados = g.informado
  const revisar = g.revisar
  const elegidos = marcados ?? new Set(listos.map((i) => i.id))
  const aElegir = listos.filter((i) => elegidos.has(i.id))
  const lista = grupos.flatMap((k) => g[k])

  const refrescar = useCallback(() => onCambio(), [onCambio])

  function alternar(id: number) {
    const s = new Set(elegidos)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    setMarcados(s)
  }

  async function aceptarLote(ids: number[]) {
    setOcupado('lote')
    setAviso(null)
    try {
      const r = await aceptarVarios(ids)
      setFallas(Object.fromEntries(r.errores.map((e) => [e.id, e.motivo])))
      const cargados = r.aceptados.filter((a) => a.resultado === 'cargado').length
      setAviso(`${r.aceptados.length} aceptado(s)${cargados ? `, ${cargados} cargado(s) a la base` : ''}${r.errores.length ? `; ${r.errores.length} no se pudo(ieron): mira el motivo en su fila` : '.'}`)
      setMarcados(null)
      refrescar()
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo aceptar.')
    } finally {
      setOcupado(null)
    }
  }

  async function aceptarUno(i: InformeCorreo) {
    setOcupado(i.id)
    setAviso(null)
    try {
      const r = await aceptarInforme(i.id)
      setFallas((f) => {
        const { [i.id]: _quitado, ...resto } = f
        void _quitado
        return resto
      })
      setAviso(r.avisos.length ? r.avisos.join(' ') : `Aceptado ${i.nro_informe ?? ''}.`)
      refrescar()
    } catch (e) {
      setFallas((f) => ({ ...f, [i.id]: e instanceof Error ? e.message : 'No se pudo aceptar.' }))
    } finally {
      setOcupado(null)
    }
  }

  async function confirmarAccion() {
    if (!accion || !accion.nota.trim()) return
    setOcupado(accion.id)
    try {
      if (accion.tipo === 'rechazar') await rechazarInforme(accion.id, accion.nota)
      else if (accion.tipo === 'informado') await marcarInformado(accion.id, accion.nota)
      else await resolverSeguimiento(accion.id, accion.nota)
      setAccion(null)
      refrescar()
    } catch (e) {
      setFallas((f) => ({ ...f, [accion.id]: e instanceof Error ? e.message : 'No se pudo guardar.' }))
    } finally {
      setOcupado(null)
    }
  }

  async function verPdf(id: number) {
    try {
      const { blob } = await pdfInformeCorreo(id)
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener')
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      setFallas((f) => ({ ...f, [id]: e instanceof Error ? e.message : 'No se pudo abrir el PDF.' }))
    }
  }

  function fila(i: InformeCorreo, opciones: { marcable?: boolean; aceptar?: string; homogeneizar?: boolean; informar?: boolean; resolver?: boolean }) {
    const abierta = accion?.id === i.id
    const etiquetaNota = accion?.tipo === 'rechazar' ? 'Motivo del rechazo' : accion?.tipo === 'informado' ? 'A quién se avisó / qué se hizo' : 'Cómo se resolvió'
    return (
      <li key={i.id} className={styles.fila}>
        <div className={styles.filaTop}>
          {opciones.marcable && (
            <input type="checkbox" aria-label={`Elegir ${i.nro_informe ?? i.id}`} checked={elegidos.has(i.id)} onChange={() => alternar(i.id)} />
          )}
          <div className={styles.quien}>
            <strong>{i.nro_informe || 'Sin N° de informe'}</strong>
            <span className={styles.sub}>
              {[i.laboratorio, i.ot].filter(Boolean).join(' · ')} · llegó {fechaHoraCorta(i.llegada_en)}
              {i.envios > 1 ? ` · ${i.envios} envíos` : ''}
            </span>
          </div>
          <div className={styles.donde}>
            {[i.sold_to, i.ship_to].filter(Boolean).join(' · ') || '—'}
            <span className={`${styles.que} ${i.estado === 'rojo' ? styles.queRojo : i.estado === 'amarillo' ? styles.queAmarillo : ''}`}>{que(i)}</span>
          </div>
          <div className={styles.botones}>
            {i.ya_cargado && <span className={styles.marca}>Ya cargado</span>}
            {opciones.aceptar && (
              <button type="button" className={styles.btnPrimario} disabled={ocupado !== null} onClick={() => void aceptarUno(i)}>
                {opciones.aceptar}
              </button>
            )}
            {opciones.homogeneizar && (
              <button type="button" className={styles.btnPrimario} disabled={ocupado !== null} onClick={() => onAbrir(i)}>
                Homogeneizar
              </button>
            )}
            {opciones.informar && (
              <button type="button" className={styles.btn} disabled={ocupado !== null} onClick={() => setAccion({ id: i.id, tipo: 'informado', nota: '' })}>
                Ya informé
              </button>
            )}
            {opciones.resolver && (
              <button type="button" className={styles.btn} disabled={ocupado !== null} onClick={() => setAccion({ id: i.id, tipo: 'resolver', nota: '' })}>
                Resolver
              </button>
            )}
            <button type="button" className={styles.btnPeligro} disabled={ocupado !== null} onClick={() => setAccion({ id: i.id, tipo: 'rechazar', nota: '' })}>
              Rechazar
            </button>
            {i.tiene_pdf && (
              <button type="button" className={styles.btnLink} onClick={() => void verPdf(i.id)}>
                PDF
              </button>
            )}
            <button type="button" className={styles.btnLink} onClick={() => onAbrir(i)}>
              Detalle
            </button>
          </div>
        </div>
        {fallas[i.id] && <p className={styles.falla}>{fallas[i.id]}</p>}
        {abierta && accion && (
          <div className={styles.nota}>
            <input
              autoFocus
              value={accion.nota}
              maxLength={1000}
              placeholder={etiquetaNota}
              aria-label={etiquetaNota}
              onChange={(e) => setAccion({ ...accion, nota: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void confirmarAccion()
              }}
            />
            <button type="button" className={styles.btnPrimario} disabled={!accion.nota.trim() || ocupado !== null} onClick={() => void confirmarAccion()}>
              Guardar
            </button>
            <button type="button" className={styles.btn} onClick={() => setAccion(null)}>
              Cancelar
            </button>
          </div>
        )}
      </li>
    )
  }

  function bloque(titulo: string, ayuda: string, tono: string, items: InformeCorreo[], cuerpo: React.ReactNode) {
    if (items.length === 0) return null
    return (
      <section className={`${styles.bloque} ${styles[tono]}`}>
        <header className={styles.bloqueTop}>
          <h3>
            {titulo} <span className={styles.cuenta}>{items.length}</span>
          </h3>
          <p>{ayuda}</p>
        </header>
        {cuerpo}
      </section>
    )
  }

  const nada = informes != null && lista.length === 0

  return (
    <div className={styles.pagina}>
      {error && <p className={styles.falla}>{error}</p>}
      {aviso && (
        <p role="status" className={styles.aviso}>
          {aviso}
        </p>
      )}
      {informes == null && !error && <p className={styles.vacio}>Leyendo la bandeja…</p>}
      {nada && <p className={styles.vacio}>{vacio}</p>}

      {grupos.includes('listo') &&
        bloque(
          'Listos para aceptar',
          'Llegaron a la lista correcta y todo calza con Listados. Desmarca los que no quieras.',
          'verde',
          listos,
          <>
            <div className={styles.barraLote}>
              <button type="button" className={styles.btnGrande} disabled={ocupado !== null || aElegir.length === 0} onClick={() => void aceptarLote(aElegir.map((i) => i.id))}>
                Aceptar {aElegir.length === listos.length ? 'todos' : 'los elegidos'} ({aElegir.length})
              </button>
              <button type="button" className={styles.btnLink} onClick={() => setMarcados(new Set(elegidos.size === listos.length ? [] : listos.map((i) => i.id)))}>
                {elegidos.size === listos.length ? 'Desmarcar todos' : 'Marcar todos'}
              </button>
            </div>
            <ul className={styles.lista}>{listos.map((i) => fila(i, { marcable: true, aceptar: i.ya_cargado ? 'Marcar revisado' : 'Aceptar' }))}</ul>
          </>,
        )}

      {grupos.includes('homogeneizar') &&
        bloque(
          'Por homogeneizar',
          'El envío está bien, pero Sold To, Ship To, especie o variedad no calzan con Listados. Corrígelos y súbelo.',
          'amarillo',
          homogeneizar,
          <ul className={styles.lista}>{homogeneizar.map((i) => fila(i, { homogeneizar: true }))}</ul>,
        )}

      {grupos.includes('seguimiento') &&
        bloque(
          'Salió mal: hay que avisar al laboratorio',
          'El correo llegó a gente que no está en la lista de la solicitud. Avisa al laboratorio y anótalo: no se carga hasta que llegue la copia correcta.',
          'rojo',
          seguimiento,
          <ul className={styles.lista}>{seguimiento.map((i) => fila(i, { informar: true, resolver: true }))}</ul>,
        )}

      {grupos.includes('revisar') &&
        bloque(
          'Envío incompleto o raro',
          'Falta alguien de la lista, hay copias de más o la solicitud no tiene lista. Decide si se acepta o se rechaza.',
          'amarillo',
          revisar,
          <ul className={styles.lista}>{revisar.map((i) => fila(i, { aceptar: 'Aceptar' }))}</ul>,
        )}

      {grupos.includes('informado') &&
        bloque(
          'Ya informados: esperando al laboratorio',
          'No se vuelve a alertar. Cuando llegue la copia correcta se cierra solo; o márcalo como resuelto.',
          'gris',
          informados,
          <ul className={styles.lista}>{informados.map((i) => fila(i, { resolver: true }))}</ul>,
        )}
    </div>
  )
}
