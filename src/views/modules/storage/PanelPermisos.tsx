import { useEffect, useMemo, useState } from 'react'
import { IconCandado } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { HttpError } from '@/services/http/client'
import { espacioDeRuta, espacioLocalDeRuta, guardarPermisos, nombreDe, resumenPermisos, verPermisos } from '@/features/storage'
import type { Espacio, PermisoCarpeta, ResumenPermiso } from '@/features/storage'
import { listarUsuarios } from '@/features/usuarios/api/usuariosStore'
import type { Usuario } from '@/features/usuarios'
import styles from './PanelPermisos.module.css'

interface PanelPermisosProps {
  espacio: Espacio
  /** Carpeta que se está administrando. */
  ruta: string
  onCerrar: () => void
  /** Se guardó algo: hay que releer los listados (los candados cambian). */
  onCambio: () => void
  /** Ir a una carpeta restringida desde el resumen. */
  onIrA: (espacioId: Espacio['id'], ruta: string) => void
}

type Pestana = 'carpeta' | 'resumen'

function mensajeDe(e: unknown, defecto: string): string {
  return e instanceof HttpError && e.message ? e.message : defecto
}

export function PanelPermisos({ espacio, ruta, onCerrar, onCambio, onIrA }: PanelPermisosProps) {
  const [pestana, setPestana] = useState<Pestana>('carpeta')
  const espacioApi = espacio.r2 ? 'r2' : 'local'
  const esRaiz = ruta === espacio.raiz

  return (
    <aside className={styles.panel} aria-label="Permisos de carpeta">
      <header className={styles.cabecera}>
        <h3 className={styles.titulo}>
          <IconCandado className={styles.iconoTitulo} /> Permisos
        </h3>
        <button type="button" className={styles.cerrar} onClick={onCerrar} aria-label="Cerrar permisos">
          ×
        </button>
      </header>

      <div className={styles.pestanas} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={pestana === 'carpeta'}
          className={cn(styles.pestana, pestana === 'carpeta' && styles.pestanaActiva)}
          onClick={() => setPestana('carpeta')}
        >
          Esta carpeta
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={pestana === 'resumen'}
          className={cn(styles.pestana, pestana === 'resumen' && styles.pestanaActiva)}
          onClick={() => setPestana('resumen')}
        >
          Todas las restringidas
        </button>
      </div>

      {pestana === 'carpeta' ? (
        esRaiz ? (
          <p className={styles.nota}>
            Elige una carpeta de la lista (o haz clic en «Permisos» en su fila) para decidir quién
            puede verla. La raíz no se restringe.
          </p>
        ) : (
          <EditorCarpeta
            key={`${espacioApi}|${ruta}`}
            espacio={espacio}
            espacioApi={espacioApi}
            ruta={ruta}
            onCambio={onCambio}
          />
        )
      ) : (
        <Resumen onIrA={onIrA} />
      )}
    </aside>
  )
}

interface EditorProps {
  espacio: Espacio
  espacioApi: 'local' | 'r2'
  ruta: string
  onCambio: () => void
}

function EditorCarpeta({ espacio, espacioApi, ruta, onCambio }: EditorProps) {
  const [permiso, setPermiso] = useState<PermisoCarpeta | null>(null)
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null)
  const [restringida, setRestringida] = useState(false)
  const [elegidos, setElegidos] = useState<Set<number>>(new Set())
  const [busqueda, setBusqueda] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardado, setGuardado] = useState(false)

  useEffect(() => {
    let vigente = true
    Promise.all([verPermisos(espacioApi, ruta), listarUsuarios()])
      .then(([p, u]) => {
        if (!vigente) return
        setPermiso(p)
        setUsuarios(u)
        setRestringida(p.restringida)
        setElegidos(new Set(p.usuario_ids))
      })
      .catch((e) => vigente && setError(mensajeDe(e, 'No se pudieron leer los permisos.')))
    return () => {
      vigente = false
    }
  }, [espacioApi, ruta])

  // Admin general y gerencia ven todo siempre: elegirlos no cambiaría nada.
  const candidatos = useMemo(() => {
    if (!usuarios || !permiso) return []
    const permitidos = permiso.elegibles_ids ? new Set(permiso.elegibles_ids) : null
    const texto = busqueda.trim().toLowerCase()
    return usuarios
      .filter((u) => u.tipoAcceso !== 'cliente' && u.tipoAcceso !== 'admin_general' && u.tipoAcceso !== 'gerencia')
      .filter((u) => !permitidos || permitidos.has(Number(u.id)))
      .filter((u) => !texto || `${u.nombre} ${u.email}`.toLowerCase().includes(texto))
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [usuarios, permiso, busqueda])

  function alternar(id: number) {
    setGuardado(false)
    setElegidos((actual) => {
      const nuevo = new Set(actual)
      if (!nuevo.delete(id)) nuevo.add(id)
      return nuevo
    })
  }

  async function guardar() {
    setGuardando(true)
    setError(null)
    setGuardado(false)
    try {
      const ids = restringida ? [...elegidos] : []
      const nuevo = await guardarPermisos(espacioApi, ruta, ids)
      setPermiso(nuevo)
      setRestringida(nuevo.restringida)
      setElegidos(new Set(nuevo.usuario_ids))
      setGuardado(true)
      onCambio()
    } catch (e) {
      setError(mensajeDe(e, 'No se pudieron guardar los permisos.'))
    } finally {
      setGuardando(false)
    }
  }

  if (!permiso || !usuarios) {
    return error ? <p className={styles.error}>{error}</p> : <p className={styles.nota}>Cargando…</p>
  }

  const sinElegidos = restringida && elegidos.size === 0

  return (
    <div className={styles.cuerpo}>
      <p className={styles.carpeta} title={ruta}>
        {nombreDe(ruta)}
      </p>

      {permiso.heredada_de && !permiso.restringida && (
        <p className={styles.aviso}>
          Hereda la restricción de «{permiso.heredada_de}». Puedes restringirla más, no ampliarla.
        </p>
      )}

      <label className={styles.opcion}>
        <input
          type="radio"
          name="acceso"
          checked={!restringida}
          onChange={() => {
            setRestringida(false)
            setGuardado(false)
          }}
        />
        <span>
          <strong>Abierta</strong>
          <small>
            {permiso.heredada_de
              ? 'Como la carpeta que la contiene.'
              : 'La ve todo el que tiene el módulo Storage.'}
          </small>
        </span>
      </label>
      <label className={styles.opcion}>
        <input
          type="radio"
          name="acceso"
          checked={restringida}
          onChange={() => {
            setRestringida(true)
            setGuardado(false)
          }}
        />
        <span>
          <strong>Restringida</strong>
          <small>Solo las personas que elijas, y el admin general y gerencia.</small>
        </span>
      </label>

      {restringida && (
        <>
          <input
            type="search"
            className={styles.buscador}
            placeholder="Buscar persona…"
            aria-label="Buscar persona"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <ul className={styles.lista}>
            {candidatos.length === 0 && <li className={styles.vacio}>No hay cuentas para elegir.</li>}
            {candidatos.map((u) => {
              const id = Number(u.id)
              return (
                <li key={u.id}>
                  <label className={styles.persona}>
                    <input type="checkbox" checked={elegidos.has(id)} onChange={() => alternar(id)} />
                    <span>
                      <strong>{u.nombre}</strong>
                      <small>{u.email}</small>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
          {sinElegidos && (
            <p className={styles.aviso}>
              Sin nadie elegido, la carpeta queda abierta para todos.
            </p>
          )}
        </>
      )}

      {espacio.id === 'solicitudes' && (
        <p className={styles.nota}>
          Esto controla lo que se ve en Storage. Las solicitudes se siguen viendo desde Toma de
          muestras según los permisos de ese módulo.
        </p>
      )}

      {error && <p className={styles.error}>{error}</p>}
      {guardado && <p className={styles.ok}>Permisos guardados.</p>}

      <button type="button" className={styles.guardar} onClick={() => void guardar()} disabled={guardando}>
        {guardando ? 'Guardando…' : 'Guardar permisos'}
      </button>
    </div>
  )
}

function Resumen({ onIrA }: { onIrA: PanelPermisosProps['onIrA'] }) {
  const [filas, setFilas] = useState<ResumenPermiso[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    resumenPermisos()
      .then((f) => vigente && setFilas(f))
      .catch((e) => vigente && setError(mensajeDe(e, 'No se pudo leer el resumen.')))
    return () => {
      vigente = false
    }
  }, [])

  if (error) return <p className={styles.error}>{error}</p>
  if (filas === null) return <p className={styles.nota}>Cargando…</p>
  if (filas.length === 0) {
    return <p className={styles.nota}>Ninguna carpeta está restringida: todas se ven con el módulo Storage.</p>
  }

  return (
    <ul className={styles.resumen}>
      {filas.map((f) => {
        const destino = f.espacio === 'local' ? espacioLocalDeRuta(f.ruta) : espacioDeRuta(f.ruta)
        return (
          <li key={`${f.espacio}|${f.ruta}`} className={styles.resumenItem}>
            <button type="button" className={styles.resumenRuta} onClick={() => onIrA(destino, f.ruta)}>
              {f.ruta}
            </button>
            <span className={styles.resumenPersonas}>{f.usuarios.map((u) => u.nombre).join(', ')}</span>
          </li>
        )
      })}
    </ul>
  )
}
