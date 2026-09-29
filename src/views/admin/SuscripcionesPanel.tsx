import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/cn'
import { notificacionesApi } from '@/features/notificaciones'
import type { SuscripcionUsuario, TipoNotificacion, TipoNotificacionInfo } from '@/features/notificaciones'
import { etiquetaAcceso } from '@/features/usuarios'
import type { Usuario } from '@/features/usuarios'
import styles from './SuscripcionesPanel.module.css'

/** Nombre corto para la cabecera de la tabla; el largo va en el title. */
const CORTO: Record<TipoNotificacion, string> = {
  solicitud: 'Solicitudes',
  reanalisis: 'Reanálisis',
  verificacion: 'Verificaciones',
  descarga_gc: 'Descargas GC',
  carga_datos: 'Carga de datos',
  anuncio: 'Avisos',
}

function perfil(u: SuscripcionUsuario): string {
  return etiquetaAcceso({ tipoAcceso: u.tipoAcceso, area: u.area ?? undefined } as Usuario)
}

/**
 * Quién recibe qué tipo de notificación. Cada cambio se guarda al tiro.
 * Un usuario sin ningún tipo marcado no tiene el módulo: no ve la campana.
 */
export function SuscripcionesPanel() {
  const [tipos, setTipos] = useState<TipoNotificacionInfo[]>([])
  const [usuarios, setUsuarios] = useState<SuscripcionUsuario[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState<number | null>(null)
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    notificacionesApi
      .adminSuscripciones()
      .then((d) => { setTipos(d.tipos); setUsuarios(d.usuarios) })
      .catch(() => setError('No se pudo cargar la configuración de notificaciones.'))
      .finally(() => setCargando(false))
  }, [])

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return usuarios
    return usuarios.filter((u) => `${u.nombre} ${u.email} ${perfil(u)}`.toLowerCase().includes(q))
  }, [usuarios, busqueda])

  async function aplicar(u: SuscripcionUsuario, peticion: Promise<SuscripcionUsuario>) {
    setGuardando(u.usuario_id)
    setError('')
    try {
      const fila = await peticion
      setUsuarios((prev) => prev.map((x) => (x.usuario_id === fila.usuario_id ? fila : x)))
    } catch {
      setError(`No se pudo guardar lo de ${u.nombre}. Inténtalo de nuevo.`)
    } finally {
      setGuardando(null)
    }
  }

  function alternarTipo(u: SuscripcionUsuario, tipo: TipoNotificacion) {
    const nuevos = u.tipos.includes(tipo) ? u.tipos.filter((t) => t !== tipo) : [...u.tipos, tipo]
    void aplicar(u, notificacionesApi.adminGuardarSuscripcion(u.usuario_id, nuevos))
  }

  function alternarModulo(u: SuscripcionUsuario) {
    // Apagarlo lo deja sin ningún tipo; encenderlo lo devuelve a lo de su perfil.
    const peticion = u.tipos.length > 0
      ? notificacionesApi.adminGuardarSuscripcion(u.usuario_id, [])
      : notificacionesApi.adminRestablecerSuscripcion(u.usuario_id)
    void aplicar(u, peticion)
  }

  if (cargando) return <p className={styles.vacia}>Cargando…</p>

  return (
    <div className={styles.panel}>
      <p className={styles.intro}>
        Marca qué tipos de notificación recibe cada usuario. Los cambios se guardan al momento.
        Quien no tenga el módulo activo no ve la campana de notificaciones.
      </p>

      <div className={styles.barra}>
        <input
          className={styles.buscar}
          type="search"
          placeholder="Buscar usuario…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          aria-label="Buscar usuario"
        />
        {error && <span className={styles.error} role="alert">{error}</span>}
      </div>

      <div className={styles.scroll}>
        <table className={styles.tabla}>
          <thead>
            <tr>
              <th className={styles.colUsuario}>Usuario</th>
              <th className={styles.colCheck}>Módulo</th>
              {tipos.map((t) => (
                <th key={t.id} className={styles.colCheck} title={`${t.nombre}: ${t.descripcion}`}>
                  {CORTO[t.id] ?? t.nombre}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {visibles.map((u) => {
              const activo = u.tipos.length > 0
              const ocupado = guardando === u.usuario_id
              return (
                <tr key={u.usuario_id} className={cn(!activo && styles.filaInactiva)}>
                  <td className={styles.colUsuario}>
                    <span className={styles.nombre}>{u.nombre}</span>
                    <span className={styles.detalle}>{u.email} · {perfil(u)}</span>
                  </td>
                  <td className={styles.colCheck}>
                    <input
                      type="checkbox"
                      checked={activo}
                      disabled={ocupado}
                      onChange={() => alternarModulo(u)}
                      aria-label={`Módulo de notificaciones para ${u.nombre}`}
                    />
                  </td>
                  {tipos.map((t) => (
                    <td key={t.id} className={styles.colCheck}>
                      <input
                        type="checkbox"
                        checked={u.tipos.includes(t.id)}
                        disabled={ocupado}
                        onChange={() => alternarTipo(u, t.id)}
                        aria-label={`${t.nombre} para ${u.nombre}`}
                      />
                    </td>
                  ))}
                  <td className={styles.colEstado}>
                    {u.personalizado ? (
                      <button
                        type="button"
                        className={styles.btnRestablecer}
                        disabled={ocupado}
                        onClick={() => void aplicar(u, notificacionesApi.adminRestablecerSuscripcion(u.usuario_id))}
                        title="Volver a lo predeterminado para su perfil"
                      >
                        Restablecer
                      </button>
                    ) : (
                      <span className={styles.predeterminado} title="Recibe lo predeterminado para su perfil">
                        Predeterminado
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
            {visibles.length === 0 && (
              <tr><td colSpan={tipos.length + 3} className={styles.vacia}>Ningún usuario coincide.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <dl className={styles.leyenda}>
        {tipos.map((t) => (
          <div key={t.id}>
            <dt>{CORTO[t.id] ?? t.nombre}</dt>
            <dd>{t.descripcion}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
