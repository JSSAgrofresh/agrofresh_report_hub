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
  const [elegido, setElegido] = useState('')
  const [texto, setTexto] = useState('')
  const [loteEspecies, setLoteEspecies] = useState<string[]>([])

  // Los clientes con acceso van primero (y en verde); el resto, en orden alfabético.
  const ordenados = useMemo(() => {
    const con = (c: string) => {
      const r = resumenDeCliente(accesos, c)
      return r.todo || r.plantas > 0
    }
    return [...clientes].sort((a, b) => Number(con(b)) - Number(con(a)) || a.localeCompare(b, 'es'))
  }, [clientes, accesos])
  // La búsqueda mira el Sold To y también los Ship To (plantas) de cada cliente.
  const palabras = useMemo(() => plano(texto).split(/\s+/).filter(Boolean), [texto])
  const nombresDePlantas = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of plantas) m.set(p.cliente_nombre, `${m.get(p.cliente_nombre) ?? ''} ${plano(p.nombre)}`)
    return m
  }, [plantas])
  const visibles = useMemo(
    () => ordenados.filter((c) => palabras.every((w) => `${plano(c)} ${nombresDePlantas.get(c) ?? ''}`.includes(w))),
    [ordenados, palabras, nombresDePlantas],
  )
  // Si nadie eligió uno todavía, se abre el primero que ya tiene acceso.
  const base =
    elegido ||
    ordenados.find((c) => {
      const r = resumenDeCliente(accesos, c)
      return r.todo || r.plantas > 0
    }) ||
    ''
  // Buscando, si el cliente abierto ya no coincide se pasa al primero que sí.
  const cliente = palabras.length > 0 && !visibles.includes(base) ? (visibles[0] ?? '') : base
  const delCliente = useMemo(
    () =>
      plantas
        .filter((p) => p.cliente_nombre === cliente)
        // Buscando por Ship To (y no por el nombre del cliente), solo se ven las plantas que coinciden.
        .filter((p) => palabras.length === 0 || palabras.every((w) => plano(cliente).includes(w)) || palabras.every((w) => plano(p.nombre).includes(w)))
        .sort(
          (a, b) =>
            Number(especiesDe(accesos, cliente, b.nombre).tiene) - Number(especiesDe(accesos, cliente, a.nombre).tiene) ||
            a.nombre.localeCompare(b.nombre, 'es'),
        ),
    [plantas, cliente, accesos, palabras],
  )
  const todoElSoldTo = cliente ? especiesDe(accesos, cliente, null) : null
  const conAcceso = delCliente.filter((p) => especiesDe(accesos, cliente, p.nombre).tiene).map((p) => p.nombre)

  const elegirCliente = (c: string) => {
    setElegido(c)
    setLoteEspecies([])
  }
  // La casilla ES el acceso: marcarla da todas las especies de esa planta, desmarcarla lo quita.
  const alternarAcceso = (nombre: string) =>
    onChange(fijarEspecies(accesos, cliente, [nombre], conAcceso.includes(nombre) ? [] : 'todas'))
  const alternarLote = (e: string) => setLoteEspecies((a) => (a.includes(e) ? a.filter((x) => x !== e) : [...a, e]))

  const aplicarLote = (valor: string[] | 'todas') => {
    onChange(fijarEspecies(accesos, cliente, conAcceso, valor))
    setLoteEspecies([])
  }
  const marcarTodas = () => {
    const todasConAcceso = conAcceso.length === delCliente.length
    onChange(
      fijarEspecies(
        accesos,
        cliente,
        todasConAcceso ? delCliente.map((p) => p.nombre) : delCliente.map((p) => p.nombre).filter((n) => !conAcceso.includes(n)),
        todasConAcceso ? [] : 'todas',
      ),
    )
  }

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
          placeholder="Buscar Sold To o Ship To…"
          aria-label="Buscar Sold To o Ship To"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <ul className={styles.clientes} aria-label="Clientes">
          {visibles.map((c) => {
            const r = resumenDeCliente(accesos, c)
            const cuenta = r.todo ? 'Todas' : r.plantas
            return (
              <li key={c}>
                <button type="button" className={`${styles.cliente} ${cuenta !== 0 ? styles.conAcceso : ''} ${c === cliente ? styles.sel : ''}`} onClick={() => elegirCliente(c)}>
                  <span>{c}</span>
                  {cuenta !== 0 && <span className={styles.cuenta}>{cuenta}</span>}
                </button>
              </li>
            )
          })}
          {visibles.length === 0 && <li className={styles.vacio}>Ningún Sold To ni Ship To coincide.</li>}
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
                      {conAcceso.length === delCliente.length && delCliente.length > 0 ? 'Quitar todas las plantas' : 'Marcar todas las plantas'}
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
                {conAcceso.length > 1 && (
                  <div className={styles.lote}>
                    <b>
                      {conAcceso.length} plantas con acceso
                    </b>
                    <span>Para dejarles las mismas especies a todas, elígelas y aplica:</span>
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
                        Aplicar a las {conAcceso.length}
                      </button>
                      <button type="button" onClick={() => aplicarLote('todas')}>
                        Todas las especies
                      </button>
                    </div>
                  </div>
                )}
                {delCliente.length === 0 && <p className={styles.vacio}>Este Sold To no tiene plantas en Listados.</p>}
                <ul className={styles.plantas} aria-label="Plantas">
                  {delCliente.map((p) => {
                    const e = especiesDe(accesos, cliente, p.nombre)
                    return (
                      <li key={p.nombre} className={`${styles.planta} ${e.tiene ? styles.conAcceso : ''} `}>
                        <div className={styles.plantaTop}>
                          <label>
                            <input type="checkbox" checked={e.tiene} onChange={() => alternarAcceso(p.nombre)} />
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
