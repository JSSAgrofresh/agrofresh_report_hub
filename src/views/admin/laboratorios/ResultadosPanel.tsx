import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { crearContacto, actualizarContacto, eliminarContacto, TIPOS_COPIA } from '@/features/laboratorios'
import type { Contacto, ContactoInput, TipoContacto, TipoCopia } from '@/features/laboratorios'
import { listarPlantas } from '@/features/catalogo'
import type { Planta } from '@/features/catalogo'
import styles from './LaboratoriosView.module.css'

interface ResultadosPanelProps {
  laboratorio: string
  /** Solo contactos resultado_cliente/resultado_interno de este laboratorio. */
  contactos: Contacto[]
  onCambio: (contactos: Contacto[]) => void
  onError: (mensaje: string | null) => void
}

/** El Ship To "" es la configuración previa a este cambio -global, sin Ship
 * To asignado- y sigue funcionando como respaldo para cualquier Ship To que
 * todavía no tenga la suya propia (ver `contactos_de_resultados` en el
 * backend). Se muestra igual, con su propia etiqueta, para que no quede
 * escondida ni se pierda. */
const SHIP_TO_GLOBAL = ''
const ETIQUETA_GLOBAL = 'Sin Ship To (configuración general)'

const VACIO = { nombre: '', email: '', cargo: '' }

const PATRON_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const SECCIONES: { tipo: TipoContacto; titulo: string; nota: string }[] = [
  {
    tipo: 'resultado_cliente',
    titulo: 'Destinatarios del cliente',
    nota: 'El laboratorio envía los resultados de este Ship To a estos correos del cliente.',
  },
  {
    tipo: 'resultado_interno',
    titulo: 'Copias internas AgroFresh',
    nota: 'Correos nuestros que también reciben los resultados de este Ship To, en copia o en copia oculta.',
  },
]

export function ResultadosPanel({ laboratorio, contactos, onCambio, onError }: ResultadosPanelProps) {
  const [shipToActivo, setShipToActivo] = useState<string | null>(null)
  const [plantas, setPlantas] = useState<Planta[]>([])
  const [nuevoShipTo, setNuevoShipTo] = useState('')
  const [creandoEn, setCreandoEn] = useState<TipoContacto | null>(null)
  const [editando, setEditando] = useState<number | null>(null)
  const [borrador, setBorrador] = useState(VACIO)
  const [tipoCopia, setTipoCopia] = useState<TipoCopia>('cc')
  const [guardando, setGuardando] = useState(false)

  // Los Ship To salen del catálogo (Listados → Ship To), no se escriben a
  // mano: así queda el mismo nombre que usan las solicitudes y no se crean
  // configuraciones "huérfanas" por una tilde o un espacio distinto.
  useEffect(() => {
    listarPlantas()
      .then(setPlantas)
      .catch(() => onError('No se pudo cargar el listado de Ship To.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const shipTos = useMemo(() => {
    const vistos = new Set<string>()
    for (const c of contactos) vistos.add((c.ship_to ?? '').trim())
    const lista = [...vistos].filter((s) => s !== SHIP_TO_GLOBAL).sort((a, b) => a.localeCompare(b))
    if (vistos.has(SHIP_TO_GLOBAL)) lista.unshift(SHIP_TO_GLOBAL)
    return lista
  }, [contactos])

  // Solo se ofrecen para "Nuevo Ship To" las plantas activas que todavía no
  // tienen su propia configuración de resultados en este laboratorio.
  const plantasDisponibles = useMemo(
    () =>
      plantas
        .filter((p) => p.activo && !shipTos.includes(p.nombre))
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [plantas, shipTos],
  )

  function contador(shipTo: string) {
    return contactos.filter((c) => (c.ship_to ?? '') === shipTo).length
  }

  function abrirShipTo(shipTo: string) {
    setShipToActivo(shipTo)
    cerrarFormulario()
  }

  function crearShipTo() {
    const valor = nuevoShipTo.trim()
    if (!valor) {
      onError('Elige un Ship To.')
      return
    }
    if (shipTos.includes(valor)) {
      onError('Ese Ship To ya tiene configuración propia.')
      return
    }
    onError(null)
    setNuevoShipTo('')
    setShipToActivo(valor)
  }

  function cerrarFormulario() {
    setCreandoEn(null)
    setEditando(null)
    setBorrador(VACIO)
    setTipoCopia('cc')
  }

  function abrirCreacion(tipo: TipoContacto) {
    setEditando(null)
    setCreandoEn(tipo)
    setBorrador(VACIO)
    setTipoCopia('cc')
    onError(null)
  }

  function abrirEdicion(contacto: Contacto) {
    setCreandoEn(null)
    setEditando(contacto.id)
    setBorrador({ nombre: contacto.nombre, email: contacto.email, cargo: contacto.cargo })
    setTipoCopia(contacto.tipo_copia ?? 'cc')
    onError(null)
  }

  function datosDe(tipo: TipoContacto, shipTo: string, base?: Contacto): ContactoInput {
    return {
      laboratorio,
      nombre: borrador.nombre.trim(),
      email: borrador.email.trim(),
      cargo: borrador.cargo.trim(),
      tipo,
      ship_to: shipTo,
      tipo_copia: tipo === 'resultado_interno' ? tipoCopia : 'cc',
      activo: base?.activo ?? true,
      orden: base?.orden ?? contactos.filter((c) => c.tipo === tipo && (c.ship_to ?? '') === shipTo).length + 1,
    }
  }

  async function guardar(tipo: TipoContacto, shipTo: string, existente?: Contacto) {
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
        const actualizado = await actualizarContacto(existente.id, datosDe(tipo, shipTo, existente))
        onCambio(contactos.map((c) => (c.id === existente.id ? actualizado : c)))
      } else {
        const nuevo = await crearContacto(datosDe(tipo, shipTo))
        onCambio([...contactos, nuevo])
      }
      cerrarFormulario()
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

  function formulario(tipo: TipoContacto, shipTo: string, existente?: Contacto) {
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
          {tipo === 'resultado_interno' && (
            <div className={styles.campo}>
              <label className={styles.etiqueta}>Tipo de copia</label>
              <select
                className={styles.select}
                value={tipoCopia}
                onChange={(e) => setTipoCopia(e.target.value as TipoCopia)}
              >
                {TIPOS_COPIA.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className={styles.formAcciones}>
          <Button variant="secondary" onClick={cerrarFormulario} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={() => guardar(tipo, shipTo, existente)} disabled={guardando}>
            {guardando ? 'Guardando…' : existente ? 'Guardar cambios' : 'Agregar contacto'}
          </Button>
        </div>
      </div>
    )
  }

  // --- Detalle de un Ship To ------------------------------------------------

  if (shipToActivo !== null) {
    const delShipTo = contactos.filter((c) => (c.ship_to ?? '') === shipToActivo)
    return (
      <>
        <div className={styles.seccionCabecera}>
          <div>
            <h3 className={styles.seccionTitulo}>
              {shipToActivo === SHIP_TO_GLOBAL ? ETIQUETA_GLOBAL : shipToActivo}
            </h3>
            <p className={styles.seccionNota}>Configuración de resultados propia de este Ship To.</p>
          </div>
          <Button variant="secondary" onClick={() => setShipToActivo(null)}>
            ← Todos los Ship To
          </Button>
        </div>

        {SECCIONES.map(({ tipo, titulo, nota }) => {
          const delTipo = delShipTo.filter((c) => c.tipo === tipo).sort((a, b) => a.orden - b.orden)
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

              {creandoEn === tipo && formulario(tipo, shipToActivo)}

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
                          {formulario(tipo, shipToActivo, contacto)}
                        </div>
                      ) : (
                        <div key={contacto.id} className={cn(styles.fila, !contacto.activo && styles.filaInactiva)}>
                          <span className={styles.filaAvatar}>{contacto.nombre.slice(0, 2).toUpperCase()}</span>
                          <div className={styles.filaCuerpo}>
                            <div className={styles.filaPrincipal}>
                              {contacto.nombre}
                              {contacto.cargo && <span className={styles.chipUnidad}> · {contacto.cargo}</span>}
                              {tipo === 'resultado_interno' && (
                                <span className={styles.chipUnidad}>
                                  {' '}
                                  · {contacto.tipo_copia === 'bcc' ? 'Copia oculta' : 'Copia'}
                                </span>
                              )}
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

  // --- Grilla de Ship To -----------------------------------------------------

  return (
    <>
      <div className={styles.seccionCabecera}>
        <div>
          <h3 className={styles.seccionTitulo}>Resultado a clientes por Ship To</h3>
          <p className={styles.seccionNota}>
            Cada Ship To tiene su propia lista de destinatarios del cliente y copias internas AgroFresh.
          </p>
        </div>
      </div>

      <div className={styles.grilla}>
        {shipTos.map((shipTo) => (
          <button key={shipTo || '(global)'} className={styles.tarjeta} onClick={() => abrirShipTo(shipTo)}>
            <div className={styles.tarjetaCabecera}>
              <div className={styles.tarjetaTitulos}>
                <p className={styles.tarjetaNombre}>{shipTo === SHIP_TO_GLOBAL ? ETIQUETA_GLOBAL : shipTo}</p>
              </div>
            </div>
            <div className={styles.metricas}>
              <div className={styles.metrica}>
                <span className={styles.metricaValor}>{contador(shipTo)}</span>
                <span className={styles.metricaEtiqueta}>Contactos</span>
              </div>
            </div>
          </button>
        ))}

        <div className={styles.tarjetaNueva} style={{ cursor: 'default' }}>
          <select
            className={styles.select}
            value={nuevoShipTo}
            onChange={(e) => setNuevoShipTo(e.target.value)}
          >
            <option value="">
              {plantasDisponibles.length === 0 ? 'No hay Ship To sin configurar' : 'Elige un Ship To…'}
            </option>
            {plantasDisponibles.map((p) => (
              <option key={p.id} value={p.nombre}>
                {p.nombre} · {p.cliente_nombre}
              </option>
            ))}
          </select>
          <Button variant="secondary" onClick={crearShipTo} disabled={!nuevoShipTo}>
            + Nuevo Ship To
          </Button>
        </div>
      </div>
    </>
  )
}
