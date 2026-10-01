import { Button } from '@/components/ui/Button'
import { IconoAlerta } from '@/components/ui/iconosAccion'
import {
  CAMPOS_INTERNOS, CATEGORIAS, ETIQUETA_VIA, INFO_CAMPO, clavePlanta, claveCelda, listaDe, listaGeneral, valorMostrado,
} from '@/features/listasDistribucion'
import type { CampoLista, FilaEstado, PlantaLista, PlantaNueva, Propuestas } from '@/features/listasDistribucion'
import { CeldaLista } from './CeldaLista'
import styles from './TablaListas.module.css'

export type Destino =
  | { tipo: 'fila'; fila: FilaEstado; campos: CampoLista[] }
  | { tipo: 'nueva'; id: string; campos: CampoLista[] }

interface Props {
  filas: FilaEstado[]
  nuevas: PlantaNueva[]
  propuestas: Propuestas
  separadas: Set<string>
  onEditar: (ancla: DOMRect, destino: Destino) => void
  onAceptar: (destino: Destino) => void
  onRechazar: (destino: Destino) => void
  onSeparar: (plantaClave: string) => void
  onAceptarNueva: (id: string) => void
  onQuitarNueva: (id: string) => void
  onCrearEnListados: (id: string, crear: boolean) => void
  onUsarSugerencia: (id: string, planta: PlantaLista) => void
}

/** La tabla dinámica: una fila por planta, una columna por rol y por especie. */
export function TablaListas({
  filas, nuevas, propuestas, separadas, onEditar, onAceptar, onRechazar, onSeparar,
  onAceptarNueva, onQuitarNueva, onCrearEnListados, onUsarSugerencia,
}: Props) {
  return (
    <div className={styles.scroll} role="region" aria-label="Tabla de listas de distribución" tabIndex={0}>
      <table className={styles.tabla}>
        <thead>
          <tr className={styles.grupos}>
            <th colSpan={2} className={`${styles.pegada} ${styles.pegada1}`}>Planta</th>
            <th colSpan={3}>Equipo AgroFresh · siempre en copia</th>
            <th colSpan={CATEGORIAS.length}>Cliente · recibe los resultados (Para), según la especie de la muestra</th>
          </tr>
          <tr>
            <th className={`${styles.pegada} ${styles.pegada1}`}>Cliente (Sold To)</th>
            <th className={`${styles.pegada} ${styles.pegada2}`}>Planta (Ship To)</th>
            {[...CAMPOS_INTERNOS, ...CATEGORIAS].map((c) => (
              <th key={c} title={INFO_CAMPO[c].ayuda}>
                {INFO_CAMPO[c].titulo}
                <span className={`${styles.via} ${styles[INFO_CAMPO[c].via]}`}>{ETIQUETA_VIA[INFO_CAMPO[c].via]}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {nuevas.map((n) => {
            const estado = n.estado
            const destino = (campos: CampoLista[]): Destino => ({ tipo: 'nueva', id: n.id, campos })
            const mostrar = (c: CampoLista) => listaDe(n.fila, c)
            const general = listaGeneral(mostrar)
            const vacias = CATEGORIAS.every((c) => mostrar(c).length === 0)
            return (
              <tr key={`nueva-${n.id}`} className={`${styles.fila} ${styles.filaNueva}`}>
                <td className={`${styles.celdaNombre} ${styles.pegada} ${styles.pegada1}`}>{n.sold_to}</td>
                <td className={`${styles.celdaNombre} ${styles.pegada} ${styles.pegada2}`}>
                  <div className={styles.nombre}>
                  <strong>{n.ship_to}</strong>
                  <span className={styles.etiquetaNueva}>Planta nueva</span>
                  {n.existeEnListados ? (
                    <span className={styles.ok}>✓ Existe en Listados</span>
                  ) : (
                    <>
                      <span className={styles.aviso}><IconoAlerta width={13} height={13} /> No existe en Listados con ese nombre</span>
                      <label className={styles.crear}>
                        <input type="checkbox" checked={n.crearEnListados} onChange={(e) => onCrearEnListados(n.id, e.target.checked)} />
                        Crearla también en Listados al guardar
                      </label>
                      {n.sugerencias.length > 0 && (
                        <span className={styles.sugerencias}>
                          ¿Es una de estas?
                          {n.sugerencias.map((s) => (
                            <button key={s.sold_to + s.ship_to} type="button" onClick={() => onUsarSugerencia(n.id, s)} title={`Usar el nombre de Listados: ${s.ship_to} (${s.sold_to})`}>
                              Usar «{s.ship_to}» <i>{s.sold_to}</i>
                            </button>
                          ))}
                        </span>
                      )}
                    </>
                  )}
                  <span className={styles.filaAcciones}>
                    {estado === 'pendiente' && <Button onClick={() => onAceptarNueva(n.id)}>Aceptar planta</Button>}
                    {estado === 'aceptada' && <span className={styles.ok}>✓ Aceptada: se guardará</span>}
                    <Button variant="ghost" onClick={() => onQuitarNueva(n.id)}>Quitar</Button>
                  </span>
                  </div>
                </td>
                {[...CAMPOS_INTERNOS].map((c) => (
                  <CeldaLista key={c} campo={c} guardado={[]} mostrado={mostrar(c)} estado={estado} origen={n.origen} ajustar={[]} copiaMal={[]}
                    critica={false} etiqueta={`${n.ship_to} · ${INFO_CAMPO[c].titulo}`} onEditar={(a) => onEditar(a, destino([c]))} />
                ))}
                {general || vacias ? (
                  <CeldaLista campo={CATEGORIAS[0]} guardado={[]} mostrado={general ?? []} estado={estado} origen={n.origen} ajustar={[]} copiaMal={[]}
                    critica={false} colSpan={CATEGORIAS.length} etiqueta={`${n.ship_to} · todas las especies`}
                    onEditar={(a) => onEditar(a, destino([...CATEGORIAS]))} />
                ) : (
                  CATEGORIAS.map((c) => (
                    <CeldaLista key={c} campo={c} guardado={[]} mostrado={mostrar(c)} estado={estado} origen={n.origen} ajustar={[]} copiaMal={[]}
                      critica={false} etiqueta={`${n.ship_to} · ${c}`} onEditar={(a) => onEditar(a, destino([c]))} />
                  ))
                )}
              </tr>
            )
          })}

          {filas.map((f) => {
            const k = clavePlanta(f.sold_to, f.ship_to)
            const mostrar = (c: CampoLista) => valorMostrado(f, c, propuestas)
            const prop = (c: CampoLista) => propuestas[claveCelda(k, c)]
            const destino = (campos: CampoLista[]): Destino => ({ tipo: 'fila', fila: f, campos })
            const separada = separadas.has(k)
            const general = separada ? null : listaGeneral(mostrar)
            const vacias = !separada && CATEGORIAS.every((c) => mostrar(c).length === 0)
            const propsCat = CATEGORIAS.map(prop).filter(Boolean)
            const estadoGeneral = propsCat.some((p) => p?.estado === 'pendiente') ? 'pendiente' : propsCat.length ? 'aceptada' : undefined
            const agrupable = separada && listaGeneral(mostrar) !== null
            return (
              <tr key={k} className={`${styles.fila} ${f.sin_contactos ? styles.sinContactos : ''}`}>
                <td className={`${styles.celdaNombre} ${styles.pegada} ${styles.pegada1}`}>{f.sold_to}</td>
                <td className={`${styles.celdaNombre} ${styles.pegada} ${styles.pegada2}`}>
                  <div className={styles.nombre}>
                  <strong>{f.ship_to}</strong>
                  {f.en_listados === false && (
                    <span className={styles.aviso} title="Este nombre no existe en Listados: las solicitudes no encontrarán estos contactos.">
                      <IconoAlerta width={13} height={13} /> Fuera de Listados
                    </span>
                  )}
                  {f.sin_contactos && <span className={styles.sinLista}>En Listados, sin lista</span>}
                  {!separada && (general || vacias) && (
                    <button type="button" className={styles.separar} onClick={() => onSeparar(k)}>▸ Separar por especie</button>
                  )}
                  {agrupable && <button type="button" className={styles.separar} onClick={() => onSeparar(k)}>◂ Agrupar especies</button>}
                  </div>
                </td>
                {CAMPOS_INTERNOS.map((c) => (
                  <CeldaLista key={c} campo={c} guardado={listaDe(f, c)} mostrado={mostrar(c)} estado={prop(c)?.estado} origen={prop(c)?.origen}
                    ajustar={prop(c)?.ajustarCopia ?? []} copiaMal={f.copia_mal[c]}
                    critica={!f.sin_contactos && c !== 'admin'} etiqueta={`${f.ship_to} · ${INFO_CAMPO[c].titulo}`}
                    onEditar={(a) => onEditar(a, destino([c]))} onAceptar={() => onAceptar(destino([c]))} onRechazar={() => onRechazar(destino([c]))} />
                ))}
                {general || vacias ? (
                  <CeldaLista campo={CATEGORIAS[0]} guardado={listaDe(f, CATEGORIAS[0])} mostrado={general ?? []} estado={estadoGeneral}
                    origen={propsCat[0]?.origen} ajustar={[]} copiaMal={[]} critica={!f.sin_contactos} colSpan={CATEGORIAS.length}
                    etiqueta={`${f.ship_to} · todas las especies`}
                    onEditar={(a) => onEditar(a, destino([...CATEGORIAS]))} onAceptar={() => onAceptar(destino([...CATEGORIAS]))}
                    onRechazar={() => onRechazar(destino([...CATEGORIAS]))} />
                ) : (
                  CATEGORIAS.map((c) => (
                    <CeldaLista key={c} campo={c} guardado={listaDe(f, c)} mostrado={mostrar(c)} estado={prop(c)?.estado} origen={prop(c)?.origen}
                      ajustar={[]} copiaMal={[]} critica={false} etiqueta={`${f.ship_to} · ${c}`}
                      onEditar={(a) => onEditar(a, destino([c]))} onAceptar={() => onAceptar(destino([c]))} onRechazar={() => onRechazar(destino([c]))} />
                  ))
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
