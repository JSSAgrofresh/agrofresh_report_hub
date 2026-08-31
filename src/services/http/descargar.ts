import { httpClient } from './client'

/**
 * Baja un archivo del backend y se lo entrega al navegador.
 *
 * Antes estos archivos se abrían con un `<a href="/api/...">` directo. Eso
 * dejó de funcionar cuando la API pasó a exigir sesión: un enlace lo sigue el
 * navegador por su cuenta, y no hay forma de que lleve el encabezado con el
 * token, así que el servidor responde 401.
 *
 * Acá se pide el archivo como cualquier otra llamada —con el token— y recién
 * cuando llegó completo se le pasa al navegador para que lo guarde. El nombre
 * lo pone el backend en Content-Disposition; `nombrePorDefecto` es solo el
 * respaldo por si no viniera.
 */
export async function descargarArchivo(path: string, nombrePorDefecto: string): Promise<void> {
  const { blob, nombre } = await httpClient.getArchivoConNombre(path)
  const url = URL.createObjectURL(blob)
  try {
    const enlace = document.createElement('a')
    enlace.href = url
    enlace.download = nombre ?? nombrePorDefecto
    enlace.click()
  } finally {
    // Sin esto el navegador se queda con el archivo entero en memoria hasta
    // que se recargue la página.
    URL.revokeObjectURL(url)
  }
}
