import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { aplicarHomogenizacion, candidatosHomogenizacion } from '../lib/api'
import type { GrupoHomogenizacion, TipoListado } from '../lib/tipos'
import styles from './HomogenizarPanel.module.css'

interface EstadoGrupo {
  grupo: GrupoHomogenizacion
  seleccionados: Set<number>
  valorPropuesto: string
  aplicando: boolean
  aplicado: boolean
  error: string | null
}

interface HomogenizarPanelProps {
  tipo: TipoListado
  onCerrar: () => void
  onAplicado: () => void
}

export function HomogenizarPanel({ tipo, onCerrar, onAplicado }: HomogenizarPanelProps) {
  const [grupos, setGrupos] = useState<EstadoGrupo[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    candidatosHomogenizacion(tipo)
      .then((datos) =>
        setGrupos(
          datos.map((grupo) => ({
            grupo,
            seleccionados: new Set(grupo.valores.map((v) => v.id)),
            valorPropuesto: grupo.valor_propuesto,
            aplicando: false,
            aplicado: false,
            error: null,
          })),
        ),
      )
      .catch(() => setError('No se pudieron calcular los candidatos a homogenizar.'))
  }, [tipo])

  function alternarMiembro(indice: number, id: number) {
    setGrupos((actual) => {
      if (!actual) return actual
      const copia = [...actual]
      const seleccionados = new Set(copia[indice].seleccionados)
      if (seleccionados.has(id)) seleccionados.delete(id)
      else seleccionados.add(id)
      copia[indice] = { ...copia[indice], seleccionados }
      return copia
    })
  }

  function cambiarPropuesto(indice: number, valor: string) {
    setGrupos((actual) => {
      if (!actual) return actual
      const copia = [...actual]
      copia[indice] = { ...copia[indice], valorPropuesto: valor }
      return copia
    })
  }

  async function aplicar(indice: number) {
    if (!grupos) return
    const estado = grupos[indice]
    const ids = [...estado.seleccionados]
    if (ids.length < 2) {
      setGrupos((actual) => {
        if (!actual) return actual
        const copia = [...actual]
        copia[indice] = { ...copia[indice], error: 'Selecciona al menos 2 valores para fusionar.' }
        return copia
      })
      return
    }
    setGrupos((actual) => {
      if (!actual) return actual
      const copia = [...actual]
      copia[indice] = { ...copia[indice], aplicando: true, error: null }
      return copia
    })
    try {
      await aplicarHomogenizacion(tipo, ids, estado.valorPropuesto)
      setGrupos((actual) => {
        if (!actual) return actual
        const copia = [...actual]
        copia[indice] = { ...copia[indice], aplicando: false, aplicado: true }
        return copia
      })
      onAplicado()
    } catch {
      setGrupos((actual) => {
        if (!actual) return actual
        const copia = [...actual]
        copia[indice] = { ...copia[indice], aplicando: false, error: 'No se pudo aplicar la homogenización.' }
        return copia
      })
    }
  }

  return (
    <div className={styles.contenedor}>
      <p className={styles.intro}>
        Grupos de valores que probablemente son el mismo dato escrito de forma distinta. Revisa cada grupo, ajusta
        el valor estándar si hace falta y confirma para fusionarlos. Nada se aplica hasta que lo confirmes.
      </p>

      {error && <p className={styles.estadoError}>{error}</p>}
      {grupos === null && !error && <p className={styles.estado}>Calculando candidatos…</p>}
      {grupos !== null && grupos.length === 0 && (
        <p className={styles.vacio}>No se encontraron valores candidatos a homogenizar.</p>
      )}

      {grupos?.map((estado, indice) => (
        <div className={styles.grupo} key={indice}>
          <div className={styles.grupoCabecera}>
            <Badge tone={estado.grupo.confianza === 'alta' ? 'success' : 'warning'}>
              {estado.grupo.confianza === 'alta' ? 'Alta confianza' : 'A revisar'}
            </Badge>
            {estado.aplicado && <span className={styles.aplicado}>Fusionado ✓</span>}
          </div>

          <div className={styles.miembros}>
            {estado.grupo.valores.map((v) => (
              <label className={styles.miembro} key={v.id}>
                <input
                  type="checkbox"
                  checked={estado.seleccionados.has(v.id)}
                  disabled={estado.aplicado}
                  onChange={() => alternarMiembro(indice, v.id)}
                />
                {v.valor}
              </label>
            ))}
          </div>

          <div className={styles.propuesto}>
            <span>Valor estándar</span>
            <input
              value={estado.valorPropuesto}
              disabled={estado.aplicado}
              onChange={(e) => cambiarPropuesto(indice, e.target.value)}
            />
          </div>

          {estado.error && <p className={styles.estadoError}>{estado.error}</p>}

          <div className={styles.acciones}>
            <Button
              type="button"
              disabled={estado.aplicado || estado.aplicando}
              onClick={() => aplicar(indice)}
            >
              {estado.aplicando ? 'Aplicando…' : estado.aplicado ? 'Aplicado' : 'Aplicar homogenización'}
            </Button>
          </div>
        </div>
      ))}

      <div className={styles.acciones}>
        <Button type="button" variant="secondary" onClick={onCerrar}>
          Volver
        </Button>
      </div>
    </div>
  )
}
