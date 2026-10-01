import { useId, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import styles from './DialogoAgregarPlanta.module.css'

export interface DatosPlanta {
  sold_to: string
  ship_to: string
  codigo_sold: string | null
  codigo_ship: string | null
}

interface Props {
  clientes: string[]
  /** devuelve un mensaje si la planta ya existe en las listas */
  existe: (soldTo: string, shipTo: string) => string | null
  onAgregar: (datos: DatosPlanta) => void
  onCerrar: () => void
}

/** Agrega una planta que no está: queda como una fila nueva en la tabla, para
 * llenar sus correos, y al guardar se crea también en Listados. */
export function DialogoAgregarPlanta({ clientes, existe, onAgregar, onCerrar }: Props) {
  const idLista = useId()
  const [soldTo, setSoldTo] = useState('')
  const [shipTo, setShipTo] = useState('')
  const [codSold, setCodSold] = useState('')
  const [codShip, setCodShip] = useState('')
  const [error, setError] = useState<string | null>(null)
  const esCliente = clientes.some((c) => c.trim().toLowerCase() === soldTo.trim().toLowerCase())

  function agregar() {
    const s = soldTo.trim()
    const p = shipTo.trim()
    if (!s || !p) return setError('Escribe el Sold To (cliente) y el Ship To (planta).')
    const ya = existe(s, p)
    if (ya) return setError(ya)
    onAgregar({ sold_to: s, ship_to: p, codigo_sold: codSold.trim() || null, codigo_ship: codShip.trim() || null })
  }

  return (
    <Modal
      titulo="Agregar una planta"
      onCerrar={onCerrar}
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={agregar}>Agregar a la tabla</Button>
        </>
      }
    >
      <div className={styles.cuerpo}>
        <p className={styles.nota}>
          Queda como una fila nueva para que le pongas los correos. Al guardar se crea también en <b>Listados</b> (cliente y planta), así
          las solicitudes la encuentran con ese nombre.
        </p>
        <label>
          Sold To (cliente)
          <input list={idLista} value={soldTo} onChange={(e) => { setSoldTo(e.target.value); setError(null) }} placeholder="Ej.: EXPORTADORA AGUA SANTA S.A" autoFocus />
          <datalist id={idLista}>{clientes.map((c) => <option key={c} value={c} />)}</datalist>
          <span className={styles.pista}>
            {soldTo.trim() === '' ? 'Elige uno existente o escribe uno nuevo.' : esCliente ? '✓ Cliente que ya existe en Listados.' : 'Cliente nuevo: se creará en Listados.'}
          </span>
        </label>
        <label>
          Ship To (planta)
          <input value={shipTo} onChange={(e) => { setShipTo(e.target.value); setError(null) }} placeholder="Ej.: AGUA SANTA PLANTA LISONJERA" />
        </label>
        <div className={styles.codigos}>
          <label>
            Código SAP del cliente <i>(opcional)</i>
            <input value={codSold} onChange={(e) => setCodSold(e.target.value)} inputMode="numeric" />
          </label>
          <label>
            Código SAP de la planta <i>(opcional)</i>
            <input value={codShip} onChange={(e) => setCodShip(e.target.value)} inputMode="numeric" />
          </label>
        </div>
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
    </Modal>
  )
}
