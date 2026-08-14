export type FilaIngest = Record<string, string | number | null>

export interface CambioHomogenizacion {
  fila: number
  col: string
  orig: unknown
  can: unknown
}

export const DATE_COLS = ['Fecha de muestreo', 'Fecha entrada', 'Fecha análisis', 'Fecha \nSolicitud']
export const FINAL_COLS = ['FDL FINAL', 'IMZ FINAL', 'PYR FINAL', 'TBZ FINAL', 'AZOXFINAL', 'TEBU FINAL', 'DPA FINAL', 'DFN FINAL']

export function parseDate(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') {
    const d = new Date((v - 25569) * 86400 * 1000)
    return d.toISOString().slice(0, 10)
  }
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10)
  }
  if (typeof v === 'string') {
    const s = v.trim()
    const m1 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (m1) return `${m1[3]}-${m1[2]}-${m1[1]}`
    const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`
    return null
  }
  return null
}

export function canonicoCrop(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  return String(v).trim().replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
}

const MAPA_TIPO_SERVICIO: Record<string, string> = {
  'Linea de proceso': 'Linea de Proceso',
  cromatografía: 'Cromatografía',
}

export function canonicoTipoServicio(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return MAPA_TIPO_SERVICIO[s] || s
}

const MAPA_TIPO_APP: Record<string, string> = {
  'ULV AGROFRESH LAB': 'ULV',
  'ASPERSION CAMPO': 'ASPERSIÓN',
  'DIPPING-ASPERSION': 'DIPPING-ASPERSIÓN',
  'DIPPING-ASPERSION ': 'DIPPING-ASPERSIÓN',
  'LP CERA': 'LINEA DE PROCESO',
}

export function canonicoTipoApp(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  if (s === '' || s === '0') return null
  return MAPA_TIPO_APP[s] || s
}

export function canonicoCliente(v: unknown): string | null {
  if (v === null || v === undefined) return null
  return String(v).trim()
}

const MAPA_SUCURSAL: Record<string, string> = {
  'REGION METROPONITANA': 'REGIÓN METROPOLITANA',
  BUN: 'BUIN',
  LINEROS: 'LINDEROS',
  'FRIGORIFICO RIO BLANCO': 'RIO BLANCO',
  'FRIGORIFICO SANTA ANTONIA': 'SANTA ANTONIA',
  CAMARICO: 'CAMARICO SPA',
}

export function canonicoSucursal(v: unknown): string | null {
  if (v === null || v === undefined) return null
  let s = String(v).trim()
  if (s === '') return null
  s = s.replace(/\s+/g, ' ').toUpperCase()
  return MAPA_SUCURSAL[s] || s
}

export function canonicoFinal(v: unknown): string | number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return v
  const s = String(v).trim()
  if (s === '') return null
  if (s.toUpperCase() === 'ND') return 'ND'
  const n = parseFloat(s.replace(',', '.'))
  if (!Number.isNaN(n)) return n
  return null // <L.C, NA, resto → null
}

export function homogenize(rows: FilaIngest[]): { out: FilaIngest[]; changes: CambioHomogenizacion[] } {
  const changes: CambioHomogenizacion[] = []

  const out = rows.map((row, ri) => {
    const r = { ...row }

    const cropOrig = r['CROP']
    const cropCan = canonicoCrop(cropOrig)
    if (String(cropOrig || '').trim() !== String(cropCan || '')) {
      changes.push({ fila: ri + 2, col: 'CROP', orig: cropOrig, can: cropCan })
      r['CROP'] = cropCan
    }

    const tsOrig = r['Tipo de servicio']
    const tsCan = canonicoTipoServicio(tsOrig)
    if (String(tsOrig || '').trim() !== String(tsCan || '')) {
      changes.push({ fila: ri + 2, col: 'Tipo de servicio', orig: tsOrig, can: tsCan })
      r['Tipo de servicio'] = tsCan
    }

    const taOrig = r['TIPO APP']
    const taCan = canonicoTipoApp(taOrig)
    if (String(taOrig || '').trim() !== String(taCan || '')) {
      changes.push({ fila: ri + 2, col: 'TIPO APP', orig: taOrig, can: taCan })
      r['TIPO APP'] = taCan
    }

    const clOrig = r['Cliente']
    const clCan = canonicoCliente(clOrig)
    if (String(clOrig || '') !== String(clCan || '')) {
      changes.push({ fila: ri + 2, col: 'Cliente', orig: clOrig, can: clCan })
      r['Cliente'] = clCan
    }

    const suOrig = r['Sucursal']
    const suCan = canonicoSucursal(suOrig)
    if (String(suOrig || '').trim().toUpperCase().replace(/\s+/g, ' ') !== String(suCan || '')) {
      changes.push({ fila: ri + 2, col: 'Sucursal', orig: suOrig, can: suCan })
      r['Sucursal'] = suCan
    }

    DATE_COLS.forEach((dc) => {
      const dOrig = r[dc]
      const dCan = parseDate(dOrig)
      if (dOrig !== dCan) {
        if (dOrig !== null && dOrig !== undefined) changes.push({ fila: ri + 2, col: dc, orig: dOrig, can: dCan })
        r[dc] = dCan
      }
    })

    FINAL_COLS.forEach((fc) => {
      if (!(fc in r)) return
      const fOrig = r[fc]
      const fCan = canonicoFinal(fOrig)
      if (String(fOrig || '') !== String(fCan || '') && !(fOrig === null && fCan === null)) {
        changes.push({ fila: ri + 2, col: fc, orig: fOrig, can: fCan })
        r[fc] = fCan
      }
    })

    return r
  })

  return { out, changes }
}
