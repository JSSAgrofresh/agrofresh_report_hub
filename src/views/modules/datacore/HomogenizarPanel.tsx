import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import {
  homogenizarValores,
  listarCamposHomogenizables,
  listarValores,
} from '@/features/homogenizar'
import type { CampoHomogenizable, ValorHomogenizable } from '@/features/homogenizar'
import styles from './HomogenizarPanel.module.css'

/**
 * Corrige los datos YA cargados: busca un valor, marca las variantes y las
 * deja todas con un mismo nombre.
 *
 * La selección funciona como en una planilla —clic, Ctrl+clic para sumar de a
 * uno, Shift+clic para un rango— porque es exactamente la tarea que se hacía
 * en Excel antes de que existiera esta pantalla, y esos gestos ya están en los
 * dedos de quien la va a usar.
 */
export function HomogenizarPanel() {
  const [campos, setCampos] = useState<CampoHomogenizable[]>([])
  const [campo, setCampo] = useState('sold_to')
  const [buscar, setBuscar] = useState('')
  const [valores, setValores] = useState<ValorHomogenizable[] | null>(null)
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [destino, setDestino] = useState('')
  const [cargando, setCargando] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  // Ancla del rango para Shift+clic, igual que en una planilla.
  const ancla = useRef<number | null>(null)

  useEffect(() => {
    listarCamposHomogenizables()
      .then(setCampos)
      .catch(() => setCampos([]))
  }, [])

  const refrescar = useCallback(async (c: string, q: string) => {
    setCargando(true)
    try {
      setValores(await listarValores(c, q))
    } catch {
      setValores([])
      setMensaje({ tipo: 'error', texto: 'No se pudieron cargar los valores.' })
    } finally {
      setCargando(false)
    }
  }, [])

  // La búsqueda va al servidor: la lista completa puede tener miles de valores
  // y filtrarla en el navegador obligaría a traerlos todos en cada tecla. El
  // retardo evita una consulta por cada tecla escrita.
  useEffect(() => {
    let vigente = true
    const id = setTimeout(() => {
      if (!vigente) return
      setSeleccion(new Set())
      ancla.current = null
      void refrescar(campo, buscar)
    }, 250)
    return () => {
      vigente = false
      clearTimeout(id)
    }
  }, [campo, buscar, refrescar])

  const filasSeleccionadas = useMemo(
    () => (valores ?? []).filter((v) => seleccion.has(v.valor)).reduce((t, v) => t + v.filas, 0),
    [valores, seleccion],
  )

  function alHacerClic(indice: number, e: React.MouseEvent) {
    const lista = valores ?? []
    const valor = lista[indice].valor
    if (e.shiftKey && ancla.current !== null) {
      const [desde, hasta] = [ancla.current, indice].sort((a, b) => a - b)
      const rango = lista.slice(desde, hasta + 1).map((v) => v.valor)
      setSeleccion((actual) => new Set([...actual, ...rango]))
      return
    }
    ancla.current = indice
    if (e.ctrlKey || e.metaKey) {
      setSeleccion((actual) => {
        const copia = new Set(actual)
        if (copia.has(valor)) copia.delete(valor)
        else copia.add(valor)
        return copia
      })
      return
    }
    // Clic simple sobre algo ya seleccionado y solo: deselecciona.
    setSeleccion((actual) => (actual.size === 1 && actual.has(valor) ? new Set() : new Set([valor])))
  }

  function seleccionarTodo() {
    setSeleccion(new Set((valores ?? []).map((v) => v.valor)))
  }

  /** Propone como destino el valor más usado de la selección: casi siempre es
   * el que está bien escrito, porque es el que más veces se cargó bien. */
  function proponerDestino() {
    const elegidos = (valores ?? []).filter((v) => seleccion.has(v.valor))
    if (elegidos.length) setDestino(elegidos.reduce((a, b) => (b.filas > a.filas ? b : a)).valor)
  }

  async function aplicar() {
    const objetivo = destino.trim()
    if (!objetivo || seleccion.size === 0) return
    const aCambiar = [...seleccion].filter((v) => v !== objetivo)
    if (aCambiar.length === 0) {
      setMensaje({ tipo: 'error', texto: 'Los valores elegidos ya se llaman así.' })
      return
    }
    const resumen = aCambiar.length === 1 ? `“${aCambiar[0]}”` : `${aCambiar.length} valores`
    if (!confirm(`¿Dejar ${resumen} como “${objetivo}”? Cambia los datos ya guardados.`)) return

    setCargando(true)
    setMensaje(null)
    try {
      const r = await homogenizarValores(campo, [...seleccion], objetivo)
      setMensaje({
        tipo: 'ok',
        texto: `${r.actualizadas.toLocaleString('es-CL')} solicitud(es) quedaron como “${r.destino}”.`,
      })
      setSeleccion(new Set())
      setDestino('')
      ancla.current = null
      await refrescar(campo, buscar)
    } catch {
      setMensaje({ tipo: 'error', texto: 'No se pudo aplicar el cambio.' })
    } finally {
      setCargando(false)
    }
  }

  const lista = valores ?? []

  return (
    <Card>
      <div className={styles.barra}>
        <label className={styles.campo}>
          <span>Campo</span>
          <select value={campo} onChange={(e) => setCampo(e.target.value)}>
            {campos.map((c) => (
              <option key={c.campo} value={c.campo}>
                {c.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.campo}>
          <span>Buscar</span>
          <input
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Ej. dole — encuentra todas sus variantes"
          />
        </label>
        <div className={styles.contador}>
          {cargando ? 'Cargando…' : `${lista.length} valor(es)`}
          {seleccion.size > 0 && (
            <strong>
              {' · '}
              {seleccion.size} elegido(s), {filasSeleccionadas.toLocaleString('es-CL')} solicitud(es)
            </strong>
          )}
        </div>
      </div>

      <p className={styles.ayuda}>
        Clic para elegir uno · Ctrl+clic para sumar de a uno · Shift+clic para un rango
      </p>

      <div className={styles.tablaCaja}>
        <table className={styles.tabla}>
          <thead>
            <tr>
              <th className={styles.colCheck}>
                <input
                  type="checkbox"
                  checked={lista.length > 0 && seleccion.size === lista.length}
                  onChange={(e) => (e.target.checked ? seleccionarTodo() : setSeleccion(new Set()))}
                  aria-label="Elegir todos"
                />
              </th>
              <th>Valor actual</th>
              <th className={styles.colNum}>Solicitudes</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((v, i) => (
              <tr
                key={v.valor}
                className={seleccion.has(v.valor) ? styles.filaElegida : undefined}
                onClick={(e) => alHacerClic(i, e)}
              >
                <td className={styles.colCheck}>
                  <input type="checkbox" readOnly checked={seleccion.has(v.valor)} tabIndex={-1} />
                </td>
                <td className={styles.valor}>{v.valor}</td>
                <td className={styles.colNum}>{v.filas.toLocaleString('es-CL')}</td>
              </tr>
            ))}
            {!cargando && lista.length === 0 && (
              <tr>
                <td colSpan={3} className={styles.vacio}>
                  {buscar ? `Sin resultados para “${buscar}”.` : 'No hay valores cargados.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.acciones}>
        <label className={styles.campoDestino}>
          <span>Dejar todos como</span>
          <input
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            placeholder="Escribe el nombre definitivo"
            disabled={seleccion.size === 0}
          />
        </label>
        <Button variant="secondary" onClick={proponerDestino} disabled={seleccion.size === 0}>
          Usar el más frecuente
        </Button>
        <Button onClick={() => void aplicar()} disabled={cargando || !destino.trim() || seleccion.size === 0}>
          {cargando ? 'Aplicando…' : 'Homogeneizar'}
        </Button>
      </div>

      {mensaje && (
        <p className={mensaje.tipo === 'ok' ? styles.exito : styles.error}>{mensaje.texto}</p>
      )}
    </Card>
  )
}
