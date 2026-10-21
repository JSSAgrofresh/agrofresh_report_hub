import { useEffect, useState } from 'react'
import { BuscableSelect } from '@/components/ui/BuscableSelect'
import { aceptarInforme, homogeneizacionInforme } from '@/features/correoInformes'
import type { CorreccionesHomogeneizacion, Homogeneizacion } from '@/features/correoInformes'
import styles from './HomogeneizarInforme.module.css'

type Campo = 'sold_to' | 'ship_to' | 'especie' | 'variedad'

interface Props {
  id: number
  onAceptado: (avisos: string[]) => void
}

/**
 * Lo mismo que hace el Converter con los cuatro datos de Listados: muestra lo que el informe trae y, si no calza,
 * se elige el valor oficial a mano. «Aceptar» carga el informe con esos valores y el sistema los recuerda.
 */
export function HomogeneizarInforme({ id, onAceptado }: Props) {
  const [h, setH] = useState<Homogeneizacion | null>(null)
  const [valores, setValores] = useState<Record<Campo, string> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    let vigente = true
    homogeneizacionInforme(id)
      .then((r) => {
        if (!vigente) return
        setH(r)
        setValores(r.campos)
      })
      .catch((e: unknown) => {
        if (vigente) setError(e instanceof Error ? e.message : 'No se pudo leer el informe.')
      })
    return () => {
      vigente = false
    }
  }, [id])

  if (!h || !valores) return error ? <p className={styles.error}>{error}</p> : <p className={styles.nota}>Leyendo el informe…</p>

  const op = h.opciones
  const planta = op.ship_to[valores.sold_to] ?? []
  const variedades = op.variedad[valores.especie] ?? []
  const cambiar = (campo: Campo, valor: string) => {
    setValores((v) => {
      const nuevo = { ...(v as Record<Campo, string>), [campo]: valor }
      // Al cambiar el Sold To o la especie, lo que dependía de ellos ya no vale.
      if (campo === 'sold_to' && !(op.ship_to[valor] ?? []).includes(nuevo.ship_to)) nuevo.ship_to = ''
      if (campo === 'especie' && !(op.variedad[valor] ?? []).includes(nuevo.variedad)) nuevo.variedad = ''
      return nuevo
    })
  }

  async function aceptar() {
    if (!valores || !h) return
    setOcupado(true)
    setError(null)
    // Solo se mandan los que cambiaron respecto de lo que el sistema propuso.
    const cambios: CorreccionesHomogeneizacion = {}
    for (const c of ['sold_to', 'ship_to', 'especie', 'variedad'] as Campo[]) if (valores[c] !== h.campos[c]) cambios[c] = valores[c]
    try {
      const r = await aceptarInforme(id, cambios)
      onAceptado(r.avisos)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo aceptar.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className={styles.caja}>
      <h4 className={styles.titulo}>Homogeneizar con Listados</h4>
      {h.motivos.length > 0 && (
        <ul className={styles.motivos}>
          {h.motivos.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
      {h.aprendidos.length > 0 && (
        <p className={styles.nota}>Ya corregido solo por lo aprendido: {h.aprendidos.map((a) => `${a.antes} → ${a.despues}`).join(' · ')}</p>
      )}
      <div className={styles.campos}>
        <BuscableSelect etiqueta="Sold To" opciones={op.sold_to} valor={valores.sold_to} onChange={(v) => cambiar('sold_to', v)} placeholderTodos="Elige el Sold To" />
        <BuscableSelect etiqueta="Ship To" opciones={planta} valor={valores.ship_to} onChange={(v) => cambiar('ship_to', v)} placeholderTodos="Elige el Ship To" disabled={!valores.sold_to} />
        <BuscableSelect etiqueta="Especie" opciones={op.especie} valor={valores.especie} onChange={(v) => cambiar('especie', v)} placeholderTodos="Elige la especie" />
        <BuscableSelect etiqueta="Variedad" opciones={variedades} valor={valores.variedad} onChange={(v) => cambiar('variedad', v)} placeholderTodos="Sin variedad" disabled={!valores.especie} />
      </div>
      <p className={styles.nota}>Leído en el PDF: {Object.values(h.leidos).filter(Boolean).join(' · ') || '—'}</p>
      {error && <p className={styles.error}>{error}</p>}
      <button type="button" className={styles.aceptar} disabled={ocupado || !valores.sold_to || !valores.ship_to || !valores.especie} onClick={() => void aceptar()}>
        {ocupado ? 'Cargando…' : 'Aceptar con estos valores'}
      </button>
    </div>
  )
}
