import { httpClient } from '@/services/http/client'

export type CampoCorreccion = 'sold_to' | 'ship_to' | 'especie' | 'variedad'

/** Una asociación que el Converter aprendió cuando alguien corrigió a mano. */
export interface CorreccionConverter {
  id: number
  campo: CampoCorreccion
  /** el Sold To de una planta, la Especie de una variedad; vacío si no aplica */
  contexto: string
  valor_crudo: string
  valor_oficial: string
  archivo_origen: string | null
  creado_por_nombre: string | null
  creado_por_email: string | null
  creado_en: string
  actualizado_por_nombre: string | null
  actualizado_en: string
  /** cuántas veces el Converter la aplicó solo */
  usos: number
  ultimo_uso: string | null
  /** cuántas veces alguien cambió a qué valor apunta */
  revisiones: number
}

export const ETIQUETA_CAMPO: Record<CampoCorreccion, string> = {
  sold_to: 'Sold To',
  ship_to: 'Ship To',
  especie: 'Especie',
  variedad: 'Variedad',
}

export const ORDEN_CAMPOS: CampoCorreccion[] = ['sold_to', 'ship_to', 'especie', 'variedad']

export function listarCorrecciones() {
  return httpClient.get<CorreccionConverter[]>('/correcciones')
}

export function olvidarCorreccion(id: number) {
  return httpClient.delete<{ ok: boolean }>(`/correcciones/${id}`)
}

function plano(s: string | null | undefined): string {
  return (s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

/** Filtra por campo y por texto (en el valor original, el corregido, el
 * contexto, el archivo y quien la guardó), sin importar tildes ni mayúsculas. */
export function filtrarCorrecciones(
  lista: CorreccionConverter[],
  campo: CampoCorreccion | '',
  texto: string,
): CorreccionConverter[] {
  const q = plano(texto)
  return lista.filter((c) => {
    if (campo && c.campo !== campo) return false
    if (!q) return true
    return [c.valor_crudo, c.valor_oficial, c.contexto, c.archivo_origen, c.creado_por_nombre].some((v) =>
      plano(v).includes(q),
    )
  })
}

export interface ResumenCorrecciones {
  total: number
  /** suma de veces que el sistema corrigió solo */
  aplicadasSolas: number
  /** asociaciones que nunca se han reutilizado */
  sinUsar: number
  porCampo: Record<CampoCorreccion, number>
}

export function resumirCorrecciones(lista: CorreccionConverter[]): ResumenCorrecciones {
  const porCampo: Record<CampoCorreccion, number> = { sold_to: 0, ship_to: 0, especie: 0, variedad: 0 }
  let aplicadasSolas = 0
  let sinUsar = 0
  for (const c of lista) {
    porCampo[c.campo]++
    aplicadasSolas += c.usos
    if (c.usos === 0) sinUsar++
  }
  return { total: lista.length, aplicadasSolas, sinUsar, porCampo }
}
