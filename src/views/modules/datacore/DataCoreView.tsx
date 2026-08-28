import { useCallback, useEffect, useState } from 'react'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { httpClient } from '@/services/http/client'
import styles from './DataCoreView.module.css'

interface Grupo { campo: string; etiqueta: string; valores: string[]; cantidad: number; sugerido: string }
interface Auditoria { grupos: Grupo[]; filas: number; pendientes: number }
const CAMPOS = { sold_to_raw: 'Sold To', ship_to_raw: 'Ship To', especie: 'Especie', variedad: 'Variedad' }

export function DataCoreView() {
  const [data, setData] = useState<Auditoria | null>(null)
  const [destinos, setDestinos] = useState<Record<string, string>>({})
  const [cargando, setCargando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const cargar = useCallback(async () => { setCargando(true); try { setData(await httpClient.get<Auditoria>('/ingest/auditoria-staging')) } finally { setCargando(false) } }, [])
  useEffect(() => { void cargar() }, [cargar])

  async function asignar(grupo: Grupo, indice: number) {
    const clave = `${grupo.campo}-${indice}`
    const destino = (destinos[clave] ?? grupo.sugerido).trim()
    if (!destino) return
    setCargando(true)
    try {
      await httpClient.post('/ingest/auditoria-staging/asignar', { campo: grupo.campo, valores: grupo.valores, destino })
      setMensaje(`${grupo.etiqueta} homologado como “${destino}”.`)
      await cargar()
    } finally { setCargando(false) }
  }

  async function promover() {
    if (!window.confirm('¿Enviar todas las filas revisadas a la base de datos?')) return
    setCargando(true)
    try { const r = await httpClient.post<{ promovidas: number }>('/ingest/auditoria-staging/promover', {}); setMensaje(`${r.promovidas} filas fueron enviadas a la base de datos.`); await cargar() }
    finally { setCargando(false) }
  }

  return <div>
    <Header title="Data Core" description="Auditoría previa de Sold To, Ship To, Especie y Variedad. Ningún Ingest entra a la base sin pasar por aquí." />
    {mensaje && <p className={styles.mensaje}>{mensaje}</p>}
    <div className={styles.resumen}><span><b>{data?.filas ?? 0}</b> filas en staging</span><span><b>{data?.pendientes ?? 0}</b> decisiones pendientes</span><Button disabled={cargando || !data?.filas || data.pendientes > 0} onClick={() => void promover()}>Enviar revisadas a la base</Button></div>
    <div className={styles.columnas}>
      {Object.entries(CAMPOS).map(([campo, etiqueta]) => { const grupos = data?.grupos.filter((g) => g.campo === campo) ?? []; return <section key={campo}>
        <h2>{etiqueta} <small>{grupos.length}</small></h2>
        {!grupos.length ? <Card><p className={styles.vacio}>Sin valores pendientes.</p></Card> : grupos.map((grupo, i) => { const clave = `${campo}-${i}`; return <Card key={grupo.valores.join('|')} className={styles.grupo}>
          <p className={styles.contador}>{grupo.cantidad} fila(s)</p><div className={styles.valores}>{grupo.valores.map((v) => <code key={v}>{v}</code>)}</div>
          <label>Asignar valor oficial<input value={destinos[clave] ?? grupo.sugerido} onChange={(e) => setDestinos((d) => ({ ...d, [clave]: e.target.value }))} /></label>
          <Button disabled={cargando} onClick={() => void asignar(grupo, i)}>Confirmar grupo</Button>
        </Card> })}
      </section> })}
    </div>
  </div>
}
