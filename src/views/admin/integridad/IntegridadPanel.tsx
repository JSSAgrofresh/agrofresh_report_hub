import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import {
  analizarIntegridad,
  descargarExcelIntegridad,
  descargarPdfIntegridad,
  estadoIntegridad,
  hallazgosIntegridad,
  NOMBRE_GRAVEDAD,
  ordenarLaboratorios,
  porcentajeConErrores,
} from '@/features/integridad'
import type { EstadoIntegridad, Gravedad, HallazgoIntegridad, TipoHallazgo } from '@/features/integridad'
import { fechaHora } from '@/lib/fechaHoraChile'
import styles from './IntegridadPanel.module.css'

const nf = new Intl.NumberFormat('es-CL')
const PAGINA = 100
const CLASE_GRAVEDAD: Record<Gravedad, string> = { alto: styles.pAlto, medio: styles.pMedio, info: styles.pInfo }

/**
 * Administración General → Integridad de datos.
 *
 * Compara cada solicitud que salió a un laboratorio con el informe que ese laboratorio devolvió: si el informe existe y llegó a tiempo,
 * si trae los analitos y las dosis pedidos, si repite la rotulación de la muestra y si sus datos coinciden con la solicitud. Resume por
 * laboratorio, lista cada error con su OT e informe y emite el informe de errores (PDF / Excel) para reclamar. Se actualiza con
 * «Analizar ahora» y cada noche. Solo lee: no cambia solicitudes ni informes.
 */
export function IntegridadPanel() {
  const [estado, setEstado] = useState<EstadoIntegridad | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [conPdf, setConPdf] = useState(true)
  const [lanzando, setLanzando] = useState(false)
  const [filtroLab, setFiltroLab] = useState('')
  const [gravedad, setGravedad] = useState<Gravedad | ''>('')
  const [codigo, setCodigo] = useState('')
  const [texto, setTexto] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [lista, setLista] = useState<HallazgoIntegridad[]>([])
  const [tipos, setTipos] = useState<TipoHallazgo[]>([])
  const [total, setTotal] = useState(0)
  const [cargandoLista, setCargandoLista] = useState(false)

  const leerEstado = useCallback(async () => {
    try {
      setEstado(await estadoIntegridad())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el estado.')
    }
  }, [])

  useEffect(() => {
    let vivo = true
    estadoIntegridad()
      .then((e) => { if (vivo) setEstado(e) })
      .catch((e: unknown) => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo leer el estado.') })
    return () => { vivo = false }
  }, [])

  // Mientras hay un análisis corriendo se mira su avance cada pocos segundos.
  const enCurso = !!estado?.en_curso
  useEffect(() => {
    if (!enCurso) return
    const id = setInterval(() => { void leerEstado() }, 4000)
    return () => clearInterval(id)
  }, [enCurso, leerEstado])

  const ultimoId = estado?.ultimo?.id ?? null

  // Cada cambio de filtro (o un análisis nuevo) vuelve a pedir la primera página.
  useEffect(() => {
    if (ultimoId === null) return
    let vivo = true
    hallazgosIntegridad({ laboratorio: filtroLab, gravedad, codigo, q: busqueda, desde: 0, limite: PAGINA })
      .then((r) => { if (vivo) { setLista(r.hallazgos); setTipos(r.tipos); setTotal(r.total) } })
      .catch((e: unknown) => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudieron leer los hallazgos.') })
    return () => { vivo = false }
  }, [ultimoId, filtroLab, gravedad, codigo, busqueda])

  async function verMas() {
    setCargandoLista(true)
    try {
      const r = await hallazgosIntegridad({ laboratorio: filtroLab, gravedad, codigo, q: busqueda, desde: lista.length, limite: PAGINA })
      setLista((prev) => [...prev, ...r.hallazgos])
      setTotal(r.total)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron leer los hallazgos.')
    } finally {
      setCargandoLista(false)
    }
  }

  async function analizar(forzar = false) {
    setLanzando(true)
    setError(null)
    try {
      await analizarIntegridad(conPdf, forzar)
      await leerEstado()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar el análisis.')
    } finally {
      setLanzando(false)
    }
  }

  async function bajar(accion: () => Promise<void>) {
    setError(null)
    try { await accion() } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo descargar.') }
  }

  const ultimo = estado?.ultimo ?? null
  const r = ultimo?.resumen ?? null
  const labs = ordenarLaboratorios(ultimo?.laboratorios ?? [])

  return (
    <div className={styles.panel}>
      <section className={styles.tarjeta} aria-label="Integridad de datos">
        <h2 className={styles.titulo}>Integridad de datos: solicitudes contra informes</h2>
        <p className={styles.texto}>
          Cada solicitud que salió a un laboratorio se compara con su informe: que exista y llegue dentro del plazo, que traiga los analitos y las dosis pedidos,
          que repita la rotulación de la muestra (lote, cámara, orden, posición…) y que Sold To, Ship To, especie y fecha coincidan. Con esto se emite el informe de errores por laboratorio.
        </p>
        <div className={styles.barra}>
          <Button onClick={() => analizar(false)} disabled={lanzando || enCurso}>{enCurso ? 'Analizando…' : 'Analizar ahora'}</Button>
          <label>
            <input type="checkbox" checked={conPdf} onChange={(e) => setConPdf(e.target.checked)} disabled={enCurso} />
            Releer los PDF (más lento, más completo)
          </label>
          {enCurso && <Button variant="secondary" onClick={() => analizar(true)} disabled={lanzando}>Reiniciar (si quedó colgado)</Button>}
          <span className={styles.estado}>
            {ultimo ? `Último análisis: ${fechaHora(ultimo.terminado_en ?? ultimo.iniciado_en)} · ${ultimo.origen === 'nocturno' ? 'automático de la noche' : `manual (${ultimo.usuario ?? '—'})`} · ${ultimo.con_pdf ? 'con lectura de PDF' : 'sin leer PDF'}` : estado?.disponible === false ? '' : 'Aún no hay ningún análisis.'}
          </span>
        </div>
        {estado?.disponible === false && <p className={styles.error} role="alert">Falta correr la migración 0075 en el servidor.</p>}
        {enCurso && <p className={styles.progreso} role="status">En marcha desde {fechaHora(estado!.en_curso!.iniciado_en)}: {estado!.en_curso!.avance ?? 'trabajando…'}</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
        {r && !r.pdf_revisado && <p className={styles.aviso}>Este análisis no releyó los PDF: solo compara lo que quedó guardado en Report. Para detectar lecturas mal hechas, analiza de nuevo con «Releer los PDF».</p>}
        {r && r.pdf_revisado && <p className={styles.aviso}>Los PDF de AgroFresh, Quiteca y Diagnofruit se releen y se comparan. Los de ALS aún no: de ALS se compara lo guardado en Report.</p>}
      </section>

      {r && (
        <>
          <ul className={styles.cifras} aria-label="Resumen">
            <li><b>{nf.format(r.solicitudes_enviadas)}</b><span>Solicitudes enviadas</span></li>
            <li><b>{nf.format(r.con_informe)}</b><span>Con informe</span></li>
            <li className={r.sin_informe ? styles.media : undefined}><b>{nf.format(r.sin_informe)}</b><span>Sin informe ({nf.format(r.atrasadas)} fuera de plazo)</span></li>
            <li><b>{nf.format(r.informes_revisados)}</b><span>Informes revisados</span></li>
            <li className={r.informes_con_problema ? styles.alta : undefined}><b>{nf.format(r.informes_con_problema)}</b><span>Informes con errores</span></li>
            <li className={r.hallazgos_altos ? styles.alta : undefined}><b>{nf.format(r.hallazgos_altos)}</b><span>Errores graves</span></li>
            <li className={r.hallazgos_medios ? styles.media : undefined}><b>{nf.format(r.hallazgos_medios)}</b><span>A revisar</span></li>
          </ul>

          <section className={styles.tarjeta} aria-label="Por laboratorio">
            <h2 className={styles.titulo}>Por laboratorio</h2>
            <div className={styles.envoltura}>
              <table className={styles.tabla}>
                <thead>
                  <tr>
                    <th>Laboratorio</th><th className={styles.num}>Enviadas</th><th className={styles.num}>Con informe</th><th className={styles.num}>Sin informe</th>
                    <th className={styles.num}>Revisados</th><th className={styles.num}>Con errores</th><th className={styles.num}>Graves</th><th className={styles.num}>A revisar</th><th>Informe de errores</th>
                  </tr>
                </thead>
                <tbody>
                  {labs.map((l) => (
                    <tr key={l.laboratorio}>
                      <td className={styles.lab}>{l.laboratorio}</td>
                      <td className={styles.num}>{nf.format(l.enviadas)}</td>
                      <td className={styles.num}>{nf.format(l.con_informe)}</td>
                      <td className={styles.num}>{nf.format(l.sin_informe)}{l.atrasadas ? ` (${l.atrasadas} atrasadas)` : ''}</td>
                      <td className={styles.num}>{nf.format(l.informes_revisados)}</td>
                      <td className={styles.num}>{nf.format(l.informes_con_problema)} · {porcentajeConErrores(l)} %</td>
                      <td className={styles.num}>{nf.format(l.altos)}</td>
                      <td className={styles.num}>{nf.format(l.medios)}</td>
                      <td>
                        <div className={styles.acciones}>
                          <Button variant="secondary" onClick={() => setFiltroLab(l.laboratorio)}>Ver errores</Button>
                          <Button variant="secondary" onClick={() => bajar(() => descargarPdfIntegridad(l.laboratorio))}>PDF</Button>
                          <Button variant="secondary" onClick={() => bajar(() => descargarExcelIntegridad(l.laboratorio))}>Excel</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.tarjeta} aria-label="Errores encontrados">
            <h2 className={styles.titulo}>Errores encontrados ({nf.format(total)})</h2>
            <div className={styles.filtros}>
              <label>Laboratorio
                <select value={filtroLab} onChange={(e) => setFiltroLab(e.target.value)}>
                  <option value="">Todos</option>
                  {labs.map((l) => <option key={l.laboratorio} value={l.laboratorio}>{l.laboratorio}</option>)}
                </select>
              </label>
              <label>Gravedad
                <select value={gravedad} onChange={(e) => setGravedad(e.target.value as Gravedad | '')}>
                  <option value="">Todas</option>
                  <option value="alto">Graves</option>
                  <option value="medio">A revisar</option>
                  <option value="info">Informativos</option>
                </select>
              </label>
              <label>Tipo de error
                <select value={codigo} onChange={(e) => setCodigo(e.target.value)}>
                  <option value="">Todos</option>
                  {tipos.map((t) => <option key={t.codigo} value={t.codigo}>{t.titulo} ({t.casos})</option>)}
                </select>
              </label>
              <label>Buscar (OT, informe, cliente…)
                <input value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') setBusqueda(texto) }} onBlur={() => setBusqueda(texto)} placeholder="OT-QUI0053" />
              </label>
              <Button variant="secondary" onClick={() => bajar(() => descargarExcelIntegridad(filtroLab || undefined))}>Excel de {filtroLab || 'todos'}</Button>
            </div>
            {lista.length === 0 && !cargandoLista ? (
              <p className={styles.vacio}>No hay errores con estos filtros.</p>
            ) : (
              <div className={styles.envoltura}>
                <table className={styles.tabla}>
                  <thead>
                    <tr><th>Gravedad</th><th>Tipo</th><th>Laboratorio</th><th>OT</th><th>Informe</th><th>Cliente / planta</th><th>Especie</th><th>Detalle</th></tr>
                  </thead>
                  <tbody>
                    {lista.map((h, i) => (
                      <tr key={`${h.ot}-${h.informe}-${h.codigo}-${i}`}>
                        <td><span className={`${styles.pildora} ${CLASE_GRAVEDAD[h.gravedad]}`}>{NOMBRE_GRAVEDAD[h.gravedad]}</span></td>
                        <td>{h.titulo}</td>
                        <td>{h.laboratorio}</td>
                        <td>{h.ot ?? '—'}</td>
                        <td>{h.informe ?? '—'}</td>
                        <td>{h.sold_to ?? '—'}<span className={styles.sub}>{h.ship_to ?? ''}</span></td>
                        <td>{h.especie ?? '—'}</td>
                        <td className={styles.detalle}>{h.detalle}{h.sugerencia ? <span className={styles.sub}>{h.sugerencia}</span> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {lista.length < total && <Button variant="secondary" onClick={() => verMas()} disabled={cargandoLista}>{cargandoLista ? 'Cargando…' : `Ver más (${nf.format(total - lista.length)} restantes)`}</Button>}
          </section>
        </>
      )}
    </div>
  )
}
