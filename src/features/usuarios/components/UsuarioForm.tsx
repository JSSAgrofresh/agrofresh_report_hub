import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { BuscableSelect } from '@/components/ui/BuscableSelect'
import { LISTA_AREAS } from '@/constants/areas'
import type { AreaId } from '@/constants/areas'
import { listarClientes, listarPlantas } from '@/features/catalogo'
import type { Planta } from '@/features/catalogo'
import { CORREO_MAESTRO, buscarPlantasDeComercial } from '../api/usuariosStore'
import { cuentaDesdeSeleccion, seleccionDesdeCuenta, seleccionTotal, validarSeleccion } from '../catalogoPermisos'
import { modulosPredeterminados, reportesPredeterminados, vistaDeCliente } from '../permisos'
import type { VistaCliente } from '../permisos'
import type { Permiso } from '../catalogoPermisos'
import type { PlantaAsignada, TipoAcceso, Usuario } from '../types'
import { claveDePlanta } from '../lib/plantas'
import { PlantasAsignadas } from './PlantasAsignadas'
import { SelectorPermisos } from './SelectorPermisos'
import styles from './UsuarioForm.module.css'

interface UsuarioFormProps {
  usuario?: Usuario
  onGuardar: (datos: Omit<Usuario, 'id'>) => void
  onCancelar: () => void
}

const TIPOS: { valor: TipoAcceso; etiqueta: string; descripcion: string }[] = [
  { valor: 'admin_general', etiqueta: 'Administrador general', descripcion: 'Todo el sistema, incluida la administración.' },
  { valor: 'gerencia', etiqueta: 'Gerencia', descripcion: 'Ve todo (menos el Panel de control interno), solo lectura.' },
  { valor: 'admin_area', etiqueta: 'Administrador de área', descripcion: 'Gestiona un área. Los accesos se eligen abajo.' },
  { valor: 'comercial', etiqueta: 'Comercial', descripcion: 'Solo lectura de las plantas que le asignes: puede mirar y descargar, nada más.' },
  { valor: 'analista', etiqueta: 'Analista de laboratorio', descripcion: 'Trabaja en el laboratorio. Los accesos se eligen abajo.' },
  { valor: 'muestreador', etiqueta: 'Muestreador', descripcion: 'Crea y ve solo sus solicitudes de muestreo.' },
  { valor: 'cliente', etiqueta: 'Cliente', descripcion: 'Portal externo: solo ve sus propios datos.' },
]

const CLIENTE_VE: { id: keyof VistaCliente; nombre: string; descripcion: string }[] = [
  { id: 'report', nombre: 'Report de laboratorio', descripcion: 'Resultados y gráficos de sus análisis de Cromatografía.' },
  { id: 'storage', nombre: 'Storage', descripcion: 'Sus informes en PDF, en carpetas (solo lectura).' },
  { id: 'accutab', nombre: 'Informes Accu-Tab', descripcion: 'Informes de los equipos Accu-Tab (Post Venta) en su panel.' },
]

/** Lo único que hoy se puede dar a un comercial: lo que la API acota a sus plantas (Report de laboratorio y Storage). */
const DISPONIBLE_PARA_COMERCIAL = new Set(['reports', 'reporte:laboratorio', 'storage'])
const sinPlantasAcotadas = (p: Permiso): string | null =>
  DISPONIBLE_PARA_COMERCIAL.has(p.id) ? null : 'Falta acotarlo a las plantas del comercial.'

const tipoEtiqueta = (t: TipoAcceso) => TIPOS.find((x) => x.valor === t)?.etiqueta ?? t

export function UsuarioForm({ usuario, onGuardar, onCancelar }: UsuarioFormProps) {
  const esMaestro = usuario?.email === CORREO_MAESTRO
  const [nombre, setNombre] = useState(usuario?.nombre ?? '')
  const [email, setEmail] = useState(usuario?.email ?? '')
  const [tipoAcceso, setTipoAcceso] = useState<TipoAcceso>(usuario?.tipoAcceso ?? 'admin_area')
  const [area, setArea] = useState<AreaId | ''>(usuario?.area ?? '')
  const [clienteNombre, setClienteNombre] = useState(usuario?.clienteNombre ?? '')
  const [plantaNombre, setPlantaNombre] = useState(usuario?.plantaNombre ?? '')
  const [clienteVe, setClienteVe] = useState<VistaCliente>(
    usuario?.tipoAcceso === 'cliente' ? vistaDeCliente(usuario) : { report: true, storage: false, accutab: false },
  )
  // Comercial: de qué plantas.
  const [plantasAsignadas, setPlantasAsignadas] = useState<PlantaAsignada[]>(usuario?.plantasAsignadas ?? [])
  const [comercialCliente, setComercialCliente] = useState('')
  const [comercialPlanta, setComercialPlanta] = useState('')
  const [buscandoListas, setBuscandoListas] = useState(false)
  const [avisoListas, setAvisoListas] = useState<string | null>(null)
  // Una sola lista con todo lo que la cuenta puede hacer (módulos, secciones y funciones sueltas).
  const [seleccion, setSeleccion] = useState<string[]>(() => plantilla(usuario?.tipoAcceso ?? 'admin_area', usuario?.area, usuario))
  const [error, setError] = useState<string | null>(null)
  const [clientesDisponibles, setClientesDisponibles] = useState<string[]>([])
  const [plantasDisponibles, setPlantasDisponibles] = useState<Planta[]>([])

  const esCliente = tipoAcceso === 'cliente'
  const esComercial = tipoAcceso === 'comercial'
  const veTodo = tipoAcceso === 'admin_general'
  const requiereArea = tipoAcceso === 'admin_area' || tipoAcceso === 'analista'
  const configuraPermisos = !esCliente && !veTodo && !esMaestro

  useEffect(() => {
    if (!esCliente && !esComercial) return
    listarClientes()
      .then((clientes) => setClientesDisponibles(clientes.map((c) => c.nombre)))
      .catch(() => setClientesDisponibles([]))
    listarPlantas()
      .then(setPlantasDisponibles)
      .catch(() => setPlantasDisponibles([]))
  }, [esCliente, esComercial])

  const plantasDelCliente = plantasDisponibles.filter((p) => p.cliente_nombre === (esComercial ? comercialCliente : clienteNombre))

  function agregarPlantaComercial() {
    if (!comercialCliente) return
    const nueva: PlantaAsignada = { clienteNombre: comercialCliente, plantaNombre: comercialPlanta || null }
    setPlantasAsignadas((actuales) => (actuales.some((p) => claveDePlanta(p) === claveDePlanta(nueva)) ? actuales : [...actuales, nueva]))
    setComercialPlanta('')
  }

  async function traerDeLasListas() {
    setAvisoListas(null)
    setBuscandoListas(true)
    try {
      const halladas = await buscarPlantasDeComercial(email)
      setPlantasAsignadas((actuales) => {
        const vistas = new Set(actuales.map(claveDePlanta))
        return [...actuales, ...halladas.filter((p) => !vistas.has(claveDePlanta(p)))]
      })
      setAvisoListas(
        halladas.length === 0
          ? 'Ese correo no figura como Comercial en ninguna lista de distribución.'
          : `Se agregaron ${halladas.length} ${halladas.length === 1 ? 'planta' : 'plantas'} de las listas. Revísalas y quita las que no correspondan.`,
      )
    } catch {
      setAvisoListas('No se pudieron leer las listas de distribución. Inténtalo de nuevo.')
    } finally {
      setBuscandoListas(false)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (requiereArea && !area) {
      setError('Selecciona un área.')
      return
    }
    if (esCliente && !clienteNombre.trim()) {
      setError('Ingresa el nombre del cliente.')
      return
    }
    if (esCliente && !clienteVe.report && !clienteVe.storage && !clienteVe.accutab) {
      setError('Elige qué ve el cliente: Report, Storage y/o informes Accu-Tab.')
      return
    }
    if (esComercial && plantasAsignadas.length === 0) {
      setError('Asigna al menos una planta al comercial.')
      return
    }
    const falla = configuraPermisos ? validarSeleccion(seleccion) : null
    if (falla) {
      setError(falla)
      return
    }
    const permisos = configuraPermisos ? cuentaDesdeSeleccion(seleccion) : undefined
    if (esComercial && !(permisos?.modulos ?? []).some((m) => m === 'reports' || m === 'storage')) {
      setError('Elige qué abre el comercial: Report y/o Storage.')
      return
    }

    onGuardar({
      nombre: nombre.trim(),
      email: email.trim(),
      tipoAcceso,
      // Un cliente no pertenece a un área: el servidor deduce la que guarda de lo que ve.
      area: requiereArea ? (area as AreaId) : undefined,
      clienteNombre: esCliente ? clienteNombre.trim() : undefined,
      plantaNombre: esCliente && plantaNombre.trim() ? plantaNombre.trim() : undefined,
      modulos: esCliente
        ? [clienteVe.report && 'reports', clienteVe.storage && 'storage'].filter((m): m is string => !!m)
        : permisos?.modulos,
      reportes: esCliente
        ? [clienteVe.report && 'laboratorio', clienteVe.accutab && 'postventa'].filter((r): r is 'laboratorio' | 'postventa' => !!r)
        : permisos?.reportes,
      plantasAsignadas: esComercial ? plantasAsignadas : undefined,
    })
  }

  function cambiarTipoAcceso(nuevoTipo: TipoAcceso) {
    setTipoAcceso(nuevoTipo)
    setSeleccion(plantilla(nuevoTipo, area || undefined))
  }

  function cambiarArea(nuevaArea: AreaId | '') {
    setArea(nuevaArea)
    setSeleccion(plantilla(tipoAcceso, nuevaArea || undefined))
  }

  function alternarClienteVe(id: keyof VistaCliente) {
    setClienteVe((actuales) => ({ ...actuales, [id]: !actuales[id] }))
  }

  function alElegirCliente(v: string) {
    setClienteNombre(v)
    setPlantaNombre('')
  }

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <section className={styles.bloque}>
        <h3 className={styles.titulo}><b>1</b> Quién es</h3>
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
      </section>

      <section className={styles.bloque}>
        <h3 className={styles.titulo}><b>2</b> Tipo de cuenta</h3>
        <p className={styles.notaChica}>El tipo decide qué puede hacer y ver en el sistema.</p>
        <div className={styles.tipos} role="radiogroup" aria-label="Tipo de cuenta">
          {TIPOS.map((t) => (
            <label className={styles.tipo} key={t.valor}>
              <input
                type="radio"
                name="tipoAcceso"
                value={t.valor}
                checked={tipoAcceso === t.valor}
                disabled={esMaestro}
                onChange={() => cambiarTipoAcceso(t.valor)}
              />
              <span>
                <strong>{t.etiqueta}</strong>
                <small>{t.descripcion}</small>
              </span>
            </label>
          ))}
        </div>
        {esMaestro && <p className={styles.nota}>Este es el usuario maestro: su acceso no se puede cambiar.</p>}
      </section>

      {esCliente && !esMaestro && (
        <section className={styles.bloque}>
          <h3 className={styles.titulo}><b>3</b> Qué cliente es y qué ve</h3>
          <div className={styles.campo}>
            <BuscableSelect
              etiqueta="Sold To (cliente)"
              opciones={
                clienteNombre && !clientesDisponibles.includes(clienteNombre)
                  ? [clienteNombre, ...clientesDisponibles]
                  : clientesDisponibles
              }
              valor={clienteNombre}
              onChange={alElegirCliente}
              placeholderTodos="— elegir cliente —"
            />
            <p className={styles.notaChica}>Se elige del catálogo oficial de Sold To (sección Listados).</p>
          </div>

          {clienteNombre && (
            <div className={styles.campo}>
              <BuscableSelect
                etiqueta="Sucursal (Ship To) — opcional"
                opciones={plantasDelCliente.map((p) => p.nombre)}
                valor={plantaNombre}
                onChange={setPlantaNombre}
                placeholderTodos="— cuenta para todo el Sold To —"
              />
              <p className={styles.notaChica}>
                {plantasDelCliente.length === 0
                  ? 'Este cliente no tiene sucursales cargadas en Listados: la cuenta ve todo el Sold To.'
                  : 'Si eliges una sucursal, la cuenta ve solo esa planta (ej. "Dole Codegua"). Si la dejas vacía, ve todo el Sold To.'}
              </p>
            </div>
          )}

          <fieldset className={styles.permisos}>
            <legend>Qué ve este cliente</legend>
            <p className={styles.notaChica}>
              Un cliente no pertenece a un área: tú eliges qué le muestras. Solo verá sus propios datos.
            </p>
            <div className={styles.permisosGrid}>
              {CLIENTE_VE.map((c) => (
                <label className={styles.permisoOpcion} key={c.id}>
                  <input type="checkbox" checked={clienteVe[c.id]} onChange={() => alternarClienteVe(c.id)} />
                  <span>
                    <strong>{c.nombre}</strong>
                    <small>{c.descripcion}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </section>
      )}

      {esComercial && !esMaestro && (
        <section className={styles.bloque}>
          <h3 className={styles.titulo}><b>3</b> Qué plantas ve</h3>
          <p className={styles.notaChica}>
            Un comercial solo mira: no puede crear, editar, subir ni borrar nada. Puede descargar. Abajo eliges a qué módulos entra.
          </p>

          <div className={styles.campo}>
            <BuscableSelect
              etiqueta="Sold To (cliente)"
              opciones={clientesDisponibles}
              valor={comercialCliente}
              onChange={(v) => {
                setComercialCliente(v)
                setComercialPlanta('')
              }}
              placeholderTodos="— elegir cliente —"
            />
          </div>
          {comercialCliente && (
            <div className={styles.campo}>
              <BuscableSelect
                etiqueta="Planta (Ship To) — opcional"
                opciones={plantasDelCliente.map((p) => p.nombre)}
                valor={comercialPlanta}
                onChange={setComercialPlanta}
                placeholderTodos="— todas las plantas de este Sold To —"
              />
            </div>
          )}
          <div className={styles.filaPlantas}>
            <button type="button" onClick={agregarPlantaComercial} disabled={!comercialCliente}>
              Agregar planta
            </button>
            <button type="button" onClick={traerDeLasListas} disabled={buscandoListas || !email.trim()}>
              {buscandoListas ? 'Buscando…' : 'Traer sus plantas de las listas de distribución'}
            </button>
          </div>
          {avisoListas && <p className={styles.notaChica}>{avisoListas}</p>}

          <PlantasAsignadas plantas={plantasAsignadas} onChange={setPlantasAsignadas} />
        </section>
      )}

      {!esCliente && !esMaestro && (
        <section className={styles.bloque}>
          <h3 className={styles.titulo}><b>{esComercial ? 4 : 3}</b> Qué puede hacer</h3>

          {requiereArea && (
            <label className={styles.campo}>
              <span>Área</span>
              <select value={area} onChange={(e) => cambiarArea(e.target.value as AreaId)}>
                <option value="">— elegir —</option>
                {LISTA_AREAS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
              </select>
              <p className={styles.notaChica}>Define su panel de inicio y con qué accesos parte la lista de abajo.</p>
            </label>
          )}

          {veTodo ? (
            <p className={styles.nota}>
              {tipoAcceso === 'admin_general'
                ? 'El administrador general tiene todo, incluida la administración.'
                : ''}
            </p>
          ) : (
            <div className={styles.plantilla}>
              <p>
                Partiste con los accesos típicos de <strong>{tipoEtiqueta(tipoAcceso)}</strong>. Marca o quita lo que necesites:
                esta cuenta tendrá exactamente lo que quede marcado.
              </p>
              <button type="button" onClick={() => setSeleccion(plantilla(tipoAcceso, area || undefined))}>
                Volver a lo típico
              </button>
            </div>
          )}

          {esComercial && (
            <p className={styles.notaChica}>
              Los módulos apagados («aún no disponible») todavía no se pueden dar a un comercial: sus datos hay que acotarlos
              primero a sus plantas, para que no vea las de otros clientes.
            </p>
          )}

          <SelectorPermisos
            valor={veTodo ? seleccionTotal('admin_general') : seleccion}
            onChange={setSeleccion}
            tipo={tipoAcceso}
            area={area || undefined}
            soloLectura={veTodo}
            noDisponible={esComercial ? sinPlantasAcotadas : undefined}
          />
        </section>
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

/** Con qué parte la lista: lo que ya tiene la cuenta si se está editando y no cambió de tipo; si no, lo típico del tipo. */
function plantilla(tipo: TipoAcceso, area?: AreaId, actual?: Usuario): string[] {
  const base = { tipoAcceso: tipo, area }
  // Gerencia no parte con nada marcado (se elige a mano); una cuenta antigua, sin lista, conserva todo lo que veía.
  if (tipo === 'gerencia') {
    if (actual && actual.tipoAcceso === 'gerencia' && actual.modulos == null) return seleccionTotal('gerencia')
    if (!(actual && actual.tipoAcceso === 'gerencia')) return []
  }
  // Un comercial nuevo parte con lo único que hoy se puede acotar a sus plantas.
  if (tipo === 'comercial' && !(actual && actual.tipoAcceso === 'comercial')) return ['reports', 'reporte:laboratorio', 'storage']
  const cuenta = actual && actual.tipoAcceso === tipo && actual.area === area ? actual : { ...base, modulos: undefined, reportes: undefined }
  return seleccionDesdeCuenta(cuenta, modulosPredeterminados(base), reportesPredeterminados(base))
}
