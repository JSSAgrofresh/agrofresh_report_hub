import { useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import type { TipoListado, ValorLista, ValorListaInput } from '../lib/tipos'
import styles from './ValorListaForm.module.css'

const ETIQUETA_TIPO: Record<TipoListado, string> = { especie: 'Especie', variedad: 'Variedad' }

interface ValorListaFormProps {
  tipo: TipoListado
  valorExistente?: ValorLista
  onGuardar: (datos: ValorListaInput) => void
  onCancelar: () => void
}

export function ValorListaForm({ tipo, valorExistente, onGuardar, onCancelar }: ValorListaFormProps) {
  const [valor, setValor] = useState(valorExistente?.valor ?? '')
  const [activo, setActivo] = useState(valorExistente?.activo ?? true)
  const [error, setError] = useState<string | null>(null)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!valor.trim()) {
      setError(`Ingresa el valor de ${ETIQUETA_TIPO[tipo]}.`)
      return
    }
    onGuardar({ valor: valor.trim(), activo })
  }

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <label className={styles.campo}>
        <span>{ETIQUETA_TIPO[tipo]}</span>
        <input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ej. Thompson" required />
      </label>

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
