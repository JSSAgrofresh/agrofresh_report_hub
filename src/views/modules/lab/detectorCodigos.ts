/**
 * Un lector de códigos de barras que funciona en cualquier navegador.
 *
 * Chrome en Android trae `BarcodeDetector` de fábrica y se usa tal cual. El
 * resto (Safari en iPhone, Firefox, Chrome de escritorio…) no lo tiene: ahí se
 * carga el equivalente hecho con ZXing (WebAssembly). Ese motor se baja SOLO
 * cuando hace falta -no pesa en la carga normal de la app- y viene empaquetado
 * con la propia aplicación (no depende de ningún CDN externo).
 */

export const FORMATOS_ESCANER = [
  'code_128', 'code_39', 'ean_13', 'ean_8', 'qr_code', 'data_matrix', 'upc_a', 'upc_e', 'itf', 'codabar',
]

export interface DetectorCodigos {
  detect: (fuente: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>
}

export async function crearDetectorCodigos(): Promise<DetectorCodigos> {
  if ('BarcodeDetector' in window) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Nativo = (window as any).BarcodeDetector as new (o: { formats: string[] }) => DetectorCodigos
      return new Nativo({ formats: FORMATOS_ESCANER })
    } catch {
      // Un Chrome que lo declara pero no lo puede crear: se sigue con ZXing.
    }
  }

  const [{ BarcodeDetector, prepareZXingModule }, wasm] = await Promise.all([
    import('barcode-detector/ponyfill'),
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ])
  prepareZXingModule({
    overrides: {
      locateFile: (ruta: string, prefijo: string) => (ruta.endsWith('.wasm') ? wasm.default : prefijo + ruta),
    },
    fireImmediately: true,
  })
  return new BarcodeDetector({ formats: FORMATOS_ESCANER as never }) as unknown as DetectorCodigos
}
