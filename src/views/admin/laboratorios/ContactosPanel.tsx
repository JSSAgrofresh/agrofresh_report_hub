import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { crearContacto, actualizarContacto, eliminarContacto } from '@/features/laboratorios'
import type { Contacto, ContactoInput, TipoContacto } from '@/features/laboratorios'
import styles from './LaboratoriosView.module.css'

interface ContactosPanelProps {
  laboratorio: string
  contactos: Contacto[]
  /** Los tipos que muestra este panel: la pestaña Contactos muestra solo
   * `solicitud`; la pestaña Resultados muestra los dos tipos de resultado,
   * cada uno en su propia sección. */
  secciones: { tipo: TipoContacto; titulo: string; nota: string }[]
  onCambio: (contactos: Contacto[]) => void
  onError: (mensaje: string | null) => void
}

const VACIO = { nombre: '', email: '', cargo: '' }

/** Un correo válido a ojos del usuario: algo@algo.algo. La validación real la
 * hace el servidor de correo al enviar; esto solo evita el error de dedo. */
const PATRON_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function ContactosPanel({ laboratorio, contactos, secciones, onCambio, onError }: ContactosPanelProps) {
  const [creandoEn, setCreandoEn] = useState<TipoContacto | null>(null)
  const [editando, setEditando] = useState<number | null>(null)
  const [borrador, setBorrador] = useState(VACIO)
  const [guardando, setGuardando] = useState(false)

  function abrirCreacion(tipo: TipoContacto) {
    setEditando(null)
    setCreandoEn(tipo)
    setBorrador(VACIO)
    onError(null)
  }

  function abrirEdicion(contacto: Contacto) {
    setCreandoEn(null)
    setEditando(contacto.id)
    setBorrador({ nombre: contacto.nombre, email: contacto.email, cargo: contacto.cargo })
    onError(null)
  }

  function cerrar() {
    setCreandoEn(null)
    setEditando(null)
    setBorrador(VACIO)
  }

  function datosDe(tipo: TipoContacto, base?: Contacto): ContactoInput {
    return {
      laboratorio,
      nombre: borrador.nombre.trim(),
      email: borrador.email.trim(),
      cargo: borrador.cargo.trim(),
      tipo,
      activo: base?.activo ?? true,
      orden: base?.orden ?? contactos.filter((c) => c.tipo === tipo).length + 1,
    }
  }

  async function guardar(tipo: TipoContacto, existente?: Contacto) {
    if (!borrador.nombre.trim() || !borrador.email.trim()) {
      onError('El nombre y el correo son obligatorios.')
      return
    }
    if (!PATRON_EMAIL.test(borrador.email.trim())) {
      onError('Ese correo no parece válido.')
      return
    }
    setGuardando(true)
    onError(null)
    try {
      if (existente) {
        const actualizado = await actualizarContacto(existente.id, datosDe(tipo, existente))
        onCambio(contactos.map((c) => (c.id === existente.id ? actualizado : c)))
      } else {
        const nuevo = await crearContacto(datosDe(tipo))
        onCambio([...contactos, nuevo])
      }
      cerrar()
    } catch {
      onError('No se pudo guardar el contacto.')
    } finally {
      setGuardando(false)
    }
  }

  async function alternarActivo(contacto: Contacto) {
    onError(null)
    try {
      const { id, ...datos } = contacto
      const actualizado = await actualizarContacto(id, { ...datos, activo: !contacto.activo })
      onCambio(contactos.map((c) => (c.id === id ? actualizado : c)))
    } catch {
      onError('No se pudo cambiar el estado del contacto.')
    }
  }

  async function borrar(contacto: Contacto) {
    if (!window.confirm(`¿Eliminar a ${contacto.nombre} (${contacto.email})?`)) return
    onError(null)
    try {
      await eliminarContacto(contacto.id)
      onCambio(contactos.filter((c) => c.id !== contacto.id))
    } catch {
      onError('No se pudo eliminar el contacto.')
    }
  }

  function formulario(tipo: TipoContacto, existente?: Contacto) {
    return (
      <div className={styles.formulario}>
        <div className={styles.formGrilla}>
          <div className={styles.campo}>
            <label className={styles.etiqueta}>Nombre</label>
            <input
              className={styles.input}
              value={borrador.nombre}
              autoFocus
              placeholder="Ana Pinto"
              onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })}
            />
          </div>
          <div className={styles.campo}>
            <label className={styles.etiqueta}>Correo</label>
            <input
              className={styles.input}
              type="email"
              value={borrador.email}
              placeholder="ana@laboratorio.cl"
              onChange={(e) => setBorrador({ ...borrador, email: e.target.value })}
            />
          </div>
          <div className={styles.campo}>
            <label className={styles.etiqueta}>Cargo (opcional)</label>
            <input
              className={styles.input}
              value={borrador.cargo}
              placeholder="Jefa de laboratorio"
              onChange={(e) => setBorrador({ ...borrador, cargo: e.target.value })}
            />
          </div>
        </div>
        <div className={styles.formAcciones}>
          <Button variant="secondary" onClick={cerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={() => guardar(tipo, existente)} disabled={guardando}>
            {guardando ? 'Guardando…' : existente ? 'Guardar cambios' : 'Agregar contacto'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <>
      {secciones.map(({ tipo, titulo, nota }) => {
        const delTipo = contactos.filter((c) => c.tipo === tipo).sort((a, b) => a.orden - b.orden)
        return (
          <section key={tipo} className={styles.seccion}>
            <div className={styles.seccionCabecera}>
              <div>
                <h3 className={styles.seccionTitulo}>{titulo}</h3>
                <p className={styles.seccionNota}>{nota}</p>
              </div>
              <Button variant="secondary" onClick={() => abrirCreacion(tipo)}>
                Agregar
              </Button>
            </div>

            {creandoEn === tipo && formulario(tipo)}

            {delTipo.length === 0 && creandoEn !== tipo ? (
              <div className={styles.vacio}>
                <span className={styles.vacioTitulo}>Sin contactos</span>
                <span className={styles.vacioNota}>Agrega el primer correo para esta lista.</span>
              </div>
            ) : (
              delTipo.length > 0 && (
                <div className={styles.filas}>
                  {delTipo.map((contacto) =>
                    editando === contacto.id ? (
                      <div key={contacto.id} style={{ padding: 'var(--space-3)' }}>
                        {formulario(tipo, contacto)}
                      </div>
                    ) : (
                      <div key={contacto.id} className={cn(styles.fila, !contacto.activo && styles.filaInactiva)}>
                        <span className={styles.filaAvatar}>{contacto.nombre.slice(0, 2).toUpperCase()}</span>
                        <div className={styles.filaCuerpo}>
                          <div className={styles.filaPrincipal}>
                            {contacto.nombre}
                            {contacto.cargo && <span className={styles.chipUnidad}> · {contacto.cargo}</span>}
                          </div>
                          <div className={styles.filaSecundario}>{contacto.email}</div>
                        </div>
                        {!contacto.activo && <span className={cn(styles.insignia, styles.insigniaInactivo)}>Inactivo</span>}
                        <div className={styles.filaAcciones}>
                          <button
                            className={styles.iconoBoton}
                            title={contacto.activo ? 'Desactivar' : 'Activar'}
                            onClick={() => alternarActivo(contacto)}
                          >
                            {contacto.activo ? '◉' : '○'}
                          </button>
                          <button className={styles.iconoBoton} title="Editar" onClick={() => abrirEdicion(contacto)}>
                            ✎
                          </button>
                          <button
                            className={cn(styles.iconoBoton, styles.iconoBotonPeligro)}
                            title="Eliminar"
                            onClick={() => borrar(contacto)}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ),
                  )}
                </div>
              )
            )}
          </section>
        )
      })}
    </>
  )
}
