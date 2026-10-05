/**
 * Piezas puras para escribir listas de correos. Se prueban solas: pegar una
 * lista del Excel o de Outlook tiene que dar siempre el mismo resultado.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function esCorreoValido(valor: string): boolean {
  return EMAIL.test(valor.trim())
}

/** Separa un texto pegado («a@x.cl; b@x.cl», una columna del Excel o el
 * formato de Outlook «"Pérez, Ana" <c@x.cl>») en direcciones. Con «<…>» manda lo
 * que va entre los signos: el nombre puede traer comas o espacios. */
export function separarCorreos(texto: string): string[] {
  if (texto.includes('<')) {
    return Array.from(texto.matchAll(/<([^<>\s]+)>/g), (m) => m[1].trim()).filter(Boolean)
  }
  return texto
    .split(/[\s,;]+/)
    .map((t) => t.replace(/^["']+|["']+$/g, '').trim())
    .filter(Boolean)
}

/** Suma correos a una lista sin repetir (sin importar mayúsculas). */
export function sumarCorreos(actual: string[], nuevos: string[]): string[] {
  const vistos = new Set(actual.map((c) => c.toLowerCase()))
  const salida = [...actual]
  for (const c of nuevos) {
    if (!vistos.has(c.toLowerCase())) {
      vistos.add(c.toLowerCase())
      salida.push(c)
    }
  }
  return salida
}

export function quitarCorreo(actual: string[], correo: string): string[] {
  return actual.filter((c) => c.toLowerCase() !== correo.toLowerCase())
}

export function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
