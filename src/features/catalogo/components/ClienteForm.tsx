import { useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import type { Cliente, ClienteInput } from '../lib/tipos'
import styles from './CatalogoForm.module.css'

interface ClienteFormProps {
  cliente?: Cliente
  onGuardar: (datos: ClienteInput) => void
  onCancelar: () => void
}

export function ClienteForm({ cliente, onGuardar, onCancelar }: ClienteFormProps) {
  const [nombre, setNombre] = useState(cliente?.nombre ?? '')
  const [codigoSap, setCodigoSap] = useState(cliente?.codigo_sap ?? '')
  const [rut, setRut] = useState(cliente?.rut ?? '')
  const [activo, setActivo] = useState(cliente?.activo ?? true)
  const [error, setError] = useState<string | null>(null)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!nombre.trim()) {
      setError('Ingresa el nombre del Sold To.')
      return
    }
    onGuardar({
      nombre: nombre.trim(),
      codigo_sap: codigoSap.trim() || null,
      rut: rut.trim() || null,
      activo,
    })
  }

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <label className={styles.campo}>
        <span>Nombre (Sold To)</span>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
      </label>

      <div className={styles.fila}>
        <label className={styles.campo}>
          <span>N° Sold To (SAP)</span>
          <input value={codigoSap} onChange={(e) => setCodigoSap(e.target.value)} placeholder="Opcional" />
        </label>
        <label className={styles.campo}>
          <span>RUT</span>
          <input value={rut} onChange={(e) => setRut(e.target.value)} placeholder="Opcional" />
        </label>
      </div>

      <label className={styles.campoCheckbox}>
        <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
        <span>Activo</span>
      </label>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.acciones}>
        <Button type="button" variant="secondary" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="submit">Guardar</Button>
      </div>
    </form>
  )
}
