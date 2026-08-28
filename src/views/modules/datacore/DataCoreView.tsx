import { useCallback, useEffect, useState } from 'react'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { listarTablas, urlExportar, verTabla } from '@/features/auditoria'
import type { InfoTabla, PaginaTabla } from '@/features/auditoria'
import { httpClient } from '@/services/http/client'
import { ErDiagrama } from './ErDiagrama'
import styles from './DataCoreView.module.css'

interface Grupo { campo: string; etiqueta: string; especie?: string | null; valores: string[]; cantidad: number; sugerido: string }
interface Auditoria { grupos: Grupo[]; filas: number; pendientes: number }
interface Decision { campo: string; etiqueta: string; valor_original: string; destino: string; especie?: string | null; filas: number }
interface Historial { decisiones: Decision[] }
type Vista = 'auditoria' | 'cambios' | 'modelo' | 'tabla'
const CAMPOS = { sold_to_raw: 'Sold To', ship_to_raw: 'Ship To', especie: 'Especie', variedad: 'Variedad' }
const TAMANO = 30

export function DataCoreView() {
  const [vista, setVista] = useState<Vista>('auditoria')
  const [data, setData] = useState<Auditoria | null>(null)
  const [destinos, setDestinos] = useState<Record<string, string>>({})
  const [historial, setHistorial] = useState<Decision[]>([])
  const [ediciones, setEdiciones] = useState<Record<string, string>>({})
  const [tablas, setTablas] = useState<InfoTabla[]>([])
  const [tabla, setTabla] = useState('solicitud')
  const [pagina, setPagina] = useState(1)
  const [datosTabla, setDatosTabla] = useState<PaginaTabla | null>(null)
  const [cargando, setCargando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)

  const cargarAuditoria = useCallback(async () => {
    const [auditoria, cambios] = await Promise.all([
      httpClient.get<Auditoria>('/ingest/auditoria-staging'),
      httpClient.get<Historial>('/ingest/auditoria-staging/historial'),
    ])
    setData(auditoria)
    setHistorial(cambios.decisiones)
  }, [])
  useEffect(() => {
    let vigente = true
    void Promise.all([
      httpClient.get<Auditoria>('/ingest/auditoria-staging'),
      httpClient.get<Historial>('/ingest/auditoria-staging/historial'),
      listarTablas(),
    ]).then(([auditoria, cambios, tablasDisponibles]) => {
      if (!vigente) return
      setData(auditoria)
      setHistorial(cambios.decisiones)
      setTablas(tablasDisponibles)
    })
    return () => { vigente = false }
  }, [])
  useEffect(() => {
    if (vista !== 'tabla') return
    void verTabla(tabla, pagina, TAMANO).then(setDatosTabla)
  }, [vista, tabla, pagina])

  async function asignar(grupo: Grupo, indice: number) {
    const clave = `${grupo.campo}-${grupo.especie ?? ''}-${indice}`
    const destino = (destinos[clave] ?? grupo.sugerido).trim()
    if (!destino) return
    setCargando(true)
    try {
      await httpClient.post('/ingest/auditoria-staging/asignar', { campo: grupo.campo, valores: grupo.valores, destino, especie: grupo.especie ?? null })
      setMensaje(`${grupo.etiqueta}${grupo.especie ? ` de ${grupo.especie}` : ''} guardado en Listados como “${destino}”.`)
      await cargarAuditoria()
    } finally { setCargando(false) }
  }

  async function enviarBase() {
    if (!confirm('¿Enviar TODO el Excel homologado a la base de datos? Esta acción insertará los registros y cerrará la copia de trabajo.')) return
    setCargando(true)
    try { const r = await httpClient.post<{ promovidas: number }>('/ingest/auditoria-staging/promover', {}); setMensaje(`${r.promovidas} filas incorporadas a la base. La copia de trabajo quedó cerrada.`); await cargarAuditoria() }
    finally { setCargando(false) }
  }

  async function descartarCopia() {
    if (!confirm('¿Descartar completamente esta copia de trabajo? Las filas del Excel y sus decisiones se eliminarán sin insertarse en la BD.')) return
    setCargando(true)
    try {
      const r = await httpClient.post<{ descartadas: number }>('/ingest/auditoria-staging/descartar', {})
      setMensaje(`Copia descartada: ${r.descartadas} filas eliminadas del área de trabajo.`)
      await cargarAuditoria()
    } finally { setCargando(false) }
  }

  async function aplicarCatalogos() {
    setCargando(true)
    try {
      const r = await httpClient.post<{ aplicadas: number }>('/ingest/auditoria-staging/aplicar-catalogos', {})
      setMensaje(`${r.aplicadas} decisiones consolidadas en Listados. Los registros del Excel todavía NO se enviaron a la BD.`)
    } finally { setCargando(false) }
  }

  async function editarDecision(decision: Decision, indice: number) {
    const clave = `hist-${indice}`
    const destinoNuevo = (ediciones[clave] ?? decision.destino).trim()
    if (!destinoNuevo) return
    setCargando(true)
    try {
      const r = await httpClient.post<{ actualizadas: number }>('/ingest/auditoria-staging/historial/editar', {
        campo: decision.campo,
        valor_original: decision.valor_original,
        destino_actual: decision.destino,
        destino_nuevo: destinoNuevo,
        especie: decision.especie ?? null,
      })
      setMensaje(`Decisión corregida en ${r.actualizadas} fila(s): “${decision.destino}” → “${destinoNuevo}”.`)
      await cargarAuditoria()
    } finally { setCargando(false) }
  }

  return <div>
    <Header title="Data Core" description="Auditoría de homologación, modelo relacional y exploración completa de la base de datos." />
    <Card className={styles.banner}>
      <div><b>{data?.filas ? 'Copia de Ingest activa' : 'Sin copia de trabajo'}</b><span>{data?.filas ? ` ${data.filas.toLocaleString('es-CL')} filas aisladas; todavía no están en la base de datos.` : ' Carga un Excel desde Ingest para comenzar una auditoría.'}</span></div>
      <div className={styles.bannerAcciones}>
        <a className={styles.exportar} href={urlExportar()}>Descargar base en Excel</a>
        {!!data?.filas && <><Button variant="secondary" disabled={cargando} onClick={() => void descartarCopia()}>Descartar copia</Button><Button disabled={cargando} onClick={() => void aplicarCatalogos()}>Aplicar avances a Listados</Button></>}
      </div>
    </Card>
    <nav className={styles.tabs}>
      <button className={vista === 'auditoria' ? styles.tabActiva : ''} onClick={() => setVista('auditoria')}>Auditoría de homologación</button>
      <button className={vista === 'cambios' ? styles.tabActiva : ''} onClick={() => setVista('cambios')}>Cambios aplicados <small>{historial.length}</small></button>
      <button className={vista === 'modelo' ? styles.tabActiva : ''} onClick={() => setVista('modelo')}>Modelo entidad-relación</button>
      <button className={vista === 'tabla' ? styles.tabActiva : ''} onClick={() => setVista('tabla')}>Tabla de datos</button>
    </nav>
    {mensaje && <p className={styles.mensaje}>{mensaje}</p>}

    {vista === 'modelo' && <Card><ErDiagrama /></Card>}
    {vista === 'cambios' && <Card>
      <h2 className={styles.tituloCambios}>Decisiones de homologación</h2>
      <p className={styles.ayudaCambios}>Puedes corregir cualquier decisión antes de enviar el lote a la base de datos.</p>
      {!historial.length ? <p className={styles.vacio}>Todavía no hay cambios manuales aplicados.</p> : <div className={styles.listaCambios}>{historial.map((decision, i) => { const clave = `hist-${i}`; return <div className={styles.cambio} key={`${decision.campo}-${decision.valor_original}-${decision.destino}-${decision.especie ?? ''}`}><div><b>{decision.etiqueta}{decision.especie ? ` · ${decision.especie}` : ''}</b><span>{decision.filas} fila(s)</span><p><code>{decision.valor_original || 'Sin valor'}</code> →</p></div><input aria-label={`Nuevo destino para ${decision.valor_original}`} value={ediciones[clave] ?? decision.destino} onChange={(e) => setEdiciones((actual) => ({ ...actual, [clave]: e.target.value }))} /><Button disabled={cargando} onClick={() => void editarDecision(decision, i)}>Guardar corrección</Button></div> })}</div>}
    </Card>}
    {vista === 'tabla' && <Card>
      <div className={styles.selector}><label>Tabla <select value={tabla} onChange={(e) => { setTabla(e.target.value); setPagina(1) }}>{tablas.map((t) => <option key={t.nombre} value={t.nombre}>{t.nombre} ({t.total.toLocaleString('es-CL')})</option>)}</select></label></div>
      {!datosTabla ? <p>Cargando…</p> : <><div className={styles.tablaScroll}><table className={styles.tabla}><thead><tr>{datosTabla.columnas.map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>{datosTabla.filas.map((fila, i) => <tr key={i}>{datosTabla.columnas.map((c) => <td key={c}>{fila[c] == null ? '—' : String(fila[c])}</td>)}</tr>)}</tbody></table></div>
      <div className={styles.paginacion}><button disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>← Anterior</button><span>Página {pagina} de {Math.max(1, Math.ceil(datosTabla.total / TAMANO))}</span><button disabled={pagina >= Math.ceil(datosTabla.total / TAMANO)} onClick={() => setPagina((p) => p + 1)}>Siguiente →</button></div></>}
    </Card>}
    {vista === 'auditoria' && <>
      <div className={styles.resumen}><span><b>{data?.filas ?? 0}</b> filas en copia de trabajo</span><span><b>{data?.pendientes ?? 0}</b> decisiones pendientes</span><Button disabled={cargando || !data?.filas || data.pendientes > 0} onClick={() => void enviarBase()}>Enviar TODO a la BD</Button></div>
      <div className={styles.columnas}>{Object.entries(CAMPOS).map(([campo, etiqueta]) => { const grupos = data?.grupos.filter((g) => g.campo === campo) ?? []; return <section key={campo}><h2>{etiqueta} <small>{grupos.length}</small></h2>{!grupos.length ? <Card><p className={styles.vacio}>Todo coincide con Listados.</p></Card> : grupos.map((grupo, i) => { const clave = `${campo}-${grupo.especie ?? ''}-${i}`; return <Card key={`${grupo.especie}-${grupo.valores.join('|')}`} className={styles.grupo}>{grupo.especie && <p className={styles.especie}>Especie: {grupo.especie}</p>}<p className={styles.contador}>{grupo.cantidad} fila(s)</p><div className={styles.valores}>{grupo.valores.map((v) => <code key={v}>{v}</code>)}</div><label>Asignar valor oficial<input value={destinos[clave] ?? grupo.sugerido} onChange={(e) => setDestinos((d) => ({ ...d, [clave]: e.target.value }))} /></label><Button disabled={cargando} onClick={() => void asignar(grupo, i)}>Confirmar y guardar en Listados</Button></Card> })}</section> })}</div>
    </>}
  </div>
}
