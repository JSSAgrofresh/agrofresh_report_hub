import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { ESPACIO_CLIENTE, listarInformesCliente, useAvisos } from '@/features/storage'
import { ArbolCarpetas } from './ArbolCarpetas'
import { Avisos } from './Avisos'
import { Explorador } from './Explorador'
import styles from './StorageView.module.css'

/**
 * Storage de una cuenta de cliente: el mismo explorador que ve el personal de AgroFresh (árbol de carpetas,
 * lista o cuadrícula, vista previa), pero de solo lectura y con una sola raíz: los informes de SU Ship To.
 * El servidor no le deja salir de ahí (`informes_cliente.py`); acá solo se navega, se mira y se descarga.
 */
export function InformesClienteView() {
  const [ruta, setRuta] = useState('')
  const { avisos, avisar, quitar } = useAvisos()

  // Con una sola carpeta (su Ship To) se entra directo, como si fuera la raíz.
  useEffect(() => {
    let vigente = true
    listarInformesCliente('')
      .then((l) => {
        if (vigente && l.entradas.length === 1 && l.entradas[0].tipo === 'carpeta') setRuta(l.entradas[0].ruta)
      })
      .catch(() => undefined)
    return () => {
      vigente = false
    }
  }, [])

  return (
    <div>
      <header className={styles.hero} style={{ '--acento': ESPACIO_CLIENTE.acento } as React.CSSProperties}>
        <div className={styles.heroTexto}>
          <h1 className={styles.heroTitulo}>Storage</h1>
          <p className={styles.heroDescripcion}>{ESPACIO_CLIENTE.descripcion}</p>
        </div>
      </header>

      <Card>
        <div className={styles.pagina} data-con-panel="no">
          <nav className={styles.lateral} aria-label="Carpetas">
            <div className={styles.lateralGrupo}>
              <ArbolCarpetas espacio={ESPACIO_CLIENTE} rutaActual={ruta} onNavegar={setRuta} version={0} />
            </div>
          </nav>

          <Explorador
            key={ruta}
            espacio={ESPACIO_CLIENTE}
            ruta={ruta}
            onNavegar={setRuta}
            version={0}
            onCambio={() => undefined}
            esAdmin={false}
            puedeEscribir={false}
            onAbrirPermisos={() => undefined}
            esFavorito={false}
            onAlternarFavorito={() => undefined}
            avisar={avisar}
            resaltar={null}
          />
        </div>
      </Card>

      <Avisos avisos={avisos} onQuitar={quitar} />
    </div>
  )
}
