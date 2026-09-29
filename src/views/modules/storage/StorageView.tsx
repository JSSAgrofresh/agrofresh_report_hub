import { useEffect, useRef, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { ESPACIOS, operaciones, puede, useAvisos, useFavoritos } from '@/features/storage'
import type { Espacio } from '@/features/storage'
import { ArbolCarpetas } from './ArbolCarpetas'
import { Avisos } from './Avisos'
import { BusquedaGlobal } from './BusquedaGlobal'
import { Explorador } from './Explorador'
import { IconoCarpeta } from './IconoArchivo'
import { PanelPermisos } from './PanelPermisos'
import styles from './StorageView.module.css'

interface PermisosAbiertos {
  espacioId: Espacio['id']
  ruta: string
}

export function StorageView() {
  const { user } = useAuth()
  const [espacioId, setEspacioId] = useState<Espacio['id']>('local')
  const [ruta, setRuta] = useState('')
  // Sube cuando algo cambió (crear, mover, borrar, permisos): relee árbol y listado.
  const [version, setVersion] = useState(0)
  const [permisos, setPermisos] = useState<PermisosAbiertos | null>(null)
  const [resaltar, setResaltar] = useState<string | null>(null)
  const temporizador = useRef<number | null>(null)
  const { avisos, avisar, quitar } = useAvisos()
  const { favoritos, esFavorito, alternar } = useFavoritos()

  const esAdmin = user?.tipoAcceso === 'admin_general'
  // Gerencia mira todo, pero no modifica nada.
  const puedeEscribir = user?.tipoAcceso !== 'gerencia'
  const espacio = ESPACIOS.find((e) => e.id === espacioId) ?? ESPACIOS[0]
  const espacioPermisos = ESPACIOS.find((e) => e.id === permisos?.espacioId)
  const rutaActual = ruta || espacio.raiz

  useEffect(
    () => () => {
      if (temporizador.current) window.clearTimeout(temporizador.current)
    },
    [],
  )

  function ir(id: Espacio['id'], nuevaRuta: string, destacar: string | null = null) {
    setEspacioId(id)
    setRuta(nuevaRuta)
    setResaltar(destacar)
    if (temporizador.current) window.clearTimeout(temporizador.current)
    if (destacar) temporizador.current = window.setTimeout(() => setResaltar(null), 3800)
  }

  async function moverDesdeArbol(esp: Espacio, rutas: string[], destino: string) {
    if (!puede(esp, 'crear', destino)) {
      avisar('error', 'No se puede mover a esa carpeta.')
      return
    }
    const ops = operaciones(esp)
    const fallos: string[] = []
    let movidos = 0
    for (const r of rutas) {
      if (r === destino || destino.startsWith(r + '/')) continue
      if (r.split('/').slice(0, -1).join('/') === destino) continue
      try {
        await ops.mover(r, destino)
        movidos++
      } catch {
        fallos.push(r.split('/').pop() ?? r)
      }
    }
    setVersion((v) => v + 1)
    if (fallos.length) avisar('error', `No se pudo mover: ${fallos.join(', ')}.`)
    else if (movidos) avisar('ok', `${movidos} elemento(s) movido(s).`)
  }

  return (
    <div>
      <header className={styles.hero} style={{ '--acento': espacio.acento } as React.CSSProperties}>
        <div className={styles.heroTexto}>
          <h1 className={styles.heroTitulo}>Storage</h1>
          <p className={styles.heroDescripcion}>{espacio.descripcion}</p>
        </div>
        <BusquedaGlobal onAbrir={(id, r, destacar) => ir(id, r, destacar)} />
      </header>

      <Card>
        <div className={styles.pagina} data-con-panel={permisos && esAdmin ? 'si' : 'no'}>
          <nav className={styles.lateral} aria-label="Carpetas">
            {favoritos.length > 0 && (
              <div className={styles.lateralGrupo}>
                <p className={styles.lateralTitulo}>★ Favoritos</p>
                {favoritos.map((f) => {
                  const esp = ESPACIOS.find((e) => e.id === f.espacio) ?? ESPACIOS[0]
                  return (
                    <div key={`${f.espacio}|${f.ruta}`} className={styles.favorito}>
                      <button type="button" className={styles.favoritoIr} onClick={() => ir(f.espacio, f.ruta)} title={f.ruta}>
                        <IconoCarpeta color={esp.acento} className={styles.favoritoIcono} />
                        <span>{f.nombre}</span>
                      </button>
                      <button
                        type="button"
                        className={styles.favoritoQuitar}
                        aria-label={`Quitar ${f.nombre} de favoritos`}
                        onClick={() => alternar(f)}
                      >
                        ×
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            {ESPACIOS.map((e) => (
              <div key={e.id} className={styles.lateralGrupo}>
                <ArbolCarpetas
                  espacio={e}
                  rutaActual={e.id === espacioId ? rutaActual : null}
                  onNavegar={(r) => ir(e.id, r)}
                  version={version}
                  onSoltar={puedeEscribir ? (rutas, destino) => void moverDesdeArbol(e, rutas, destino) : undefined}
                />
              </div>
            ))}
          </nav>

          <Explorador
            key={`${espacio.id}|${rutaActual}`}
            espacio={espacio}
            ruta={rutaActual}
            onNavegar={(r) => ir(espacio.id, r)}
            version={version}
            onCambio={() => setVersion((v) => v + 1)}
            esAdmin={esAdmin}
            puedeEscribir={puedeEscribir}
            onAbrirPermisos={(r) => setPermisos({ espacioId: espacio.id, ruta: r })}
            esFavorito={esFavorito(espacio.id, rutaActual)}
            onAlternarFavorito={(r, nombre) => alternar({ espacio: espacio.id, ruta: r, nombre })}
            avisar={avisar}
            resaltar={resaltar}
          />

          {esAdmin && permisos && espacioPermisos && (
            <PanelPermisos
              espacio={espacioPermisos}
              ruta={permisos.ruta}
              onCerrar={() => setPermisos(null)}
              onCambio={() => setVersion((v) => v + 1)}
              onIrA={(id, r) => {
                ir(id, r)
                setPermisos({ espacioId: id, ruta: r })
              }}
            />
          )}
        </div>
      </Card>

      <Avisos avisos={avisos} onQuitar={quitar} />
    </div>
  )
}
