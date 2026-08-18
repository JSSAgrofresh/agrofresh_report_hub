import * as XLSX from 'xlsx'
import type { FilaIngest } from './homogenizar'
import { DATE_COLS } from './homogenizar'

/** Algunos encabezados reales vienen con espacios de más (ej. " FDL FINAL ")
 * y no calzan con los nombres exactos que usa el resto del sistema. */
function normalizarClaves(fila: FilaIngest): FilaIngest {
  const out: FilaIngest = {}
  for (const [clave, valor] of Object.entries(fila)) {
    out[clave.trim()] = valor
  }
  return out
}

export async function leerExcel(file: File): Promise<{ rows: FilaIngest[]; headers: string[] }> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]

  const raw = XLSX.utils.sheet_to_json<FilaIngest>(ws, { defval: null, raw: false }).map(normalizarClaves)
  const rawDates = XLSX.utils.sheet_to_json<FilaIngest>(ws, { defval: null, raw: true }).map(normalizarClaves)

  const rows = raw.map((r, i) => {
    const rd = rawDates[i] || {}
    DATE_COLS.forEach((dc) => {
      if (dc in rd) r[dc] = rd[dc]
    })
    return r
  })

  return { rows, headers: Object.keys(raw[0] || {}) }
}

export function descargarExcel(rows: FilaIngest[], headers: string[]): void {
  const ws = XLSX.utils.json_to_sheet(rows, { header: headers })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Homogenizado')
  const now = new Date()
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  XLSX.writeFile(wb, `BASE_DE_DATOS_homogenizada_${ts}.xlsx`)
}
