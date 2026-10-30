import { useMemo, useState } from 'react'
import type { PlantaAsignada } from '../types'
import { alternarEspecie, especiesDe, fijarEspecies, resumenDeCliente } from '../lib/accesos'
import styles from './EditorAccesos.module.css'

const plano = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

interface Props {
  clientes: string[]
  /** Plantas del listado: nombre y Sold To al que pertenecen. */
  plantas: { nombre: string; cliente_nombre: string }[]
  especies: string[]
  accesos: PlantaAsignada[]
  onChange: (siguiente: PlantaAsignada[]) => void
}

/** Configura qué ve una cuenta: se elige un Sold To a la izquierda y a la derecha cada planta es una tarjeta con sus
 * especies como botones. Marcando varias plantas se les aplican las mismas especies de una vez. */
export function EditorAccesos({ clientes, plantas, especies, accesos, onChange }: Props) {
  const [cliente, setCliente] = useState('')
  const [texto, setTexto] = useState('')
  const [marcadas, setMarcadas] = useState<string[]>([])
  const [loteEspecies, setLoteEspecies] = useState<string[]>([])

  const visibles = useMemo(() => {
    const palabras = plano(texto).split(/\s+/).filter(Boolean)
    return clientes.filter((c) => palabras.every((w) => plano(c).includes(w)))
  }, [clientes, texto])
  const delCliente = useMemo(
    () => plantas.filter((p) => p.cliente_nombre === cliente).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [plantas, cliente],
  )
  const todoElSoldTo = cliente ? especiesDe(accesos, cliente, null) : null
  const marcadasDelCliente = marcadas.filter((m) => delCliente.some((p) => p.nombre === m))

  const elegirCliente = (c: string) => {
    setCliente(c)
    setMarcadas([])
    setLoteEspecies([])
  }
  const alternarMarca = (nombre: string) => setMarcadas((a) => (a.includes(nombre) ? a.filter((x) => x !== nombre) : [...a, nombre]))
  const alternarLote = (e: string) => setLoteEspecies((a) => (a.includes(e) ? a.filter((x) => x !== e) : [...a, e]))

  const aplicarLote = (valor: string[] | 'todas') => {
    onChange(fijarEspecies(accesos, cliente, marcadasDelCliente, valor))
    setMarcadas([])
    setLoteEspecies([])
  }
  const marcarTodas = () => setMarcadas(marcadasDelCliente.length === delCliente.length ? [] : delCliente.map((p) => p.nombre))

  const chips = (planta: string | null) => {
    const e = especiesDe(accesos, cliente, planta)
    return (
      <div className={styles.chips}>
        <button
          type="button"
          className={`${styles.chip} ${e.todas ? styles.on : ''}`}
          aria-pressed={e.todas}
          onClick={() => onChange(fijarEspecies(accesos, cliente, [planta], e.todas ? [] : 'todas'))}
        >
          Todas las especies
        </button>
        {especies.map((esp) => {
          const activa = e.todas || e.especies.includes(esp)
          return (
            <button
              type="button"
              key={esp}
              className={`${styles.chip} ${activa ? styles.on : ''}`}
              aria-pressed={activa}
              onClick={() => onChange(alternarEspecie(accesos, cliente, planta, esp, especies))}
            >
              {esp}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className={styles.editor}>
      <div className={styles.izq}>
        <input
          type="search"
          className={styles.buscador}
          placeholder="Buscar cliente…"
          aria-label="Buscar cliente"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <ul className={styles.clientes} aria-label="Clientes">
          {visibles.map((c) => {
            const r = resumenDeCliente(accesos, c)
            const cuenta = r.todo ? 'Todas' : r.plantas
            return (
              <li key={c}>
                <button type="button" className={`${styles.cliente} ${c === cliente ? styles.sel : ''}`} onClick={() => elegirCliente(c)}>
                  <span>{c}</span>
                  {cuenta !== 0 && <span className={styles.cuenta}>{cuenta}</span>}
                </button>
              </li>
            )
          })}
          {visibles.length === 0 && <li className={styles.vacio}>Ningún cliente coincide.</li>}
        </ul>
      </div>

      <div className={styles.der}>
        {!cliente ? (
          <p className={styles.vacio}>Elige un cliente a la izquierda para marcar sus plantas y especies.</p>
        ) : (
          <>
            <div className={styles.cabecera}>
              <strong>{cliente}</strong>
              <span className={styles.acciones}>
                {todoElSoldTo?.tiene ? (
                  <button type="button" onClick={() => onChange(fijarEspecies(accesos, cliente, [null], []))}>
                    Elegir plantas a mano
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={() => onChange(fijarEspecies(accesos, cliente, [null], 'todas'))}>
                      Todo el Sold To
                    </button>
                    <button type="button" onClick={marcarTodas} disabled={delCliente.length === 0}>
                      {marcadasDelCliente.length === delCliente.length && delCliente.length > 0 ? 'Desmarcar plantas' : 'Marcar todas las plantas'}
                    </button>
                  </>
                )}
              </span>
            </div>

            {todoElSoldTo?.tiene ? (
              <div className={styles.aviso}>
                <b>Ve todas las plantas de este Sold To</b> (también las que se agreguen después). Especies:
                {chips(null)}
              </div>
            ) : (
              <>
                {marcadasDelCliente.length > 0 && (
                  <div className={styles.lote}>
                    <b>
                      {marcadasDelCliente.length} {marcadasDelCliente.length === 1 ? 'planta marcada' : 'plantas marcadas'}
                    </b>
                    <span>Elige las especies y aplícalas a todas:</span>
                    <div className={styles.chips}>
                      {especies.map((esp) => (
                        <button
                          type="button"
                          key={esp}
                          className={`${styles.chip} ${loteEspecies.includes(esp) ? styles.on : ''}`}
                          aria-pressed={loteEspecies.includes(esp)}
                          onClick={() => alternarLote(esp)}
                        >
                          {esp}
                        </button>
                      ))}
                    </div>
                    <div className={styles.acciones}>
                      <button type="button" className={styles.primario} disabled={loteEspecies.length === 0} onClick={() => aplicarLote(loteEspecies)}>
                        Aplicar a las marcadas
                      </button>
                      <button type="button" onClick={() => aplicarLote('todas')}>
                        Todas las especies
                      </button>
                      <button type="button" onClick={() => aplicarLote([])}>
                        Quitar acceso
                      </button>
                    </div>
                  </div>
                )}
                {delCliente.length === 0 && <p className={styles.vacio}>Este Sold To no tiene plantas en Listados.</p>}
                <ul className={styles.plantas} aria-label="Plantas">
                  {delCliente.map((p) => {
                    const e = especiesDe(accesos, cliente, p.nombre)
                    const marcada = marcadas.includes(p.nombre)
                    return (
                      <li key={p.nombre} className={`${styles.planta} ${marcada ? styles.marcada : ''}`}>
                        <div className={styles.plantaTop}>
                          <label>
                            <input type="checkbox" checked={marcada} onChange={() => alternarMarca(p.nombre)} />
                            <b>{p.nombre}</b>
                          </label>
                          <span className={e.tiene ? styles.cuenta : styles.sin}>
                            {!e.tiene ? 'sin acceso' : e.todas ? 'todas' : `${e.especies.length} ${e.especies.length === 1 ? 'especie' : 'especies'}`}
                          </span>
                        </div>
                        {chips(p.nombre)}
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
