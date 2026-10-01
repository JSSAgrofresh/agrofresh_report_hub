import { mismoValor } from './filtros'
import type { Analito, LimiteAnalito } from './tipos'

export interface LimiteResuelto {
  min: number | null
  central: number | null
  max: number | null
}

export type EstadoResultado = 'dentro' | 'sobre' | 'bajo' | 'sin_limite' | 'nd'

const num = (v: number | string | null | undefined) => (v != null && v !== '' ? Number(v) : null)

/** Límite de un analito para una especie y tipo de servicio. Misma cadena que
 * usa el gráfico: combinación exacta → solo especie → solo servicio → general.
 * Sin límites cargados devuelve todo null (nunca se inventa uno). */
export function limiteDeAnalito(
  analitos: Analito[],
  limites: LimiteAnalito[],
  codigo: string | null,
  laboratorio: string | null,
  especie: string | null,
  servicio: string | null,
): LimiteResuelto {
  const vacio = { min: null, central: null, max: null }
  if (!codigo) return vacio
  const candidatos = analitos.filter((a) => a.codigo === codigo)
  const analito = candidatos.find((a) => mismoValor(a.laboratorio, laboratorio)) ?? candidatos[0]
  if (!analito) return vacio
  const propios = limites.filter((l) => l.analito_id === analito.id)
  const e = especie ?? ''
  const s = servicio ?? ''
  const encontrado = [
    propios.find((l) => mismoValor(l.especie, e) && mismoValor(l.tipo_servicio, s)),
    e ? propios.find((l) => mismoValor(l.especie, e) && l.tipo_servicio === '') : undefined,
    s ? propios.find((l) => l.especie === '' && mismoValor(l.tipo_servicio, s)) : undefined,
    propios.find((l) => l.especie === '' && l.tipo_servicio === ''),
  ].find((l) => l !== undefined)
  return {
    min: num(encontrado?.limite_min),
    central: num(encontrado?.limite_central),
    max: num(encontrado?.limite_max),
  }
}

/** Dentro / sobre / bajo el límite; «nd» si el laboratorio no detectó nada. */
export function estadoResultado(valor: number | null, limite: LimiteResuelto): EstadoResultado {
  if (valor == null) return 'nd'
  if (limite.max != null && valor > limite.max) return 'sobre'
  if (limite.min != null && valor < limite.min) return 'bajo'
  return limite.max == null && limite.min == null ? 'sin_limite' : 'dentro'
}
