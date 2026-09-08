import { useCallback, useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { aprobarPendiente, descartarPendiente, listarPendientes } from '@/features/ingest'
import type { Pendiente } from '@/features/ingest'
import styles from './DataCoreView.module.css'

/** Columnas del Excel que ayudan a identificar la fila a simple vista, sin
 * mostrar las 69 columnas completas. */
const COLUMNAS_RESUMEN = ['N° Solicitud', 'Sold To', 'Ship To', 'Especie', 'Variedad', 'Fecha Muestreo', 'Laboratorio']

function esSinInforme(p: Pendiente): boolean {
  return p.motivos.some((m) => m.campo === 'nro_solicitud')
}

function resumenFila(fila: Record<string, unknown>): string {
  return COLUMNAS_RESUMEN.map((c) => (fila[c] != null && fila[c] !== '' ? `${c}: ${fila[c]}` : null))
    .filter(Boolean)
    .join(' · ')
}

export function PendientesSinInformePanel() {
  const [pendientes, setPendientes] = useState<Pendiente[] | null>(null)
  const [valores, setValores] = useState<Record<number, string>>({})
  const [cargando, setCargando] = useState<number | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  // El volumen esperado de filas sin N° Informe es bajo -son conflictos que se
  // resuelven a mano-, así que una sola página grande alcanza sin necesidad de
  // paginar todavía.
  const cargar = useCallback(() => listarPendientes(1, 500).then((r) => setPendientes(r.filas.filter(esSinInforme))), [])

  useEffect(() => {
    let vigente = true
    void listarPendientes(1, 500).then((r) => { if (vigente) setPendientes(r.filas.filter(esSinInforme)) })
    return () => { vigente = false }
  }, [])

  async function guardarInforme(p: Pendiente) {
    const nuevo = (valores[p.id] ?? '').trim()
    if (!nuevo) { setMensaje('Escribe un N° Informe antes de guardar.'); return }
    setCargando(p.id)
    try {
      await aprobarPendiente(p.id, { nro_solicitud: nuevo })
      setMensaje(`Fila asignada a N° Informe "${nuevo}" e incorporada a la base de datos.`)
      await cargar()
    } catch (err) {
      setMensaje(err instanceof Error ? err.message : 'No se pudo guardar el N° Informe.')
    } finally {
      setCargando(null)
    }
  }

  async function descartar(p: Pendiente) {
    if (!confirm('¿Descartar esta fila? No se podrá recuperar.')) return
    setCargando(p.id)
    try {
      await descartarPendiente(p.id)
      setMensaje('Fila descartada.')
      await cargar()
    } finally {
      setCargando(null)
    }
  }

  if (pendientes === null) return <Card><p className={styles.vacio}>Cargando…</p></Card>

  return (
    <Card>
      <h2 className={styles.tituloCambios}>Filas sin N° Informe</h2>
      <p className={styles.ayudaCambios}>
        Estas filas traen datos pero no traen N° Informe: no se pueden cargar a la base de datos hasta que se les asigne
        uno o se descarten. Mientras queden filas acá, «Enviar TODO a la BD» permanece bloqueado.
      </p>
      {mensaje && <p className={styles.mensaje}>{mensaje}</p>}
      {!pendientes.length ? (
        <p className={styles.vacio}>No hay filas sin N° Informe pendientes.</p>
      ) : (
        <div className={styles.listaCambios}>
          {pendientes.map((p) => (
            <div className={styles.cambio} key={p.id}>
              <div>
                <b>Fila #{p.id}</b>
                <span>{resumenFila(p.fila)}</span>
              </div>
              <input
                aria-label={`N° Informe para la fila ${p.id}`}
                placeholder="Asignar N° Informe…"
                value={valores[p.id] ?? ''}
                onChange={(e) => setValores((v) => ({ ...v, [p.id]: e.target.value }))}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <Button disabled={cargando === p.id} onClick={() => void guardarInforme(p)}>
                  {cargando === p.id ? 'Guardando…' : 'Guardar y cargar'}
                </Button>
                <Button variant="secondary" disabled={cargando === p.id} onClick={() => void descartar(p)}>
                  Descartar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
