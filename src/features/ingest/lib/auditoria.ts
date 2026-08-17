import type { FilaIngest } from './homogenizar'

export const CAMPO_REQUERIDO: { col: string; etiqueta: string }[] = [
  { col: 'Informe', etiqueta: 'N° de solicitud' },
  { col: 'SOLD TO', etiqueta: 'Cliente (SOLD TO)' },
  { col: 'Fecha de muestreo', etiqueta: 'Fecha de muestreo' },
  { col: 'CROP', etiqueta: 'Especie (CROP)' },
]

export interface Duplicado {
  informe: string
  filas: number[]
}

export interface AlertaCampo {
  fila: number
  col: string
  etiqueta: string
  mensaje: string
}

export interface Auditoria {
  duplicados: Duplicado[]
  alertas: AlertaCampo[]
}

export function auditarParaCarga(rows: FilaIngest[]): Auditoria {
  const porInforme: Record<string, number[]> = {}
  rows.forEach((r, i) => {
    const inf = r['Informe']
    if (inf === null || inf === undefined || String(inf).trim() === '') return
    const k = String(inf).trim()
    ;(porInforme[k] ||= []).push(i)
  })

  const duplicados = Object.entries(porInforme)
    .filter(([, idxs]) => idxs.length > 1)
    .map(([informe, idxs]) => ({ informe, filas: idxs.map((i) => i + 2) }))

  const alertas: AlertaCampo[] = []
  rows.forEach((r, i) => {
    CAMPO_REQUERIDO.forEach(({ col, etiqueta }) => {
      const v = r[col]
      if (v === null || v === undefined || String(v).trim() === '') {
        alertas.push({ fila: i + 2, col, etiqueta, mensaje: `${etiqueta} vacío` })
      }
    })
  })

  return { duplicados, alertas }
}
