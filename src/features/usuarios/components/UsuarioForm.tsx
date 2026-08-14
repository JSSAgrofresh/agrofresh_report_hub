import { useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { LISTA_AREAS } from '@/constants/areas'
import type { AreaId } from '@/constants/areas'
import { CORREO_MAESTRO } from '../api/usuariosStore'
import type { TipoAcceso, Usuario } from '../types'
import styles from './UsuarioForm.module.css'

interface UsuarioFormProps {
  usuario?: Usuario
  onGuardar: (datos: Omit<Usuario, 'id'>) => void
  onCancelar: () => void
}

const TIPOS: { valor: TipoAcceso; etiqueta: string }[] = [
  { valor: 'admin_general', etiqueta: 'Administrador general' },
  { valor: 'admin_area', etiqueta: 'Administrador de área' },
  { valor: 'cliente', etiqueta: 'Cliente' },
]

export function UsuarioForm({ usuario, onGuardar, onCancelar }: UsuarioFormProps) {
  const esMaestro = usuario?.email === CORREO_MAESTRO
  const [nombre, setNombre] = useState(usuario?.nombre ?? '')
  const [email, setEmail] = useState(usuario?.email ?? '')
  const [tipoAcceso, setTipoAcceso] = useState<TipoAcceso>(usuario?.tipoAcceso ?? 'admin_area')
  const [area, setArea] = useState<AreaId | ''>(usuario?.area ?? '')
  const [clienteNombre, setClienteNombre] = useState(usuario?.clienteNombre ?? '')
  const [error, setError] = useState<string | null>(null)

  const requiereArea = tipoAcceso === 'admin_area' || tipoAcceso === 'cliente'
  const requiereCliente = tipoAcceso === 'cliente'

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (requiereArea && !area) {
      setError('Selecciona un área.')
      return
    }
    if (requiereCliente && !clienteNombre.trim()) {
      setError('Ingresa el nombre del cliente.')
      return
    }

    onGuardar({
      nombre: nombre.trim(),
      email: email.trim(),
      tipoAcceso,
      area: requiereArea ? (area as AreaId) : undefined,
      clienteNombre: requiereCliente ? clienteNombre.trim() : undefined,
    })
  }

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <div className={styles.fila}>
        <label className={styles.campo}>
          <span>Nombre</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        </label>
        <label className={styles.campo}>
          <span>Correo</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nombre@agrofresh.com"
            required
          />
        </label>
      </div>

      <label className={styles.campo}>
        <span>Tipo de acceso</span>
        <select
          value={tipoAcceso}
          disabled={esMaestro}
          onChange={(e) => setTipoAcceso(e.target.value as TipoAcceso)}
        >
          {TIPOS.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.etiqueta}
            </option>
          ))}
        </select>
      </label>

      {esMaestro && <p className={styles.nota}>Este es el usuario maestro: su acceso no se puede cambiar.</p>}

      {requiereArea && !esMaestro && (
        <label className={styles.campo}>
          <span>Área</span>
          <select value={area} onChange={(e) => setArea(e.target.value as AreaId)}>
            <option value="">— elegir —</option>
            {LISTA_AREAS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </select>
        </label>
      )}

      {requiereCliente && !esMaestro && (
        <label className={styles.campo}>
          <span>Nombre del cliente</span>
          <input
            value={clienteNombre}
            onChange={(e) => setClienteNombre(e.target.value)}
            placeholder="Empresa o cuenta que verá sus datos"
          />
        </label>
      )}

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
