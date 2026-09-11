import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { crearContacto, actualizarContacto, eliminarContacto, TIPOS_COPIA } from '@/features/laboratorios'
import type { Contacto, ContactoInput, TipoContacto, TipoCopia } from '@/features/laboratorios'
import { listarClientes, listarPlantas } from '@/features/catalogo'
import type { Cliente, Planta } from '@/features/catalogo'
import { listarEspeciesActivas } from '@/features/listados'
import type { ValorLista } from '@/features/listados'
import styles from './LaboratoriosView.module.css'

interface ResultadosPanelProps {
  laboratorio: string
  /** Todos los contactos resultado_cliente/resultado_interno (de cualquier lab). */
  contactos: Contacto[]
  onCambio: (contactos: Contacto[]) => void
  onError: (mensaje: string | null) => void
}

/** Clave canónica de un grupo (sold_to, ship_to, especie). */
function claveGrupo(sold_to: string, ship_to: string, especie: string) {
  return `${(sold_to || '').trim()}|||${(ship_to || '').trim()}|||${(especie || '').trim()}`
}

const GLOBAL_CLAVE = claveGrupo('', '', '')
const GLOBAL_ETIQUETA = 'Configuración general (respaldo)'

const VACIO = { nombre: '', email: '', cargo: '' }
const PATRON_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const SECCIONES: { tipo: TipoContacto; titulo: string; nota: string }[] = [
  {
    tipo: 'resultado_cliente',
    titulo: 'Destinatarios del cliente',
    nota: 'Correos del cliente (van como destinatario directo en el mail de resultados).',
  },
  {
    tipo: 'resultado_interno',
    titulo: 'Copias internas AgroFresh',
    nota: 'Correos AgroFresh que reciben copia (comerciales, técnico, etc.).',
  },
]

export function ResultadosPanel({ laboratorio, contactos, onCambio, onError }: ResultadosPanelProps) {
  const [grupoActivo, setGrupoActivo] = useState<string | null>(null)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [plantas, setPlantas] = useState<Planta[]>([])
  const [especies, setEspecies] = useState<ValorLista[]>([])
  const [nuevoSoldTo, setNuevoSoldTo] = useState('')
  const [nuevoShipTo, setNuevoShipTo] = useState('')
  const [nuevoEspecie, setNuevoEspecie] = useState('')
  const [creandoEn, setCreandoEn] = useState<TipoContacto | null>(null)
  const [editando, setEditando] = useState<number | null>(null)
  const [borrador, setBorrador] = useState(VACIO)
  const [tipoCopia, setTipoCopia] = useState<TipoCopia>('cc')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    Promise.all([listarClientes(), listarPlantas(), listarEspeciesActivas()])
      .then(([c, p, e]) => {
        setClientes(c)
        setPlantas(p)
        setEspecies(e)
      })
      .catch(() => onError('No se pudieron cargar los datos del catálogo.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Grupos existentes: set de claves únicas
  const grupos = useMemo(() => {
    const mapa = new Map<string, { sold_to: string; ship_to: string; especie: string; count: number }>()
    for (const c of contactos) {
      const st = (c.sold_to || '').trim()
      const sh = (c.ship_to || '').trim()
      const es = (c.especie || '').trim()
      const k = claveGrupo(st, sh, es)
      const existente = mapa.get(k)
      if (existente) {
        existente.count++
      } else {
        mapa.set(k, { sold_to: st, ship_to: sh, especie: es, count: 1 })
      }
    }
    // Primero el global, luego el resto ordenado
    const global = mapa.get(GLOBAL_CLAVE)
    const resto = [...mapa.entries()]
      .filter(([k]) => k !== GLOBAL_CLAVE)
      .sort(([, a], [, b]) => {
        const la = `${a.sold_to} ${a.ship_to} ${a.especie}`
        const lb = `${b.sold_to} ${b.ship_to} ${b.especie}`
        return la.localeCompare(lb)
      })
    const resultado: { clave: string; sold_to: string; ship_to: string; especie: string; count: number }[] = []
    if (global) resultado.push({ clave: GLOBAL_CLAVE, ...global })
    for (const [clave, datos] of resto) resultado.push({ clave, ...datos })
    return resultado
  }, [contactos])

  const claveActiva = grupoActivo
  const grupoActivoDatos = grupoActivo !== null
    ? grupos.find((g) => g.clave === grupoActivo) ?? { sold_to: '', ship_to: '', especie: '' }
    : null

  // Plantas filtradas por sold_to seleccionado en el formulario nuevo grupo
  const plantasFiltradas = useMemo(
    () =>
      plantas
        .filter((p) => p.activo && (!nuevoSoldTo || p.cliente_nombre === nuevoSoldTo))
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [plantas, nuevoSoldTo],
  )

  // Claves ya configuradas (para evitar duplicados al crear)
  const clavesExistentes = useMemo(() => new Set(grupos.map((g) => g.clave)), [grupos])

  function etiquetaGrupo(sold_to: string, ship_to: string, especie: string) {
    if (!sold_to && !ship_to && !especie) return GLOBAL_ETIQUETA
    const partes = [sold_to, ship_to, especie].filter(Boolean)
    return partes.join(' · ')
  }

  function contactosDelGrupo(sold_to: string, ship_to: string, especie: string) {
    const st = sold_to.trim()
    const sh = ship_to.trim()
    const es = especie.trim()
    return contactos.filter(
      (c) =>
        (c.sold_to || '').trim() === st &&
        (c.ship_to || '').trim() === sh &&
        (c.especie || '').trim() === es,
    )
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

  function datosDe(
    tipo: TipoContacto,
    sold_to: string,
    ship_to: string,
    especie: string,
    base?: Contacto,
  ): ContactoInput {
    const delGrupoTipo = contactosDelGrupo(sold_to, ship_to, especie).filter((c) => c.tipo === tipo)
    return {
      laboratorio,
      nombre: borrador.nombre.trim(),
      email: borrador.email.trim(),
      cargo: borrador.cargo.trim(),
      tipo,
      sold_to: sold_to.trim(),
      ship_to: ship_to.trim(),
      especie: especie.trim(),
      tipo_copia: tipo === 'resultado_interno' ? tipoCopia : 'cc',
      activo: base?.activo ?? true,
      orden: base?.orden ?? delGrupoTipo.length + 1,
    }
  }

  async function guardar(tipo: TipoContacto, sold_to: string, ship_to: string, especie: string, existente?: Contacto) {
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
        const actualizado = await actualizarContacto(existente.id, datosDe(tipo, sold_to, ship_to, especie, existente))
        onCambio(contactos.map((c) => (c.id === existente.id ? actualizado : c)))
      } else {
        const nuevo = await crearContacto(datosDe(tipo, sold_to, ship_to, especie))
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

  function crearGrupo() {
    const clave = claveGrupo(nuevoSoldTo, nuevoShipTo, nuevoEspecie)
    if (!nuevoSoldTo && !nuevoShipTo && !nuevoEspecie) {
      // El global se abre directamente
    } else if (clavesExistentes.has(clave)) {
      onError('Esa combinación ya tiene configuración propia.')
      return
    }
    onError(null)
    setNuevoSoldTo('')
    setNuevoShipTo('')
    setNuevoEspecie('')
    setGrupoActivo(clave)
  }

  function formulario(tipo: TipoContacto, sold_to: string, ship_to: string, especie: string, existente?: Contacto) {
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
              placeholder="ana@empresa.cl"
              onChange={(e) => setBorrador({ ...borrador, email: e.target.value })}
            />
          </div>
          <div className={styles.campo}>
            <label className={styles.etiqueta}>Cargo (opcional)</label>
            <input
              className={styles.input}
              value={borrador.cargo}
              placeholder="Comercial"
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
          <Button onClick={() => guardar(tipo, sold_to, ship_to, especie, existente)} disabled={guardando}>
            {guardando ? 'Guardando…' : existente ? 'Guardar cambios' : 'Agregar contacto'}
          </Button>
        </div>
      </div>
    )
  }

  // --- Detalle de un grupo (sold_to + ship_to + especie) -------------------

  if (claveActiva !== null && grupoActivoDatos !== null) {
    const { sold_to, ship_to, especie } = grupoActivoDatos
    const delGrupo = contactosDelGrupo(sold_to, ship_to, especie)
    return (
      <>
        <div className={styles.seccionCabecera}>
          <div>
            <h3 className={styles.seccionTitulo}>{etiquetaGrupo(sold_to, ship_to, especie)}</h3>
            <p className={styles.seccionNota}>
              {[
                sold_to && `Sold To: ${sold_to}`,
                ship_to && `Ship To: ${ship_to}`,
                especie && `Especie: ${especie}`,
              ]
                .filter(Boolean)
                .join(' · ') || 'Configuración de respaldo para combinaciones sin regla propia.'}
            </p>
          </div>
          <Button variant="secondary" onClick={() => { setGrupoActivo(null); cerrarFormulario() }}>
            ← Todos los grupos
          </Button>
        </div>

        {SECCIONES.map(({ tipo, titulo, nota }) => {
          const delTipo = delGrupo.filter((c) => c.tipo === tipo).sort((a, b) => a.orden - b.orden)
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

              {creandoEn === tipo && formulario(tipo, sold_to, ship_to, especie)}

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
                          {formulario(tipo, sold_to, ship_to, especie, contacto)}
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
                          {!contacto.activo && (
                            <span className={cn(styles.insignia, styles.insigniaInactivo)}>Inactivo</span>
                          )}
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

  // --- Grilla de grupos ----------------------------------------------------

  return (
    <>
      <div className={styles.seccionCabecera}>
        <div>
          <h3 className={styles.seccionTitulo}>Resultado a clientes por Sold To · Ship To · Especie</h3>
          <p className={styles.seccionNota}>
            Cada combinación tiene su propia lista de destinatarios y copias internas. La configuración es compartida
            entre todos los laboratorios.
          </p>
        </div>
      </div>

      <div className={styles.grilla}>
        {grupos.map((g) => (
          <button key={g.clave} className={styles.tarjeta} onClick={() => { setGrupoActivo(g.clave); cerrarFormulario() }}>
            <div className={styles.tarjetaCabecera}>
              <div className={styles.tarjetaTitulos}>
                {(g.sold_to || g.ship_to || g.especie) ? (
                  <>
                    <p className={styles.tarjetaNombre}>{g.ship_to || g.sold_to}</p>
                    {g.sold_to && g.ship_to && (
                      <p className={styles.tarjetaSecundario} style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                        {g.sold_to}
                      </p>
                    )}
                    {g.especie && (
                      <p className={styles.tarjetaSecundario} style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-accent)' }}>
                        {g.especie}
                      </p>
                    )}
                  </>
                ) : (
                  <p className={styles.tarjetaNombre}>{GLOBAL_ETIQUETA}</p>
                )}
              </div>
            </div>
            <div className={styles.metricas}>
              <div className={styles.metrica}>
                <span className={styles.metricaValor}>{g.count}</span>
                <span className={styles.metricaEtiqueta}>Contactos</span>
              </div>
            </div>
          </button>
        ))}

        {/* Formulario para nuevo grupo */}
        <div className={styles.tarjetaNueva} style={{ cursor: 'default', gap: 'var(--space-2)' }}>
          <select
            className={styles.select}
            value={nuevoSoldTo}
            onChange={(e) => { setNuevoSoldTo(e.target.value); setNuevoShipTo('') }}
          >
            <option value="">Sold To (opcional)…</option>
            {clientes.filter((c) => c.activo).sort((a, b) => a.nombre.localeCompare(b.nombre)).map((c) => (
              <option key={c.id} value={c.nombre}>{c.nombre}</option>
            ))}
          </select>
          <select
            className={styles.select}
            value={nuevoShipTo}
            onChange={(e) => setNuevoShipTo(e.target.value)}
          >
            <option value="">Ship To (opcional)…</option>
            {plantasFiltradas.map((p) => (
              <option key={p.id} value={p.nombre}>{p.nombre}</option>
            ))}
          </select>
          <select
            className={styles.select}
            value={nuevoEspecie}
            onChange={(e) => setNuevoEspecie(e.target.value)}
          >
            <option value="">Especie (opcional)…</option>
            {especies.map((e) => (
              <option key={e.id} value={e.valor}>{e.valor}</option>
            ))}
          </select>
          <Button variant="secondary" onClick={crearGrupo}>
            + Nuevo grupo
          </Button>
        </div>
      </div>
    </>
  )
}
