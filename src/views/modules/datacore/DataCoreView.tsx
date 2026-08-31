import { useCallback, useEffect, useState } from 'react'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { descargarExportacion } from '@/features/auditoria'
import { httpClient } from '@/services/http/client'
import { ErDiagrama } from './ErDiagrama'
import { HomogenizarPanel } from './HomogenizarPanel'
import styles from './DataCoreView.module.css'

interface Sugerencia { valor: string; confianza: number }
interface Grupo { campo: string; etiqueta: string; especie?: string | null; valores: string[]; cantidad: number; sugerido: string; sugerencias: Sugerencia[] }
interface Auditoria { grupos: Grupo[]; filas: number; pendientes: number }
interface Decision { campo: string; etiqueta: string; valor_original: string; destino: string; especie?: string | null; filas: number }
interface Historial { decisiones: Decision[] }
type Vista = 'auditoria' | 'cambios' | 'modelo' | 'homogenizar'
const CAMPOS = { sold_to_raw: 'Sold To', ship_to_raw: 'Ship To', especie: 'Especie', variedad: 'Variedad' }

export function DataCoreView() {
  const [vista, setVista] = useState<Vista>('auditoria')
  const [data, setData] = useState<Auditoria | null>(null)
  const [destinos, setDestinos] = useState<Record<string, string>>({})
  const [historial, setHistorial] = useState<Decision[]>([])
  const [ediciones, setEdiciones] = useState<Record<string, string>>({})
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
    ]).then(([auditoria, cambios]) => {
      if (!vigente) return
      setData(auditoria)
      setHistorial(cambios.decisiones)
    })
    return () => { vigente = false }
  }, [])

  async function asignar(grupo: Grupo, indice: number, crearNuevo = false) {
    const clave = `${grupo.campo}-${grupo.especie ?? ''}-${indice}`
    const destino = (destinos[clave] ?? grupo.sugerido).trim()
    if (!destino) return
    setCargando(true)
    try {
      await httpClient.post('/ingest/auditoria-staging/asignar', { campo: grupo.campo, valores: grupo.valores, destino, especie: grupo.especie ?? null, crear_nuevo: crearNuevo })
      setMensaje(crearNuevo ? `“${destino}” se agregó a Listados y quedó confirmado.` : `Valores homologados con “${destino}” de Listados.`)
      await cargarAuditoria()
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : 'No se pudo guardar la homologación.')
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
        <button type="button" className={styles.exportar} onClick={() => void descargarExportacion()}>Descargar base en Excel</button>
        {!!data?.filas && <Button variant="secondary" disabled={cargando} onClick={() => void descartarCopia()}>Descartar copia</Button>}
      </div>
    </Card>
    <nav className={styles.tabs}>
      <button className={vista === 'auditoria' ? styles.tabActiva : ''} onClick={() => setVista('auditoria')}>Auditoría de homologación</button>
      <button className={vista === 'cambios' ? styles.tabActiva : ''} onClick={() => setVista('cambios')}>Cambios aplicados <small>{historial.length}</small></button>
      <button className={vista === 'modelo' ? styles.tabActiva : ''} onClick={() => setVista('modelo')}>Modelo entidad-relación</button>
      <button className={vista === 'homogenizar' ? styles.tabActiva : ''} onClick={() => setVista('homogenizar')}>Homogeneizar datos</button>
    </nav>
    {mensaje && <p className={styles.mensaje}>{mensaje}</p>}

    {vista === 'modelo' && <Card><ErDiagrama /></Card>}
    {vista === 'cambios' && <Card>
      <h2 className={styles.tituloCambios}>Decisiones de homologación</h2>
      <p className={styles.ayudaCambios}>Puedes corregir cualquier decisión antes de enviar el lote a la base de datos.</p>
      {!historial.length ? <p className={styles.vacio}>Todavía no hay cambios manuales aplicados.</p> : <div className={styles.listaCambios}>{historial.map((decision, i) => { const clave = `hist-${i}`; return <div className={styles.cambio} key={`${decision.campo}-${decision.valor_original}-${decision.destino}-${decision.especie ?? ''}`}><div><b>{decision.etiqueta}{decision.especie ? ` · ${decision.especie}` : ''}</b><span>{decision.filas} fila(s)</span><p><code>{decision.valor_original || 'Sin valor'}</code> →</p></div><input aria-label={`Nuevo destino para ${decision.valor_original}`} value={ediciones[clave] ?? decision.destino} onChange={(e) => setEdiciones((actual) => ({ ...actual, [clave]: e.target.value }))} /><Button disabled={cargando} onClick={() => void editarDecision(decision, i)}>Guardar corrección</Button></div> })}</div>}
    </Card>}
    {vista === 'homogenizar' && <HomogenizarPanel />}
    {vista === 'auditoria' && <>
      <div className={styles.resumen}><span><b>{data?.filas ?? 0}</b> filas en copia de trabajo</span><span><b>{data?.pendientes ?? 0}</b> decisiones pendientes</span><Button disabled={cargando || !data?.filas || data.pendientes > 0} onClick={() => void enviarBase()}>Enviar TODO a la BD</Button></div>
      <div className={styles.columnas}>{Object.entries(CAMPOS).map(([campo, etiqueta]) => { const grupos = data?.grupos.filter((g) => g.campo === campo) ?? []; return <section key={campo}><h2>{etiqueta} <small>{grupos.length}</small></h2>{!grupos.length ? <Card><p className={styles.vacio}>Todo coincide con Listados.</p></Card> : grupos.map((grupo, i) => { const clave = `${campo}-${grupo.especie ?? ''}-${i}`; return <Card key={`${grupo.especie}-${grupo.valores.join('|')}`} className={styles.grupo}>{grupo.especie && <p className={styles.especie}>Especie: {grupo.especie}</p>}<p className={styles.contador}>{grupo.cantidad} fila(s)</p><div className={styles.valores}>{grupo.valores.map((v) => <code key={v}>{v}</code>)}</div>{grupo.sugerencias.length > 0 && <div className={styles.sugerencias}>{grupo.sugerencias.map((s) => <button type="button" key={s.valor} onClick={() => setDestinos((d) => ({ ...d, [clave]: s.valor }))}>{s.valor} · {Math.round(s.confianza * 100)}%</button>)}</div>}<label>Valor oficial de Listados<input value={destinos[clave] ?? grupo.sugerido} onChange={(e) => setDestinos((d) => ({ ...d, [clave]: e.target.value }))} /></label><div className={styles.accionesGrupo}><Button disabled={cargando} onClick={() => void asignar(grupo, i)}>Usar valor de Listados</Button><Button variant="secondary" disabled={cargando} onClick={() => { if (confirm(`¿Agregar “${(destinos[clave] ?? grupo.sugerido).trim()}” como valor nuevo oficial?`)) void asignar(grupo, i, true) }}>Agregar como nuevo</Button></div></Card> })}</section> })}</div>
    </>}
  </div>
}
