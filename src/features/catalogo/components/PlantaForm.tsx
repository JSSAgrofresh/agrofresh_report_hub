import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { BuscableSelect } from '@/components/ui/BuscableSelect'
import type { Cliente, Planta, PlantaInput } from '../lib/tipos'
import styles from './CatalogoForm.module.css'

interface PlantaFormProps {
  planta?: Planta
  clientes: Cliente[]
  clientePreseleccionado?: Cliente
  onGuardar: (datos: PlantaInput) => void
  onCancelar: () => void
}

export function PlantaForm({ planta, clientes, clientePreseleccionado, onGuardar, onCancelar }: PlantaFormProps) {
  const [clienteNombre, setClienteNombre] = useState(planta?.cliente_nombre ?? clientePreseleccionado?.nombre ?? '')
  const [nombre, setNombre] = useState(planta?.nombre ?? '')
  const [codigoSap, setCodigoSap] = useState(planta?.codigo_sap ?? '')
  const [ciudad, setCiudad] = useState(planta?.ciudad ?? '')
  const [activo, setActivo] = useState(planta?.activo ?? true)
  const [error, setError] = useState<string | null>(null)

  const nombresClientes = useMemo(() => clientes.map((c) => c.nombre).sort(), [clientes])

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const cliente = clientes.find((c) => c.nombre === clienteNombre)
    if (!cliente) {
      setError('Elige el Sold To (cliente) al que pertenece esta sucursal.')
      return
    }
    if (!nombre.trim()) {
      setError('Ingresa el nombre del Ship To.')
      return
    }
    onGuardar({
      cliente_id: cliente.id,
      nombre: nombre.trim(),
      codigo_sap: codigoSap.trim() || null,
      ciudad: ciudad.trim() || null,
      activo,
    })
  }

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <div className={styles.campo}>
        <BuscableSelect
          etiqueta="Sold To (cliente)"
          opciones={nombresClientes}
          valor={clienteNombre}
          onChange={setClienteNombre}
          placeholderTodos="— elegir cliente —"
        />
      </div>

      <label className={styles.campo}>
        <span>Nombre (Ship To)</span>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
      </label>

      <div className={styles.fila}>
        <label className={styles.campo}>
          <span>N° Ship To (SAP)</span>
          <input value={codigoSap} onChange={(e) => setCodigoSap(e.target.value)} placeholder="Opcional" />
        </label>
        <label className={styles.campo}>
          <span>Ciudad</span>
          <input value={ciudad} onChange={(e) => setCiudad(e.target.value)} placeholder="Opcional" />
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
