import { useMemo, useRef, useState } from 'react'
import type { CSSProperties, DragEvent } from 'react'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { areaDeModulo } from '@/constants/areas'
import {
  auditarParaCarga,
  confirmarCarga,
  descargarExcel,
  homogenize,
  leerExcel,
  previsualizarCarga,
  SQL_MAP,
} from '@/features/ingest'
import type { Auditoria, CambioHomogenizacion, FilaIngest, RespuestaCarga } from '@/features/ingest'
import { HttpError } from '@/services/http/client'
import styles from './IngestView.module.css'

const PREVIEW_COLS = [
  'Informe', 'Cliente', 'Sucursal', 'Fecha de muestreo', 'Fecha entrada',
  'CROP', 'TIPO APP', 'Tipo de servicio', 'FDL FINAL', 'IMZ FINAL', 'TEBU FINAL', 'DPA FINAL',
]
const PREVIEW_SQL: Record<string, string> = {
  Informe: 'solicitud.nro_solicitud',
  Cliente: 'cliente.nombre',
  Sucursal: 'planta.nombre',
  'Fecha de muestreo': 'solicitud.fecha_muestreo',
  'Fecha entrada': 'solicitud.fecha_entrada',
  CROP: 'solicitud.especie',
  'TIPO APP': 'producto_aplicado.tipo_aplicacion',
  'Tipo de servicio': 'solicitud.tipo_servicio',
  'FDL FINAL': 'resultado.valor (FDL)',
  'IMZ FINAL': 'resultado.valor (IMZ)',
  'TEBU FINAL': 'resultado.valor (TEBU)',
  'DPA FINAL': 'resultado.valor (DPA)',
}
const CAMPO_REQUERIDO = [
  { col: 'Informe', etiqueta: 'N° de solicitud' },
  { col: 'Cliente', etiqueta: 'Cliente' },
  { col: 'Fecha de muestreo', etiqueta: 'Fecha de muestreo' },
  { col: 'CROP', etiqueta: 'Especie (CROP)' },
]
const TIPO_BADGE: Record<string, { texto: string; tono: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  sol: { texto: 'solicitud', tono: 'neutral' },
  prod: { texto: 'producto_aplicado', tono: 'success' },
  res: { texto: 'resultado', tono: 'warning' },
  skip: { texto: 'ignorar', tono: 'neutral' },
  warn: { texto: 'resultado*', tono: 'danger' },
}

type Tab = 'cambios' | 'preview' | 'mapa'
type Modal = 'ninguno' | 'alertas' | 'confirmar-continuar' | 'confirmar-carga' | 'editar'

export function IngestView() {
  const acento = areaDeModulo('ingest')?.colorPrimario ?? 'var(--color-primary)'
  const wrapStyle = { '--acento': acento } as CSSProperties

  const [filas, setFilas] = useState<FilaIngest[] | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [changes, setChanges] = useState<CambioHomogenizacion[]>([])
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [tab, setTab] = useState<Tab>('cambios')
  const [modal, setModal] = useState<Modal>('ninguno')
  const [auditoria, setAuditoria] = useState<Auditoria | null>(null)
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [toast, setToast] = useState<string | null>(null)
  const [previewBackend, setPreviewBackend] = useState<RespuestaCarga | null>(null)
  const [cargando, setCargando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function mensajeErrorBackend(err: unknown): string {
    if (err instanceof HttpError) {
      return `⚠ El backend respondió con un error (${err.status}). Revisa los datos e inténtalo de nuevo.`
    }
    return '⚠ No se pudo conectar con el backend. Revisa que esté corriendo (ver backend/README.md).'
  }

  function mostrarToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 4200)
  }

  async function procesar(file: File) {
    setError(null)
    setProcesando(true)
    try {
      const { rows, headers: hs } = await leerExcel(file)
      const { out, changes: ch } = homogenize(rows)
      setFilas(out)
      setHeaders(hs)
      setChanges(ch)
      setTab('cambios')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo procesar el archivo.')
    } finally {
      setProcesando(false)
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setArrastrando(false)
    const f = e.dataTransfer.files[0]
    if (f && /\.(xlsx|xls)$/i.test(f.name)) void procesar(f)
    else setError('Por favor sube un archivo .xlsx o .xls')
  }

  const stats = useMemo(() => {
    if (!filas) return null
    const colsChanged = new Set(changes.map((c) => c.col)).size
    const rowsChanged = new Set(changes.map((c) => c.fila)).size
    return {
      total: filas.length,
      cambios: changes.length,
      filasModificadas: rowsChanged,
      columnas: colsChanged,
      campos: SQL_MAP.filter((m) => m.tipo !== 'skip').length,
    }
  }, [filas, changes])

  const gruposCambios = useMemo(() => {
    const porCol = new Map<string, CambioHomogenizacion[]>()
    changes.forEach((c) => {
      const arr = porCol.get(c.col) ?? []
      arr.push(c)
      porCol.set(c.col, arr)
    })
    return [...porCol.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([col, chgs]) => {
        const info = SQL_MAP.find((m) => m.col === col)
        const pares = new Map<string, { orig: unknown; can: unknown; filas: number[] }>()
        chgs.forEach((c) => {
          const k = `${c.orig}|||${c.can}`
          const p = pares.get(k) ?? { orig: c.orig, can: c.can, filas: [] }
          p.filas.push(c.fila)
          pares.set(k, p)
        })
        return { col, sqlLabel: info ? `${info.tabla} → ${info.campo}` : '', campoSql: info?.campo ?? '', pares: [...pares.values()].slice(0, 60), total: chgs.length }
      })
  }, [changes])

  async function abrirCarga() {
    if (!filas) return
    const aud = auditarParaCarga(filas)
    setAuditoria(aud)
    setCargando(true)
    try {
      // Vista previa real contra la base: nunca escribe nada (rollback siempre en el backend),
      // pero muestra con certeza qué se crearía y qué solicitudes ya existen.
      const preview = await previsualizarCarga(filas)
      setPreviewBackend(preview)
      const hayProblemas = aud.duplicados.length > 0 || aud.alertas.length > 0 || preview.advertencias.length > 0
      setModal(hayProblemas ? 'alertas' : 'confirmar-carga')
    } catch (err) {
      setPreviewBackend(null)
      mostrarToast(mensajeErrorBackend(err))
    } finally {
      setCargando(false)
    }
  }

  async function cargarABaseDeDatos() {
    if (!filas) return
    setCargando(true)
    try {
      const resultado = await confirmarCarga(filas)
      setPreviewBackend(resultado)
      const r = resultado.resumen
      const omitidas = r.solicitudes_existentes > 0 ? ` · ${r.solicitudes_existentes} ya existían y se omitieron` : ''
      mostrarToast(
        `✅ Carga completada: ${r.solicitudes_nuevas} solicitud(es) nueva(s) · ${r.clientes_nuevos} cliente(s) nuevo(s) · ${r.plantas_nuevas} planta(s) nueva(s)${omitidas}.`,
      )
    } catch (err) {
      mostrarToast(mensajeErrorBackend(err))
    } finally {
      setCargando(false)
    }
  }

  function abrirEdicion() {
    if (!filas || !auditoria) return
    const filasProblema = new Set([
      ...auditoria.duplicados.flatMap((d) => d.filas),
      ...auditoria.alertas.map((a) => a.fila),
    ])
    const iniciales: Record<string, string> = {}
    filasProblema.forEach((filaExcel) => {
      const idx = filaExcel - 2
      CAMPO_REQUERIDO.forEach(({ col }) => {
        iniciales[`${idx}|${col}`] = String(filas[idx]?.[col] ?? '')
      })
    })
    setEdits(iniciales)
    setModal('editar')
  }

  function guardarEdicion() {
    if (!filas) return
    const copia = filas.map((f) => ({ ...f }))
    Object.entries(edits).forEach(([clave, valor]) => {
      const [idxStr, col] = clave.split('|')
      copia[Number(idxStr)][col] = valor.trim() || null
    })
    const { out, changes: ch } = homogenize(copia)
    setFilas(out)
    setChanges(ch)
    const aud = auditarParaCarga(out)
    setAuditoria(aud)
    setModal('ninguno')
    const total = aud.duplicados.length + aud.alertas.length
    mostrarToast(total === 0 ? '✅ Todo corregido. Ya puedes cargar los datos a la base.' : `Quedan ${total} cosa(s) por revisar.`)
  }

  const filasProblema = auditoria
    ? [...new Set([...auditoria.duplicados.flatMap((d) => d.filas), ...auditoria.alertas.map((a) => a.fila)])].sort((a, b) => a - b)
    : []

  return (
    <div className={styles.wrap} style={wrapStyle}>
      <Header title="Ingest" description="Homogenización y validación de la base de datos antes de cargarla a producción." />

      <div
        className={`${styles.zona} ${arrastrando ? styles.zonaActiva : ''}`}
        onDragOver={(e) => { e.preventDefault(); setArrastrando(true) }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className={styles.inputOculto}
          onChange={(e) => e.target.files?.[0] && void procesar(e.target.files[0])}
        />
        <div className={styles.zonaIcono}>📂</div>
        <h2>{procesando ? 'Procesando…' : 'Arrastra el Excel o haz clic para seleccionarlo'}</h2>
        <p>BASE_DE_DATOS.xlsx · Solo archivos .xlsx / .xls</p>
      </div>

      {error && <p className={styles.error}>⚠ {error}</p>}

      {stats && filas && (
        <>
          <div className={styles.stats}>
            <Card className={styles.statCard}><span className={styles.statNum}>{stats.total.toLocaleString()}</span><span className={styles.statLbl}>Filas procesadas</span></Card>
            <Card className={`${styles.statCard} ${styles.warn}`}><span className={styles.statNum}>{stats.cambios.toLocaleString()}</span><span className={styles.statLbl}>Cambios aplicados</span></Card>
            <Card className={`${styles.statCard} ${styles.warn}`}><span className={styles.statNum}>{stats.filasModificadas.toLocaleString()}</span><span className={styles.statLbl}>Filas modificadas</span></Card>
            <Card className={`${styles.statCard} ${styles.info}`}><span className={styles.statNum}>{stats.columnas}</span><span className={styles.statLbl}>Columnas afectadas</span></Card>
            <Card className={styles.statCard}><span className={styles.statNum}>{stats.campos}</span><span className={styles.statLbl}>Campos mapeados a SQL</span></Card>
          </div>

          <Card className={styles.accionesCard}>
            <div>
              <p className={styles.accionesTitulo}>✅ Homogenización completada</p>
              <small className={styles.accionesSub}>
                {filas.length.toLocaleString()} filas · {changes.length.toLocaleString()} cambios aplicados · {headers.length} columnas
              </small>
            </div>
            <div className={styles.accionesBotones}>
              <Button variant="secondary" onClick={() => descargarExcel(filas, headers)}>⬇ Descargar Excel homogenizado</Button>
              <button className={styles.btnCargar} onClick={() => void abrirCarga()} disabled={cargando}>
                {cargando ? 'Verificando…' : '📤 Cargar a la base de datos'}
              </button>
            </div>
          </Card>

          <div className={styles.tabs}>
            <button className={`${styles.tab} ${tab === 'cambios' ? styles.tabActivo : ''}`} onClick={() => setTab('cambios')}>
              Cambios aplicados <span className={styles.tabBadge}>{changes.length}</span>
            </button>
            <button className={`${styles.tab} ${tab === 'preview' ? styles.tabActivo : ''}`} onClick={() => setTab('preview')}>Vista previa de datos</button>
            <button className={`${styles.tab} ${tab === 'mapa' ? styles.tabActivo : ''}`} onClick={() => setTab('mapa')}>Mapa a tablas SQL</button>
          </div>

          {tab === 'cambios' && (
            gruposCambios.length === 0 ? <p className={styles.vacio}>No se realizaron cambios.</p> :
            gruposCambios.map((g) => (
              <div key={g.col} className={styles.grupoCambios}>
                <div className={styles.grupoTitulo}>
                  {g.col} <span className={styles.grupoSql}>{g.sqlLabel}</span>
                  <span className={styles.grupoTotal}>{g.total} cambios</span>
                </div>
                <div className={styles.cambiosGrid}>
                  <div className={styles.cambiosHead}><div>Valor original</div><div /><div>Valor canónico</div><div>Fila Excel</div><div>Campo SQL</div></div>
                  {g.pares.map((p, i) => {
                    const rowLabel = p.filas.length > 3 ? `${p.filas.slice(0, 3).join(', ')}… (+${p.filas.length - 3})` : p.filas.join(', ')
                    return (
                      <div key={i} className={styles.cambiosRow}>
                        <div className={styles.valOrig}>{String(p.orig ?? 'null')}</div>
                        <div className={styles.flecha}>→</div>
                        <div className={styles.valCan}>{String(p.can ?? 'NULL')}</div>
                        <div className={styles.filaExcel}>{rowLabel}</div>
                        <div className={styles.campoSql}>{g.campoSql}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}

          {tab === 'preview' && (
            <>
              <div className={styles.leyenda}>
                <span><i className={styles.dotCambiado} /> Celda modificada</span>
                <span><i className={styles.dotNd} /> ND (No Detectado)</span>
                <span><i className={styles.dotNull} /> Vacío</span>
              </div>
              <p className={styles.notaPreview}>Mostrando primeras 100 filas con columnas homogenizadas.</p>
              <div className={styles.tablaScroll}>
                <table className={styles.tablaPreview}>
                  <thead>
                    <tr>
                      {PREVIEW_COLS.map((c) => (
                        <th key={c}>{c}<span className={styles.sqlHint}>{PREVIEW_SQL[c]}</span></th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filas.slice(0, 100).map((row, ri) => (
                      <tr key={ri}>
                        {PREVIEW_COLS.map((col) => {
                          const v = row[col]
                          const cambiada = changes.some((c) => c.fila === ri + 2 && c.col === col)
                          const isNd = String(v ?? '') === 'ND'
                          const isNull = v === null || v === undefined
                          const cls = cambiada ? styles.celdaCambiada : isNd ? styles.celdaNd : isNull ? styles.celdaNull : ''
                          return <td key={col} className={cls}>{isNull ? 'NULL' : String(v)}</td>
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === 'mapa' && (
            <div className={styles.tablaScroll}>
              <table className={styles.tablaMapa}>
                <thead><tr><th>#</th><th>Columna Excel</th><th>Tabla SQL</th><th>Campo SQL</th><th>Nota</th></tr></thead>
                <tbody>
                  {SQL_MAP.map((m, i) => (
                    <tr key={m.col}>
                      <td className={styles.indice}>{i + 1}</td>
                      <td className={styles.colExcel}>{m.col}</td>
                      <td><Badge tone={TIPO_BADGE[m.tipo].tono}>{TIPO_BADGE[m.tipo].texto}</Badge></td>
                      <td className={styles.campoSqlMapa}>{m.campo}</td>
                      <td className={styles.notaMapa}>{m.nota}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {modal === 'alertas' && auditoria && (
        <div className={styles.overlay} onClick={() => setModal('ninguno')}>
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <h3>
              {auditoria.duplicados.length + auditoria.alertas.length + (previewBackend?.advertencias.length ?? 0)} cosa(s) para revisar antes de cargar
            </h3>
            <p className={styles.modalSub}>Puedes editar los datos para corregirlas, o continuar de todas formas.</p>
            <ul className={styles.modalLista}>
              {auditoria.duplicados.map((d) => (
                <li key={d.informe} className={styles.itemDup}><b>Solicitud duplicada:</b> N° {d.informe} en las filas {d.filas.join(', ')}</li>
              ))}
              {auditoria.alertas.map((a, i) => (
                <li key={i}><b>Fila {a.fila}:</b> {a.mensaje}</li>
              ))}
              {previewBackend?.advertencias.map((msg, i) => (
                <li key={`backend-${i}`} className={styles.itemDup}><b>Base de datos:</b> {msg}</li>
              ))}
            </ul>
            <div className={styles.modalAcciones}>
              <Button variant="secondary" onClick={() => setModal('ninguno')}>Cancelar</Button>
              <Button variant="secondary" onClick={abrirEdicion}>Editar datos</Button>
              <button className={styles.btnAdvertencia} onClick={() => setModal('confirmar-continuar')}>Continuar de todas formas</button>
            </div>
          </div>
        </div>
      )}

      {modal === 'confirmar-continuar' && auditoria && (
        <div className={styles.overlay} onClick={() => setModal('ninguno')}>
          <div className={styles.modalBoxChica} onClick={(e) => e.stopPropagation()}>
            <h3>¿Seguro que quieres continuar?</h3>
            <p className={styles.modalSub}>
              Vas a cargar los datos con{' '}
              <b>{auditoria.duplicados.length + auditoria.alertas.length + (previewBackend?.advertencias.length ?? 0)}</b>{' '}
              advertencia(s) sin resolver. Las filas con advertencias de la base (duplicadas o inválidas) se omitirán automáticamente; el resto se cargará. Esta acción no se puede deshacer.
            </p>
            <div className={styles.modalAcciones}>
              <Button variant="secondary" onClick={() => setModal('ninguno')}>Cancelar</Button>
              <button className={styles.btnAdvertencia} onClick={() => { setModal('ninguno'); void cargarABaseDeDatos() }} disabled={cargando}>
                {cargando ? 'Cargando…' : 'Sí, continuar de todas formas'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'confirmar-carga' && filas && (
        <div className={styles.overlay} onClick={() => setModal('ninguno')}>
          <div className={styles.modalBoxChica} onClick={(e) => e.stopPropagation()}>
            <h3>Confirmar carga a la base de datos</h3>
            {previewBackend ? (
              <p className={styles.modalSub}>
                Se van a crear <b>{previewBackend.resumen.solicitudes_nuevas}</b> solicitud(es) nueva(s)
                {previewBackend.resumen.clientes_nuevos > 0 && <> · <b>{previewBackend.resumen.clientes_nuevos}</b> cliente(s) nuevo(s)</>}
                {previewBackend.resumen.plantas_nuevas > 0 && <> · <b>{previewBackend.resumen.plantas_nuevas}</b> planta(s) nueva(s)</>}
                , sin inconsistencias detectadas.
              </p>
            ) : (
              <p className={styles.modalSub}>Se van a cargar <b>{filas.length.toLocaleString()}</b> fila(s) validada(s), sin inconsistencias detectadas.</p>
            )}
            <div className={styles.modalAcciones}>
              <Button variant="secondary" onClick={() => setModal('ninguno')}>Cancelar</Button>
              <button className={styles.btnCargar} onClick={() => { setModal('ninguno'); void cargarABaseDeDatos() }} disabled={cargando}>
                {cargando ? 'Cargando…' : 'Confirmar carga'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'editar' && filas && (
        <div className={styles.overlay} onClick={() => setModal('ninguno')}>
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <h3>Corregir inconsistencias</h3>
            <p className={styles.modalSub}>Ajusta los valores marcados y vuelve a validar antes de cargar.</p>
            {filasProblema.map((filaExcel) => {
              const idx = filaExcel - 2
              const motivos = [
                ...(auditoria?.duplicados.filter((d) => d.filas.includes(filaExcel)).map((d) => `Solicitud duplicada (N° ${d.informe})`) ?? []),
                ...(auditoria?.alertas.filter((a) => a.fila === filaExcel).map((a) => a.mensaje) ?? []),
              ]
              return (
                <div key={filaExcel} className={styles.editBloque}>
                  <div className={styles.editFilaTag}>Fila {filaExcel} — {motivos.join(' · ')}</div>
                  {CAMPO_REQUERIDO.map(({ col, etiqueta }) => (
                    <label key={col} className={styles.editRow}>
                      <span>{etiqueta}</span>
                      <input
                        value={edits[`${idx}|${col}`] ?? ''}
                        onChange={(e) => setEdits((prev) => ({ ...prev, [`${idx}|${col}`]: e.target.value }))}
                      />
                    </label>
                  ))}
                </div>
              )
            })}
            <div className={styles.modalAcciones}>
              <Button variant="secondary" onClick={() => setModal('ninguno')}>Cerrar</Button>
              <button className={styles.btnCargar} onClick={guardarEdicion}>Guardar y volver a validar</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  )
}
