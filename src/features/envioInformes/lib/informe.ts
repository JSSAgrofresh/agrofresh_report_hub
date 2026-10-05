import { esCorreoValido } from './correos'
import type { DatosCorreo, LecturaInforme, PlanDestinatarios } from './tipos'

export type EstadoInforme = 'listo' | 'enviando' | 'enviado' | 'error'

/** Un informe subido: su PDF, lo que se leyó de él y lo que Paz le cambió. Cada
 * uno es un correo aparte, con su propia lista. */
export interface Informe {
  id: string
  archivo: File
  lectura: LecturaInforme
  soldTo: string
  shipTo: string
  especie: string
  servicio: string
  plan: PlanDestinatarios | null
  para: string[]
  cc: string[]
  bcc: string[]
  /** `null` = lo que da la plantilla. Un texto = corregido solo para este informe. */
  asunto: string | null
  cuerpo: string | null
  estado: EstadoInforme
  mensaje: string | null
}

let contador = 0

export function nuevoInforme(archivo: File, lectura: LecturaInforme): Informe {
  contador += 1
  return {
    id: `${Date.now()}-${contador}`,
    archivo,
    lectura,
    soldTo: lectura.sold_to,
    shipTo: lectura.ship_to,
    especie: lectura.especie,
    servicio: lectura.servicio,
    plan: lectura.plan,
    para: lectura.plan?.to ?? [],
    cc: lectura.plan?.cc ?? [],
    bcc: lectura.plan?.bcc ?? [],
    asunto: null,
    cuerpo: null,
    estado: 'listo',
    mensaje: lectura.error,
  }
}

export function etiquetaServicio(servicio: string): string {
  if (servicio === 'actimist') return 'Actimist'
  if (servicio === 'ecofog') return 'Ecofog'
  return 'Línea de proceso'
}

/** Por qué este informe todavía no se puede enviar (o `null` si está listo). */
export function motivoBloqueo(inf: Informe): string | null {
  if (inf.estado === 'enviado') return 'Ya se envió'
  if (!inf.soldTo || !inf.shipTo) return 'No se leyeron el Sold To y el Ship To'
  if (!inf.para.length) return 'Sin lista de distribución: escribe un correo en Para'
  const malo = [...inf.para, ...inf.cc, ...inf.bcc].find((c) => !esCorreoValido(c))
  if (malo) return `Correo inválido: ${malo}`
  return null
}

export function enviable(inf: Informe): boolean {
  return (inf.estado === 'listo' || inf.estado === 'error') && motivoBloqueo(inf) === null
}

export function datosCorreo(inf: Informe, laboratorio: string): DatosCorreo {
  return {
    laboratorio,
    sold_to: inf.soldTo,
    ship_to: inf.shipTo,
    especie: inf.especie,
    servicio: inf.servicio,
    asunto: inf.asunto,
    cuerpo: inf.cuerpo,
    para: inf.para,
    cc: inf.cc,
    bcc: inf.bcc,
  }
}

/** Un archivo ya subido (mismo nombre y tamaño) no se agrega dos veces. */
export function sinRepetidos(actuales: Informe[], nuevos: File[]): File[] {
  const vistos = new Set(actuales.map((i) => `${i.archivo.name}|${i.archivo.size}`))
  return nuevos.filter((f) => {
    const clave = `${f.name}|${f.size}`
    if (vistos.has(clave)) return false
    vistos.add(clave)
    return true
  })
}
