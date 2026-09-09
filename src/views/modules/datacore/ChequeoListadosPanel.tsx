import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { BuscableSelect } from '@/components/ui/BuscableSelect'
import { auditarListados } from '@/features/auditoria'
import type { GrupoFueraDeListados } from '@/features/auditoria'
import { listarClientes, listarPlantas } from '@/features/catalogo'
import { listarEspeciesActivas, listarValores } from '@/features/listados'
import { homogenizarValores } from '@/features/homogenizar'
import styles from './ChequeoListadosPanel.module.css'

/** campo del chequeo (columna real de `solicitud`) -> campo que espera
 * `/api/homogenizar/{campo}` (nombres cortos, sin `_raw`). */
const CAMPO_HOMOGENIZAR: Record<GrupoFueraDeListados['campo'], string> = {
  sold_to_raw: 'sold_to',
  ship_to_raw: 'ship_to',
  especie: 'especie',
  variedad: 'variedad',
}

function claveGrupo(g: GrupoFueraDeListados, indice: number): string {
  return `${g.campo}-${g.contexto ?? ''}-${indice}`
}

/**
 * "Chequeo de integridad": compara Sold To/Ship To/Especie/Variedad de lo
 * que YA está guardado en la base contra los valores vigentes de Listados, y
 * deja asignar a mano (o con sugerencia automática) lo que no calce.
 *
 * A diferencia de "Homogeneizar datos" (que unifica variantes ya detectadas
 * entre sí dentro de la base), esto detecta valores que están escritos
 * siempre igual pero que Listados ya no reconoce -típicamente porque un
 * estándar se renombró después de que estas filas se cargaron-.
 */
export function ChequeoListadosPanel() {
  const [grupos, setGrupos] = useState<GrupoFueraDeListados[] | null>(null)
  const [cargando, setCargando] = useState(false)
  const [aplicando, setAplicando] = useState<string | null>(null)
  const [destinos, setDestinos] = useState<Record<string, string>>({})
  const [sugeridas, setSugeridas] = useState<Set<string>>(new Set())
  const [aplicadas, setAplicadas] = useState<string[]>([])
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const [clientes, setClientes] = useState<string[]>([])
  const [plantasPorCliente, setPlantasPorCliente] = useState<Record<string, string[]>>({})
  const [especies, setEspecies] = useState<string[]>([])
  const [variedadesPorEspecie, setVariedadesPorEspecie] = useState<Record<string, string[]>>({})

  useEffect(() => {
    Promise.all([
      listarClientes(),
      listarPlantas(),
      listarEspeciesActivas(),
      listarValores('variedad'),
    ]).then(([clientesResp, plantasResp, especiesResp, variedadesResp]) => {
      setClientes(clientesResp.filter((c) => c.activo).map((c) => c.nombre))
      const porCliente: Record<string, string[]> = {}
      for (const p of plantasResp) {
        if (!p.activo) continue
        ;(porCliente[p.cliente_nombre] ??= []).push(p.nombre)
      }
      setPlantasPorCliente(porCliente)
      setEspecies(especiesResp.map((e) => e.valor))
      const idAEspecie = new Map(especiesResp.map((e) => [e.id, e.valor]))
      const porEspecie: Record<string, string[]> = {}
      for (const v of variedadesResp) {
        if (!v.activo || !v.es_estandar || v.especie_id == null) continue
        const nombreEspecie = idAEspecie.get(v.especie_id)
        if (!nombreEspecie) continue
        ;(porEspecie[nombreEspecie] ??= []).push(v.valor)
      }
      setVariedadesPorEspecie(porEspecie)
    })
  }, [])

  async function chequear() {
    setCargando(true)
    setMensaje(null)
    try {
      const r = await auditarListados()
      setGrupos(r.grupos)
      setDestinos({})
      setSugeridas(new Set())
      setAplicadas([])
    } catch {
      setMensaje({ tipo: 'error', texto: 'No se pudo revisar la base. Intenta de nuevo.' })
    } finally {
      setCargando(false)
    }
  }

  // No llama a `chequear` (que empieza con un `setCargando(true)` síncrono):
  // dentro de un efecto, React exige que el setState quede dentro del
  // callback async, no en la misma pasada de montaje.
  useEffect(() => {
    let vigente = true
    auditarListados()
      .then((r) => {
        if (!vigente) return
        setGrupos(r.grupos)
      })
      .catch(() => {
        if (vigente) setMensaje({ tipo: 'error', texto: 'No se pudo revisar la base. Intenta de nuevo.' })
      })
    return () => {
      vigente = false
    }
  }, [])

  /** "Homogenizador inteligente": precarga la sugerencia de cada grupo como
   * destino y lo marca amarillo -pendiente de confirmar-. No escribe nada en
   * la base todavía: cada tarjeta se confirma (o se corrige) a mano. */
  function sugerirTodo() {
    if (!grupos) return
    const nuevosDestinos: Record<string, string> = { ...destinos }
    const nuevasSugeridas = new Set(sugeridas)
    grupos.forEach((g, i) => {
      if (!g.sugerido) return
      const clave = claveGrupo(g, i)
      nuevosDestinos[clave] = g.sugerido
      nuevasSugeridas.add(clave)
    })
    setDestinos(nuevosDestinos)
    setSugeridas(nuevasSugeridas)
  }

  function elegir(clave: string, valor: string) {
    setDestinos((d) => ({ ...d, [clave]: valor }))
    setSugeridas((s) => {
      if (!s.has(clave)) return s
      const copia = new Set(s)
      copia.delete(clave)
      return copia
    })
  }

  async function confirmar(grupo: GrupoFueraDeListados, indice: number) {
    const clave = claveGrupo(grupo, indice)
    const destino = (destinos[clave] ?? grupo.sugerido).trim()
    if (!destino) return
    setAplicando(clave)
    setMensaje(null)
    try {
      const r = await homogenizarValores(
        CAMPO_HOMOGENIZAR[grupo.campo],
        grupo.valores,
        destino,
        grupo.contexto,
      )
      setAplicadas((a) => [...a, clave])
      setGrupos((actual) => (actual ?? []).filter((_g, i) => claveGrupo(_g, i) !== clave))
      setMensaje({
        tipo: 'ok',
        texto: `“${grupo.valores[0]}” → “${destino}”: ${r.actualizadas.toLocaleString('es-CL')} solicitud(es) actualizadas.`,
      })
    } catch {
      setMensaje({ tipo: 'error', texto: 'No se pudo aplicar esta homologación.' })
    } finally {
      setAplicando(null)
    }
  }

  async function confirmarSugeridas() {
    if (!grupos) return
    const pendientes = grupos
      .map((g, i) => ({ g, i, clave: claveGrupo(g, i) }))
      .filter(({ clave }) => sugeridas.has(clave))
    for (const { g, i } of pendientes) {
      await confirmar(g, i)
    }
  }

  function opcionesPara(grupo: GrupoFueraDeListados): string[] {
    switch (grupo.campo) {
      case 'sold_to_raw':
        return clientes
      case 'ship_to_raw':
        return grupo.contexto ? (plantasPorCliente[grupo.contexto] ?? []) : []
      case 'especie':
        return especies
      case 'variedad':
        return grupo.contexto ? (variedadesPorEspecie[grupo.contexto] ?? []) : []
    }
  }

  const totalFilas = useMemo(
    () => (grupos ?? []).reduce((t, g) => t + g.filas, 0),
    [grupos],
  )

  return (
    <Card>
      <div className={styles.cabecera}>
        <div>
          <h2 className={styles.titulo}>Chequeo de integridad contra Listados</h2>
          <p className={styles.ayuda}>
            Compara Sold To, Ship To, Especie y Variedad de lo que ya está guardado contra los
            valores vigentes de Listados. Sirve tanto recién después de una ingesta como en
            cualquier momento, para auditar lo que ya existe.
          </p>
        </div>
        <div className={styles.accionesCabecera}>
          <Button variant="secondary" disabled={cargando} onClick={() => void chequear()}>
            {cargando ? 'Revisando…' : 'Chequear integridad de datos'}
          </Button>
          <Button
            variant="secondary"
            disabled={cargando || !grupos?.some((g) => g.sugerido)}
            onClick={sugerirTodo}
          >
            Homogenizador inteligente
          </Button>
        </div>
      </div>

      {mensaje && (
        <p className={mensaje.tipo === 'ok' ? styles.exito : styles.error}>{mensaje.texto}</p>
      )}

      {grupos && grupos.length > 0 && (
        <div className={styles.resumen}>
          <span>
            <b>{grupos.length}</b> valor(es) sin resolver
          </span>
          <span>
            <b>{totalFilas.toLocaleString('es-CL')}</b> solicitud(es) afectadas
          </span>
          {sugeridas.size > 0 && (
            <Button disabled={aplicando !== null} onClick={() => void confirmarSugeridas()}>
              Confirmar {sugeridas.size} sugerida(s)
            </Button>
          )}
        </div>
      )}

      {cargando && !grupos && <p className={styles.vacio}>Revisando la base…</p>}

      {grupos && grupos.length === 0 && (
        <p className={styles.vacio}>Todo lo que hay en la base calza con Listados. ✓</p>
      )}

      {aplicadas.length > 0 && (
        <ul className={styles.listaAplicadas}>
          {aplicadas.map((clave) => (
            <li key={clave} className={styles.itemAplicado}>
              ✓ {clave}
            </li>
          ))}
        </ul>
      )}

      {grupos && grupos.length > 0 && (
        <div className={styles.grilla}>
          {grupos.map((grupo, i) => {
            const clave = claveGrupo(grupo, i)
            const destino = destinos[clave] ?? grupo.sugerido
            const esSugerido = sugeridas.has(clave)
            return (
              <div
                key={clave}
                className={esSugerido ? `${styles.tarjeta} ${styles.tarjetaSugerida}` : styles.tarjeta}
              >
                <p className={styles.campoTarjeta}>
                  {grupo.etiqueta}
                  {grupo.contexto && <span className={styles.contexto}> · {grupo.contexto}</span>}
                </p>
                <p className={styles.valorOriginal}>
                  <code>{grupo.valores[0]}</code>
                  <span className={styles.filas}>{grupo.filas} fila(s)</span>
                </p>

                {grupo.sugerencias.length > 0 && (
                  <div className={styles.sugerencias}>
                    {grupo.sugerencias.map((s) => (
                      <button
                        type="button"
                        key={s.valor}
                        className={styles.chipSugerencia}
                        onClick={() => elegir(clave, s.valor)}
                      >
                        {s.valor} · {Math.round(s.confianza * 100)}%
                      </button>
                    ))}
                  </div>
                )}

                <BuscableSelect
                  etiqueta="Valor de Listados"
                  opciones={opcionesPara(grupo)}
                  valor={destino}
                  onChange={(v) => elegir(clave, v)}
                  placeholderTodos="— elegir valor —"
                />

                <Button
                  disabled={aplicando !== null || !destino.trim()}
                  onClick={() => void confirmar(grupo, i)}
                >
                  {aplicando === clave ? 'Aplicando…' : esSugerido ? 'Confirmar sugerencia' : 'Confirmar'}
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
