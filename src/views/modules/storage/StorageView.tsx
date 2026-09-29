import { useState } from 'react'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { ESPACIOS, mover } from '@/features/storage'
import type { Espacio } from '@/features/storage'
import { ArbolCarpetas } from './ArbolCarpetas'
import { Explorador } from './Explorador'
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
  const [avisoArbol, setAvisoArbol] = useState<string | null>(null)

  const esAdmin = user?.tipoAcceso === 'admin_general'
  // Gerencia mira todo, pero no modifica nada.
  const puedeEscribir = user?.tipoAcceso !== 'gerencia'
  const espacio = ESPACIOS.find((e) => e.id === espacioId) ?? ESPACIOS[0]
  const espacioPermisos = ESPACIOS.find((e) => e.id === permisos?.espacioId)

  function ir(id: Espacio['id'], nuevaRuta: string) {
    setEspacioId(id)
    setRuta(nuevaRuta)
  }

  async function moverDesdeArbol(rutas: string[], destino: string) {
    setAvisoArbol(null)
    const fallos: string[] = []
    for (const r of rutas) {
      if (r === destino || destino.startsWith(r + '/')) continue
      try {
        await mover(r, destino)
      } catch {
        fallos.push(r.split('/').pop() ?? r)
      }
    }
    setVersion((v) => v + 1)
    if (fallos.length) setAvisoArbol(`No se pudo mover: ${fallos.join(', ')}.`)
  }

  return (
    <div>
      <Header title="Storage" description={espacio.descripcion} />

      <Card>
        <div className={styles.pagina} data-con-panel={permisos && esAdmin ? 'si' : 'no'}>
          <nav className={styles.lateral} aria-label="Carpetas">
            {ESPACIOS.map((e) => (
              <div key={e.id} className={styles.lateralGrupo}>
                <ArbolCarpetas
                  espacio={e}
                  rutaActual={e.id === espacioId ? ruta : null}
                  onNavegar={(r) => ir(e.id, r)}
                  version={version}
                  onSoltar={e.editable && puedeEscribir ? (rutas, destino) => void moverDesdeArbol(rutas, destino) : undefined}
                />
              </div>
            ))}
            {avisoArbol && <p className={styles.error}>{avisoArbol}</p>}
          </nav>

          <Explorador
            key={`${espacio.id}|${ruta}`}
            espacio={espacio}
            ruta={ruta || espacio.raiz}
            onNavegar={(r) => ir(espacio.id, r)}
            version={version}
            onCambio={() => setVersion((v) => v + 1)}
            esAdmin={esAdmin}
            puedeEscribir={puedeEscribir}
            onAbrirPermisos={(r) => setPermisos({ espacioId: espacio.id, ruta: r })}
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
    </div>
  )
}
