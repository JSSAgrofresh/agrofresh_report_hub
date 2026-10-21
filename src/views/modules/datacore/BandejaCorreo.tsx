import { Fragment, useEffect, useState } from 'react'
import {
  compararDestinatarios,
  detalleInformeCorreo,
  ETIQUETA_ESTADO,
  hallazgoPrincipal,
  listarBandeja,
  pdfInformeCorreo,
  revisarCorreoAhora,
} from '@/features/correoInformes'
import type { Bandeja, DetalleInformeCorreo, FiltroBandeja, InformeCorreo } from '@/features/correoInformes'
import { fechaHoraCorta } from '@/features/notificaciones'
import styles from './BandejaCorreo.module.css'

const DIAS = [7, 14, 30, 60]

const FILTROS: { clave: FiltroBandeja; etiqueta: string; conteo: keyof Bandeja['conteos'] }[] = [
  { clave: '', etiqueta: 'Todos', conteo: 'todos' },
  { clave: 'rojo', etiqueta: 'Seguimiento', conteo: 'rojo' },
  { clave: 'amarillo', etiqueta: 'Revisar', conteo: 'amarillo' },
  { clave: 'ok', etiqueta: 'Listos', conteo: 'ok' },
  { clave: 'ya_cargado', etiqueta: 'Ya cargados', conteo: 'ya_cargado' },
]

function Detalle({ id }: { id: number }) {
  const [d, setD] = useState<DetalleInformeCorreo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    detalleInformeCorreo(id)
      .then((r) => {
        if (vigente) setD(r)
      })
      .catch((e: unknown) => {
        if (vigente) setError(e instanceof Error ? e.message : 'No se pudo leer el detalle.')
      })
    return () => {
      vigente = false
    }
  }, [id])

  async function verPdf() {
    try {
      const { blob } = await pdfInformeCorreo(id)
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener')
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir el PDF.')
    }
  }

  if (error) return <p className={styles.error}>{error}</p>
  if (!d) return <p className={styles.vacio}>Leyendo detalle…</p>

  const filas = compararDestinatarios(d.esperado, { para: d.para, cc: d.cc, bcc: d.bcc }, d.propios)
  return (
    <div className={styles.detalle}>
      <div className={styles.detalleCol}>
        <h3 className={styles.detalleTitulo}>A quién debía llegar y a quién llegó</h3>
        {filas.length === 0 ? (
          <p className={styles.vacio}>La solicitud no tiene lista del cliente: no hay con qué comparar.</p>
        ) : (
          <ul className={styles.destinatarios}>
            {filas.map((f) => (
              <li
                key={f.correo}
                className={
                  f.tipo === 'esperado'
                    ? styles.destOk
                    : f.tipo === 'falta'
                      ? styles.destFalta
                      : f.interno
                        ? styles.destInterno
                        : styles.destDemas
                }
              >
                <span aria-hidden="true">{f.tipo === 'esperado' ? '✓' : f.tipo === 'falta' ? '!' : '✕'}</span>
                {f.correo}
                <em>
                  {f.tipo === 'esperado' ? 'llegó' : f.tipo === 'falta' ? 'no llegó' : f.interno ? 'copia interna de más' : 'no está en la lista'}
                </em>
              </li>
            ))}
          </ul>
        )}
        <p className={styles.nota}>
          Se mira solo Para y Copia. Llegó: {fechaHoraCorta(d.llegada_en)}
          {d.enviado_en ? ` · enviado: ${fechaHoraCorta(d.enviado_en)}` : ''}.
        </p>
      </div>
      <div className={styles.detalleCol}>
        <h3 className={styles.detalleTitulo}>Qué encontré</h3>
        {d.hallazgos.length === 0 ? (
          <p className={styles.vacio}>Todo calza con su solicitud.</p>
        ) : (
          <ul className={styles.hallazgos}>
            {d.hallazgos.map((h) => (
              <li key={h.codigo} className={styles[`h_${h.nivel}`]}>
                {h.texto}
              </li>
            ))}
          </ul>
        )}
        <p className={styles.nota}>
          {[d.sold_to, d.ship_to, d.especie].filter(Boolean).join(' · ') || 'El informe no trae Sold To / Ship To legibles.'}
        </p>
        {d.tiene_pdf && (
          <button type="button" className={styles.btnSecundario} onClick={() => void verPdf()}>
            Ver el PDF
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Los informes que los laboratorios (y Paz) mandaron al buzón del Report Hub, ya leídos y revisados
 * contra su solicitud. Etapa 1: solo se mira; nada se carga a Report desde acá. Solo la ve el
 * administrador principal.
 */
export function BandejaCorreo({ intervaloMs = 3000 }: { intervaloMs?: number }) {
  const [bandeja, setBandeja] = useState<Bandeja | null>(null)
  const [filtro, setFiltro] = useState<FiltroBandeja>('')
  const [q, setQ] = useState('')
  const [dias, setDias] = useState(14)
  const [abierto, setAbierto] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [revisando, setRevisando] = useState(false)

  useEffect(() => {
    let vigente = true
    listarBandeja(filtro, q)
      .then((b) => {
        if (!vigente) return
        setBandeja(b)
        setError(null)
      })
      .catch((e: unknown) => {
        if (vigente) setError(e instanceof Error ? e.message : 'No se pudo leer el correo de informes.')
      })
    return () => {
      vigente = false
    }
  }, [filtro, q])

  async function revisarAhora() {
    setRevisando(true)
    setMensaje(null)
    setError(null)
    try {
      const { id } = await revisarCorreoAhora(dias)
      // La revisión corre en el servidor (puede tardar minutos): se lee su avance hasta que termine.
      for (let vuelta = 0; vuelta < 400; vuelta++) {
        await new Promise((r) => window.setTimeout(r, intervaloMs))
        const b = await listarBandeja(filtro, q)
        setBandeja(b)
        const s = b.ultimo_sondeo
        if (s && s.id === id && s.terminado_en) {
          if (s.error) setError(s.error)
          else setMensaje(`Listo: ${s.examinados} correos nuevos revisados, ${s.nuevos} informes registrados.`)
          return
        }
      }
      setError('La revisión sigue en curso. Vuelve a mirar en unos minutos.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo revisar el correo.')
    } finally {
      setRevisando(false)
    }
  }

  const ultimo = bandeja?.ultimo_sondeo

  return (
    <section className={styles.bloque} aria-labelledby="bandeja-correo">
      <div className={styles.cabecera}>
        <div>
          <h2 id="bandeja-correo" className={styles.titulo}>
            Correo de informes
          </h2>
          <p className={styles.sub}>
            Lo que llegó al buzón del Report Hub, revisado contra su solicitud y su lista de distribución. Por ahora solo se
            mira: nada se carga a Report desde acá.
          </p>
        </div>
        <div className={styles.acciones}>
          <label className={styles.etiqueta}>
            Últimos
            <select value={dias} onChange={(e) => setDias(Number(e.target.value))} disabled={revisando}>
              {DIAS.map((d) => (
                <option key={d} value={d}>
                  {d} días
                </option>
              ))}
            </select>
          </label>
          <button type="button" className={styles.btnPrimario} onClick={() => void revisarAhora()} disabled={revisando}>
            {revisando ? `Revisando el correo… (${bandeja?.ultimo_sondeo?.nuevos ?? 0} informes hasta ahora)` : 'Revisar ahora'}
          </button>
        </div>
      </div>

      {ultimo && (
        <p className={styles.nota}>
          Última revisión: {fechaHoraCorta(ultimo.terminado_en ?? ultimo.iniciado_en)} · {ultimo.nuevos} informes nuevos
          {ultimo.error ? ` · con error: ${ultimo.error}` : ''}
        </p>
      )}
      {mensaje && <p className={styles.exito}>{mensaje}</p>}
      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.filtros}>
        {FILTROS.map((f) => (
          <button
            key={f.etiqueta}
            type="button"
            className={`${styles.chip} ${filtro === f.clave ? styles.chipActivo : ''} ${f.clave === 'rojo' ? styles.chipRojo : ''}`}
            onClick={() => setFiltro(f.clave)}
          >
            {f.etiqueta} <strong>{bandeja?.conteos[f.conteo] ?? 0}</strong>
          </button>
        ))}
        <input
          type="search"
          className={styles.buscar}
          placeholder="Buscar por informe, OT, planta…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar en el correo de informes"
        />
      </div>

      {bandeja && bandeja.informes.length === 0 ? (
        <p className={styles.vacio}>
          {bandeja.conteos.todos === 0
            ? 'Todavía no hay informes. Aprieta «Revisar ahora» para leer el buzón.'
            : 'Ningún informe coincide con ese filtro.'}
        </p>
      ) : (
        <div className={styles.tablaScroll}>
          <table className={styles.tabla}>
            <thead>
              <tr>
                <th>Llegada</th>
                <th>Informe</th>
                <th>Cliente / planta</th>
                <th>Estado</th>
                <th>Qué pasó</th>
              </tr>
            </thead>
            <tbody>
              {(bandeja?.informes ?? []).map((i: InformeCorreo) => {
                const h = hallazgoPrincipal(i.hallazgos.filter((x) => x.nivel !== 'info'))
                return (
                  <Fragment key={i.id}>
                    <tr
                      className={`${styles.fila} ${abierto === i.id ? styles.filaAbierta : ''}`}
                      onClick={() => setAbierto(abierto === i.id ? null : i.id)}
                    >
                      <td className={styles.nowrap}>{fechaHoraCorta(i.llegada_en)}</td>
                      <td className={styles.celdaInforme}>
                        <strong>{i.nro_informe || 'Sin N° de informe'}</strong>
                        <span className={styles.celdaInformeSub}>{[i.laboratorio, i.ot].filter(Boolean).join(' · ') || 'Sin identificar'}</span>
                      </td>
                      <td>{[i.sold_to, i.ship_to].filter(Boolean).join(' · ') || '—'}</td>
                      <td className={styles.nowrap}>
                        <span className={`${styles.estado} ${styles[`e_${i.estado}`]}`}>{ETIQUETA_ESTADO[i.estado]}</span>
                        {i.ya_cargado && <span className={styles.yaCargado}>Ya cargado</span>}
                      </td>
                      <td className={styles.queHizo}>{h ? h.texto : 'Todo calza con su solicitud.'}</td>
                    </tr>
                    {abierto === i.id && (
                      <tr className={styles.filaDetalle}>
                        <td colSpan={5}>
                          <Detalle id={i.id} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
