import { useCallback, useEffect, useState } from 'react'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { crearStaging, descartarStaging, estadoStaging, listarTablas, promover, urlExportar, verTabla } from '@/features/auditoria'
import type { EstadoStaging, InfoTabla, PaginaTabla } from '@/features/auditoria'
import { httpClient } from '@/services/http/client'
import { ErDiagrama } from './ErDiagrama'
import styles from './DataCoreView.module.css'

interface Grupo { campo: string; etiqueta: string; especie?: string | null; valores: string[]; cantidad: number; sugerido: string }
interface Auditoria { grupos: Grupo[]; filas: number; pendientes: number }
type Vista = 'auditoria' | 'modelo' | 'tabla'
const CAMPOS = { sold_to_raw: 'Sold To', ship_to_raw: 'Ship To', especie: 'Especie', variedad: 'Variedad' }
const TAMANO = 30

export function DataCoreView() {
  const [vista, setVista] = useState<Vista>('auditoria')
  const [data, setData] = useState<Auditoria | null>(null)
  const [destinos, setDestinos] = useState<Record<string, string>>({})
  const [staging, setStaging] = useState<EstadoStaging | null>(null)
  const [tablas, setTablas] = useState<InfoTabla[]>([])
  const [tabla, setTabla] = useState('solicitud')
  const [pagina, setPagina] = useState(1)
  const [datosTabla, setDatosTabla] = useState<PaginaTabla | null>(null)
  const [cargando, setCargando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)

  const cargarAuditoria = useCallback(async () => setData(await httpClient.get<Auditoria>('/ingest/auditoria-staging')), [])
  useEffect(() => {
    void cargarAuditoria()
    void estadoStaging().then(setStaging)
    void listarTablas().then(setTablas)
  }, [cargarAuditoria])
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
    if (!confirm('¿Enviar las filas auditadas a la base de datos?')) return
    setCargando(true)
    try { const r = await httpClient.post<{ promovidas: number }>('/ingest/auditoria-staging/promover', {}); setMensaje(`${r.promovidas} filas incorporadas a la base.`); await cargarAuditoria() }
    finally { setCargando(false) }
  }

  async function crearCopia() { setCargando(true); try { setStaging(await crearStaging()) } finally { setCargando(false) } }
  async function descartarCopia() { if (!confirm('¿Descartar la copia de trabajo?')) return; setCargando(true); try { setStaging(await descartarStaging()) } finally { setCargando(false) } }
  async function aplicarCopia() { if (!confirm('¿Aplicar esta copia de trabajo a producción?')) return; setCargando(true); try { await promover(); setStaging(await estadoStaging()) } finally { setCargando(false) } }

  return <div>
    <Header title="Data Core" description="Auditoría de homologación, modelo relacional y exploración completa de la base de datos." />
    <Card className={styles.banner}>
      <div><b>{staging?.activo ? 'Copia de trabajo activa' : 'Base en vivo'}</b><span>{staging?.activo ? ' Los cambios manuales permanecen aislados hasta aplicarlos.' : ' Crea una copia para trabajar sin tocar producción.'}</span></div>
      <div className={styles.bannerAcciones}>
        <a className={styles.exportar} href={urlExportar()}>Descargar base en Excel</a>
        {staging?.activo ? <><Button variant="secondary" disabled={cargando} onClick={() => void descartarCopia()}>Descartar copia</Button><Button disabled={cargando} onClick={() => void aplicarCopia()}>Aplicar a producción</Button></> : <Button disabled={cargando} onClick={() => void crearCopia()}>Crear copia de trabajo</Button>}
      </div>
    </Card>
    <nav className={styles.tabs}>
      <button className={vista === 'auditoria' ? styles.tabActiva : ''} onClick={() => setVista('auditoria')}>Auditoría de homologación</button>
      <button className={vista === 'modelo' ? styles.tabActiva : ''} onClick={() => setVista('modelo')}>Modelo entidad-relación</button>
      <button className={vista === 'tabla' ? styles.tabActiva : ''} onClick={() => setVista('tabla')}>Tabla de datos</button>
    </nav>
    {mensaje && <p className={styles.mensaje}>{mensaje}</p>}

    {vista === 'modelo' && <Card><ErDiagrama /></Card>}
    {vista === 'tabla' && <Card>
      <div className={styles.selector}><label>Tabla <select value={tabla} onChange={(e) => { setTabla(e.target.value); setPagina(1) }}>{tablas.map((t) => <option key={t.nombre} value={t.nombre}>{t.nombre} ({t.total.toLocaleString('es-CL')})</option>)}</select></label></div>
      {!datosTabla ? <p>Cargando…</p> : <><div className={styles.tablaScroll}><table className={styles.tabla}><thead><tr>{datosTabla.columnas.map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>{datosTabla.filas.map((fila, i) => <tr key={i}>{datosTabla.columnas.map((c) => <td key={c}>{fila[c] == null ? '—' : String(fila[c])}</td>)}</tr>)}</tbody></table></div>
      <div className={styles.paginacion}><button disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>← Anterior</button><span>Página {pagina} de {Math.max(1, Math.ceil(datosTabla.total / TAMANO))}</span><button disabled={pagina >= Math.ceil(datosTabla.total / TAMANO)} onClick={() => setPagina((p) => p + 1)}>Siguiente →</button></div></>}
    </Card>}
    {vista === 'auditoria' && <>
      <div className={styles.resumen}><span><b>{data?.filas ?? 0}</b> filas en staging</span><span><b>{data?.pendientes ?? 0}</b> decisiones pendientes</span><Button disabled={cargando || !data?.filas || data.pendientes > 0} onClick={() => void enviarBase()}>Enviar revisadas a la base</Button></div>
      <div className={styles.columnas}>{Object.entries(CAMPOS).map(([campo, etiqueta]) => { const grupos = data?.grupos.filter((g) => g.campo === campo) ?? []; return <section key={campo}><h2>{etiqueta} <small>{grupos.length}</small></h2>{!grupos.length ? <Card><p className={styles.vacio}>Todo coincide con Listados.</p></Card> : grupos.map((grupo, i) => { const clave = `${campo}-${grupo.especie ?? ''}-${i}`; return <Card key={`${grupo.especie}-${grupo.valores.join('|')}`} className={styles.grupo}>{grupo.especie && <p className={styles.especie}>Especie: {grupo.especie}</p>}<p className={styles.contador}>{grupo.cantidad} fila(s)</p><div className={styles.valores}>{grupo.valores.map((v) => <code key={v}>{v}</code>)}</div><label>Asignar valor oficial<input value={destinos[clave] ?? grupo.sugerido} onChange={(e) => setDestinos((d) => ({ ...d, [clave]: e.target.value }))} /></label><Button disabled={cargando} onClick={() => void asignar(grupo, i)}>Confirmar y guardar en Listados</Button></Card> })}</section> })}</div>
    </>}
  </div>
}
